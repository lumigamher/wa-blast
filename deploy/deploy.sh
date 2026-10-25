#!/usr/bin/env bash
# deploy/deploy.sh — desplegar wa-blast a vps-prod-01
set -euo pipefail

HOST="${WA_BLAST_HOST:-root@158.220.123.213}"
DIR=/opt/wa-blast

echo "→ Empaquetando main y subiendo…"
# rm -rf src/drizzle antes de extraer: tar no borra archivos movidos/renombrados
# (sin esto, un page.tsx viejo puede chocar con el nuevo y romper el build)
git archive main | ssh "$HOST" "mkdir -p $DIR && rm -rf $DIR/src $DIR/drizzle && tar -x -C $DIR"

# El build corre como root pero el servicio corre como wablast: sin el chown,
# Next no puede crear .next/cache/images y cada imagen se re-optimiza en cada
# petición (EACCES en bucle en el journal).
echo "→ Build remoto…"
# Se compila en .next-build y se intercambia al final: si se compila sobre .next
# en caliente, el servidor pierde sus manifests y devuelve 500 durante todo el
# build (~70 s). El intercambio + restart dura ~3 s.
ssh "$HOST" "cd $DIR && \
  bun install --frozen-lockfile && \
  rm -rf .next-build && \
  NEXT_DIST_DIR=.next-build bun run build && \
  set -a && . ./.env.local && set +a && \
  { test -f \"\$DATABASE_URL\" || { echo \"DATABASE_URL no existe: \$DATABASE_URL\" >&2; false; }; } && \
  mkdir -p /var/backups/wa-blast && \
  BK=/var/backups/wa-blast/pre-migrate-\$(date +%Y%m%d-%H%M%S).db && \
  (umask 077 && sqlite3 \"\$DATABASE_URL\" \".backup '\$BK'\") && \
  chmod 600 \"\$BK\" && \
  (ls -1t /var/backups/wa-blast/pre-migrate-*.db | tail -n +6 | xargs -r rm -f) && \
  bun run db:migrate && \
  chown -R wablast:wablast .next-build && \
  rm -rf .next-old && mv .next .next-old && mv .next-build .next && \
  systemctl restart wa-blast && \
  sleep 3 && systemctl is-active wa-blast"
# (set -a sourcea .env.local porque drizzle-kit NO lo carga solo — sin esto
#  migraría contra el fallback .data/wa-blast.db en vez de /var/lib/wa-blast)
# Backup pre-migrate: usa $DATABASE_URL de .env.local (la misma fuente que lee
# el servicio vía Next; el unit de systemd no define la ruta). Como corre con
# `&&` bajo el shell remoto, si sqlite3 falla NO se migra ni se hace swap y el
# ssh devuelve error -> `set -e` local aborta el deploy. Se guarda fuera de
# $DIR (no lo toca el swap) en /var/backups/wa-blast, mismo sqlite3 .backup que
# deploy/backup-db.sh, modo 600 (root; el deploy corre como root). Retención:
# últimos 5 pre-migrate-*.db (los data-*.db del cron diario no se tocan).

echo "→ Health check…"
code=$(ssh "$HOST" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3010/login")
if [ "$code" = "200" ]; then
  echo "✅ wa-blast desplegado y sirviendo (login $code)"
else
  echo "❌ health check falló (login devolvió $code)"
  exit 1
fi
