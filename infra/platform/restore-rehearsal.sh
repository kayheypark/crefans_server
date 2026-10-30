#!/bin/bash
# OPS-01: restore a DB dump into a throwaway MySQL container and check that the data is usable.
# Never points at the production database. Usage: restore-rehearsal.sh <database.sql or .sql.gz> [expected.sha256]
# Prints one JSON line: timings (RTO input), latest business timestamp (RPO input) and integrity checks.
set -euo pipefail
dump=${1:?dump file required}
name=crefans-restore-rehearsal-$$
password=$(head -c 24 /dev/urandom | base64 | tr -dc A-Za-z0-9)
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
if [ -n "${2:-}" ]; then test "$(sha256sum "$dump" | cut -d' ' -f1)" = "$(cut -d' ' -f1 < "$2")"; fi

started=$(date +%s)
docker run -d --name "$name" -e MYSQL_ROOT_PASSWORD="$password" -e MYSQL_DATABASE=restore "${MYSQL_IMAGE:-mysql:8.0}" >/dev/null
# TCP ping: the image's temporary init server listens on the socket only, so this waits for the real server.
until docker exec -e MYSQL_PWD="$password" "$name" mysqladmin ping -h127.0.0.1 -uroot --silent >/dev/null 2>&1; do sleep 2; done
ready=$(date +%s)
case "$dump" in *.gz) gzip -dc "$dump" ;; *) cat "$dump" ;; esac | docker exec -i -e MYSQL_PWD="$password" "$name" mysql -h127.0.0.1 -uroot restore
loaded=$(date +%s)

q() { docker exec -e MYSQL_PWD="$password" "$name" mysql -h127.0.0.1 -uroot -N -B restore -e "$1"; }
# Each check is an invariant the service relies on; a non-zero failure count means the copy is not usable as is.
migrations=$(q "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
failed_migrations=$(q "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL")
ledger_unbalanced=$(q "SELECT COUNT(*) FROM (SELECT movement_id FROM bean_entries GROUP BY movement_id HAVING SUM(delta)<>0) x")
negative_balances=$(q "SELECT COUNT(*) FROM bean_accounts WHERE balance<0 AND bucket NOT IN ('stock','charge-reserved','issued')")
orphan_revenue=$(q "SELECT COUNT(*) FROM revenue_entries r LEFT JOIN checkout_orders o ON o.id=r.order_id WHERE r.order_id IS NOT NULL AND o.id IS NULL")
paid_without_revenue=$(q "SELECT COUNT(*) FROM checkout_orders o LEFT JOIN revenue_entries r ON r.order_id=o.id WHERE o.status IN ('paid','refunded') AND r.id IS NULL")
members=$(q "SELECT COUNT(*) FROM members")
admins=$(q "SELECT COUNT(*) FROM admins WHERE is_active=1")
latest=$(q "SELECT GREATEST(COALESCE((SELECT MAX(occurred_at) FROM platform_audit_logs),'1970-01-01'),COALESCE((SELECT MAX(created_at) FROM checkout_orders),'1970-01-01'))")
finished=$(date +%s)

failures=$((failed_migrations + ledger_unbalanced + negative_balances + orphan_revenue + paid_without_revenue))
printf '{"event":"restore_rehearsal","failures":%d,"startSeconds":%d,"loadSeconds":%d,"checkSeconds":%d,"migrations":%s,"failedMigrations":%s,"ledgerUnbalancedMovements":%s,"negativeBalances":%s,"orphanRevenue":%s,"paidWithoutRevenue":%s,"members":%s,"activeAdmins":%s,"latestRecord":"%s"}\n' \
  "$failures" $((ready-started)) $((loaded-ready)) $((finished-loaded)) "$migrations" "$failed_migrations" "$ledger_unbalanced" "$negative_balances" "$orphan_revenue" "$paid_without_revenue" "$members" "$admins" "$latest"
test "$failures" -eq 0
