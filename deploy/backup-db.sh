#!/usr/bin/env bash
# deploy/backup-db.sh → /usr/local/bin/wa-blast-backup (cron: 30 3 * * *)
set -euo pipefail
mkdir -p /var/backups/wa-blast
sqlite3 /var/lib/wa-blast/data.db ".backup /var/backups/wa-blast/data-$(date +%F).db"
# conservar 14 días
find /var/backups/wa-blast -name 'data-*.db' -mtime +14 -delete
