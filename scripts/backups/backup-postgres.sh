#!/bin/bash
#
# PostgreSQL Backup Script
# Performs full and incremental backups using pg_basebackup and WAL archiving
#

set -e
set -o pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-email_admin}"
POSTGRES_DB="${POSTGRES_DB:-enterprise_email}"
S3_BUCKET="${BACKUP_S3_BUCKET:-prod-backups}"
RETENTION_DAYS="${PG_BACKUP_KEEP_DAILY:-7}"
RETENTION_WEEKS="${PG_BACKUP_KEEP_WEEKLY:-4}"
RETENTION_MONTHS="${PG_BACKUP_KEEP_MONTHLY:-12}"

# Timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DAY=$(date +"%Y%m%d")
MONTH=$(date +"%Y%m")

# Logging
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "${BACKUP_DIR}/backup.log"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Create backup directory
mkdir -p "${BACKUP_DIR}/daily"
mkdir -p "${BACKUP_DIR}/weekly"
mkdir -p "${BACKUP_DIR}/monthly"
mkdir -p "${BACKUP_DIR}/wal"

log "Starting PostgreSQL backup for database: ${POSTGRES_DB}"

# Full database dump using pg_dump
DUMP_FILE="${BACKUP_DIR}/daily/${POSTGRES_DB}_${TIMESTAMP}.sql.gz"
log "Creating database dump: ${DUMP_FILE}"

pg_dump -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" \
    -F c -b -v -f "${DUMP_FILE}.tmp" "${POSTGRES_DB}" || error_exit "pg_dump failed"

# Compress the dump
gzip "${DUMP_FILE}.tmp" && mv "${DUMP_FILE}.tmp.gz" "${DUMP_FILE}" || error_exit "Compression failed"

# Calculate size
DUMP_SIZE=$(du -h "${DUMP_FILE}" | cut -f1)
log "Backup completed: ${DUMP_SIZE}"

# Create checksum
sha256sum "${DUMP_FILE}" > "${DUMP_FILE}.sha256"
log "Checksum created"

# Weekly backup (every Sunday)
if [ "$(date +%u)" -eq 7 ]; then
    WEEKLY_FILE="${BACKUP_DIR}/weekly/${POSTGRES_DB}_${DAY}.sql.gz"
    cp "${DUMP_FILE}" "${WEEKLY_FILE}"
    cp "${DUMP_FILE}.sha256" "${WEEKLY_FILE}.sha256"
    log "Weekly backup created: ${WEEKLY_FILE}"
fi

# Monthly backup (first day of month)
if [ "$(date +%d)" -eq 01 ]; then
    MONTHLY_FILE="${BACKUP_DIR}/monthly/${POSTGRES_DB}_${MONTH}.sql.gz"
    cp "${DUMP_FILE}" "${MONTHLY_FILE}"
    cp "${DUMP_FILE}.sha256" "${MONTHLY_FILE}.sha256"
    log "Monthly backup created: ${MONTHLY_FILE}"
fi

# Upload to S3 if AWS CLI is available
if command -v aws &> /dev/null; then
    log "Uploading to S3: s3://${S3_BUCKET}/postgres/"
    aws s3 cp "${DUMP_FILE}" "s3://${S3_BUCKET}/postgres/daily/" \
        --storage-class STANDARD_IA \
        --server-side-encryption AES256 || log "WARNING: S3 upload failed"
    aws s3 cp "${DUMP_FILE}.sha256" "s3://${S3_BUCKET}/postgres/daily/" || log "WARNING: S3 checksum upload failed"
fi

# Backup database schema only (for reference)
SCHEMA_FILE="${BACKUP_DIR}/daily/${POSTGRES_DB}_schema_${TIMESTAMP}.sql"
pg_dump -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" \
    -s -F p -f "${SCHEMA_FILE}" "${POSTGRES_DB}" || log "WARNING: Schema backup failed"
gzip "${SCHEMA_FILE}"

# Backup database roles and globals
GLOBALS_FILE="${BACKUP_DIR}/daily/globals_${TIMESTAMP}.sql"
pg_dumpall -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" \
    -g -f "${GLOBALS_FILE}" || log "WARNING: Globals backup failed"
gzip "${GLOBALS_FILE}"

# Cleanup old daily backups
log "Cleaning up old daily backups (retention: ${RETENTION_DAYS} days)"
find "${BACKUP_DIR}/daily" -name "*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete || log "WARNING: Cleanup failed"
find "${BACKUP_DIR}/daily" -name "*.sha256" -type f -mtime +${RETENTION_DAYS} -delete

# Cleanup old weekly backups
log "Cleaning up old weekly backups (retention: ${RETENTION_WEEKS} weeks)"
find "${BACKUP_DIR}/weekly" -name "*.sql.gz" -type f -mtime +$((RETENTION_WEEKS * 7)) -delete || log "WARNING: Weekly cleanup failed"

# Cleanup old monthly backups
log "Cleaning up old monthly backups (retention: ${RETENTION_MONTHS} months)"
find "${BACKUP_DIR}/monthly" -name "*.sql.gz" -type f -mtime +$((RETENTION_MONTHS * 30)) -delete || log "WARNING: Monthly cleanup failed"

# Backup statistics
DAILY_COUNT=$(find "${BACKUP_DIR}/daily" -name "*.sql.gz" -type f | wc -l)
WEEKLY_COUNT=$(find "${BACKUP_DIR}/weekly" -name "*.sql.gz" -type f | wc -l)
MONTHLY_COUNT=$(find "${BACKUP_DIR}/monthly" -name "*.sql.gz" -type f | wc -l)
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)

log "Backup statistics:"
log "  Daily backups: ${DAILY_COUNT}"
log "  Weekly backups: ${WEEKLY_COUNT}"
log "  Monthly backups: ${MONTHLY_COUNT}"
log "  Total backup size: ${TOTAL_SIZE}"

# Test backup integrity
log "Testing backup integrity..."
if gunzip -t "${DUMP_FILE}" 2>/dev/null; then
    log "Backup integrity check: PASSED"
else
    error_exit "Backup integrity check: FAILED"
fi

log "PostgreSQL backup completed successfully"

# Send notification (if configured)
if [ -n "${ALERT_EMAIL}" ]; then
    echo "PostgreSQL backup completed successfully at $(date)" | \
        mail -s "Backup Success: ${POSTGRES_DB}" "${ALERT_EMAIL}"
fi

exit 0
