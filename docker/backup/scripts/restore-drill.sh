#!/bin/bash
set -euo pipefail

# Restore drill - test backup integrity monthly
LOG_FILE="/backup/logs/restore-drill.log"
DRILL_DIR="/backup/staging/drill-$(date +%Y%m%d)"

echo "$(date): Starting restore drill" >> "$LOG_FILE"

# Create drill directory
mkdir -p "$DRILL_DIR"

# Find latest backup
LATEST_BACKUP=$(find /backup/staging -name "backup-*.tar.gz.enc" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)

if [[ -z "$LATEST_BACKUP" ]]; then
    echo "ERROR: No backup files found for drill" >> "$LOG_FILE"
    exit 1
fi

echo "Testing restore of: $LATEST_BACKUP" >> "$LOG_FILE"

# Test decryption and extraction
if /backup/scripts/test-restore.sh "$LATEST_BACKUP" "$DRILL_DIR"; then
    echo "SUCCESS: Restore drill passed" >> "$LOG_FILE"
    rm -rf "$DRILL_DIR"
else
    echo "FAILURE: Restore drill failed" >> "$LOG_FILE"
    exit 1
fi

echo "$(date): Restore drill completed successfully" >> "$LOG_FILE"
