#!/bin/bash
set -euo pipefail

# Monitor backup service
LOG_FILE="/backup/logs/monitor.log"

while true; do
    echo "$(date): Monitoring backup service..." >> "$LOG_FILE"
    
    # Check disk space
    USAGE=$(df /backup | tail -1 | awk '{print $5}' | sed 's/%//')
    if [[ $USAGE -gt 90 ]]; then
        echo "WARNING: Backup disk usage at ${USAGE}%" >> "$LOG_FILE"
    fi
    
    # Clean old logs (keep 30 days)
    find /backup/logs -name "*.log" -type f -mtime +30 -delete
    
    # Sleep for 1 hour
    sleep 3600
done
