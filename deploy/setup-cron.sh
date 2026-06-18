#!/usr/bin/env bash
# deploy/setup-cron.sh — instala el systemd timer que dispara las campañas programadas.
# Idempotente. Se corre una vez (o tras cambiar CRON_SECRET).
set -euo pipefail
HOST="${WA_BLAST_HOST:-root@158.220.123.213}"
DIR=/opt/wa-blast
PORT=3010

ssh "$HOST" "bash -s" <<EOF
set -euo pipefail
cd $DIR
# 1) Asegurar CRON_SECRET en .env.local
if ! grep -q '^CRON_SECRET=' .env.local 2>/dev/null; then
  SECRET=\$(openssl rand -hex 24)
  echo "CRON_SECRET=\$SECRET" >> .env.local
  echo "→ CRON_SECRET generado; reinicia wa-blast para que Next lo lea"
  systemctl restart wa-blast
  sleep 3
fi

# 2) Unidades systemd
cat > /etc/systemd/system/wa-blast-cron.service <<UNIT
[Unit]
Description=wa-blast dispara campañas programadas
After=network.target
[Service]
Type=oneshot
EnvironmentFile=$DIR/.env.local
ExecStart=/usr/bin/curl -fsS "http://127.0.0.1:$PORT/api/cron/run-scheduled?secret=\\\${CRON_SECRET}"
UNIT

cat > /etc/systemd/system/wa-blast-cron.timer <<UNIT
[Unit]
Description=Ejecuta wa-blast-cron cada minuto
[Timer]
OnCalendar=*:0/1
Persistent=true
[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now wa-blast-cron.timer
echo "→ timer instalado:"
systemctl list-timers wa-blast-cron.timer --no-pager
EOF
