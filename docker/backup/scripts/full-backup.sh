#!/bin/bash
set -euo pipefail

# Full backup script - includes all data
source "$(dirname "$0")/backup.sh"

LOG_FILE="/backup/logs/full-backup.log"
echo "$(date): Starting full backup" >> "$LOG_FILE"

# Perform full backup (same as regular for now)
perform_backup "full"

echo "$(date): Full backup completed" >> "$LOG_FILE"
