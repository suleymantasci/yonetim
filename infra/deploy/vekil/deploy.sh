#!/bin/sh
# vekil.tasci.cloud deploy — CI'nin SSH ile çalıştırabildiği TEK komut.
#
# Sunucuda /docker/yonetim/deploy.sh olarak durur. GitHub Actions'ın deploy
# anahtarı authorized_keys'te `command="/docker/yonetim/deploy.sh",restrict`
# ile kısıtlı: anahtar sızsa bile bu betikten başka bir şey çalıştıramaz.
# İstemcinin gönderdiği komut (SSH_ORIGINAL_COMMAND) yok sayılır.
#
# ghcr.io girişi sunucunun kendi docker kimlik bilgisiyle yapılıyor
# (/root/.docker/config.json); CI'den token taşınmıyor.
set -eu
cd /docker/yonetim

exec 9>/docker/yonetim/.deploy.lock
flock -w 600 9

echo "[deploy] $(date -Is) imajlar çekiliyor"
docker compose pull --quiet api worker app web
# api açılışta advisory lock'lu migration koşuyor; worker/app api sağlıklı
# olmadan başlamıyor (depends_on: service_healthy).
docker compose up -d --remove-orphans --wait --wait-timeout 300
docker image prune -f >/dev/null
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
echo "[deploy] tamam"
