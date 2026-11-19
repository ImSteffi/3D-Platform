#!/bin/sh
# One-time preparation of a fresh Ubuntu server: updates, Docker, swap, firewall, app folder.
# Safe to run again: every step checks whether it is already done.
set -eu
export DEBIAN_FRONTEND=noninteractive

apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade
apt-get -y -q install unattended-upgrades
# Security updates install themselves.
dpkg-reconfigure -f noninteractive unattended-upgrades

command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

# Spare memory on disk, so a busy moment does not stop the app.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Only SSH and the web are open.
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

# Keys only: no password logins over SSH.
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true

mkdir -p /opt/platform
echo "--- done"
docker --version
free -h | head -3
ufw status | head -8
