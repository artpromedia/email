#!/bin/bash
set -euo pipefail

# Health check for backup service
LOG_FILE="/backup/logs/health.log"
echo "$(date): Backup service health check" >> "$LOG_FILE"

# Check if cron is running
if ! pgrep -x "cron" > /dev/null; then
    echo "ERROR: Cron daemon not running" >> "$LOG_FILE"
    exit 1
fi

# Check backup directories exist
for dir in scripts staging logs keys; do
    if [[ ! -d "/backup/$dir" ]]; then
        echo "ERROR: Directory /backup/$dir missing" >> "$LOG_FILE"
        exit 1
    fi
done

# Check if last backup was recent (within 25 hours)
LAST_BACKUP="/backup/logs/last-backup.timestamp"
if [[ -f "$LAST_BACKUP" ]]; then
    LAST=$(cat "$LAST_BACKUP")
    NOW=$(date +%s)
    DIFF=$((NOW - LAST))
    if [[ $DIFF -gt 90000 ]]; then  # 25 hours
        echo "WARNING: Last backup older than 25 hours" >> "$LOG_FILE"
    fi
fi

echo "$(date): Health check passed" >> "$LOG_FILE"
exit 0
