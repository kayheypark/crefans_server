#!/usr/bin/env bash
# EC2 user-data for a new Ubuntu 24.04 host. Contains no application secrets.
set -euo pipefail
test "$(id -u)" -eq 0
. /etc/os-release
test "$ID" = ubuntu && test "$VERSION_ID" = 24.04
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
install -m 0755 -d /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{"log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"}}
EOF
systemctl enable --now docker
systemctl restart docker
# Keep password and root SSH login disabled; access uses the existing EC2 key.
cat > /etc/ssh/sshd_config.d/00-crefans-beta.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t
systemctl reload ssh
install -d -m 0700 -o ubuntu -g ubuntu /opt/crefans
# Small emergency swap on the encrypted root EBS, not additional storage.
if ! test -f /swapfile; then
  fallocate -l 2G /swapfile
  chmod 0600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
touch /opt/crefans/bootstrap-ready
