#!/usr/bin/env bash
# deploy/deploy.sh — desplegar wa-blast a vps-prod-01
set -euo pipefail

HOST="${WA_BLAST_HOST:-root@158.220.123.213}"
DIR=/opt/wa-blast

echo "→ Empaquetando main y subiendo…"
git archive main | ssh "$HOST" "mkdir -p $DIR && tar -x -C $DIR"

echo "→ Build remoto…"
ssh "$HOST" "cd $DIR && \
  bun install --frozen-lockfile && \
  rm -rf .next/cache && \
  bun run build && \
  set -a && . ./.env.local && set +a && \
  bunx drizzle-kit migrate && \
  systemctl restart wa-blast && \
  sleep 3 && systemctl is-active wa-blast"
# (set -a sourcea .env.local porque drizzle-kit NO lo carga solo — sin esto
#  migraría contra el fallback .data/wa-blast.db en vez de /var/lib/wa-blast)

echo "→ Health check…"
code=$(ssh "$HOST" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3010/login")
if [ "$code" = "200" ]; then
  echo "✅ wa-blast desplegado y sirviendo (login $code)"
else
  echo "❌ health check falló (login devolvió $code)"
  exit 1
fi
