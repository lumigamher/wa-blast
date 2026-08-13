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
ssh "$HOST" "cd $DIR && \
  bun install --frozen-lockfile && \
  rm -rf .next/cache && \
  bun run build && \
  set -a && . ./.env.local && set +a && \
  bun run db:migrate && \
  chown -R wablast:wablast .next && \
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
