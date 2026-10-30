#!/bin/bash
# OPS-01: daily DB dump copied off the instance's EBS volume to a backup bucket in another region.
# Runs on the EC2 host (systemd timer crefans-backup.timer). Not enabled until the bucket, the EC2 role
# permission and /etc/crefans-backup.env exist (docs: infra/platform/resilience-runbook.md).
# The dump is compressed and checksummed; the bucket encrypts at rest (SSE-KMS) and keeps versions,
# and the role may only PutObject, so a compromised host cannot delete earlier backups.
set -euo pipefail
: "${BACKUP_BUCKET:?BACKUP_BUCKET required}" "${BACKUP_REGION:?BACKUP_REGION required}"
container=${DB_CONTAINER:-crefans-beta-database-1}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d /var/tmp/crefans-backup.XXXXXX)
trap 'rm -rf "$work"' EXIT
umask 077

docker exec "$container" sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers --no-tablespaces "$MYSQL_DATABASE"' | gzip -9 > "$work/database.sql.gz"
# A dump that is empty or cut short must fail loudly instead of replacing a good copy.
test "$(gzip -dc "$work/database.sql.gz" | head -c 4096 | wc -c)" -gt 0
gzip -dc "$work/database.sql.gz" | tail -n 1 | grep -q "Dump completed"
sha256sum "$work/database.sql.gz" | cut -d' ' -f1 > "$work/database.sql.gz.sha256"

aws() { docker run --rm --network host -v "$work:/work:ro" -e AWS_REGION="$BACKUP_REGION" "${AWS_CLI_IMAGE:-amazon/aws-cli:2.27.50}" "$@"; }
for f in database.sql.gz database.sql.gz.sha256; do
  aws s3 cp "/work/$f" "s3://$BACKUP_BUCKET/db/$stamp/$f" --sse aws:kms --only-show-errors
done
echo "{\"event\":\"backup_offsite_completed\",\"key\":\"db/$stamp\",\"bytes\":$(stat -c %s "$work/database.sql.gz")}"
