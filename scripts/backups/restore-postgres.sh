#!/bin/bash
#
# PostgreSQL Restore Script
# Restores database from backup file
#

set -e
set -o pipefail

# Configuration
BACKUP_FILE="${1:-}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-email_admin}"
POSTGRES_DB="${POSTGRES_DB:-enterprise_email}"
RESTORE_TO_DB="${2:-${POSTGRES_DB}}"

# Logging
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Usage
usage() {
    echo "Usage: $0 <backup_file> [target_database]"
    echo "Example: $0 /backups/postgres/daily/enterprise_email_20260129_020000.sql.gz"
    echo "Example: $0 /backups/postgres/daily/enterprise_email_20260129_020000.sql.gz enterprise_email_restore"
    exit 1
}

[ -z "${BACKUP_FILE}" ] && usage

# Check if backup file exists
[ ! -f "${BACKUP_FILE}" ] && error_exit "Backup file not found: ${BACKUP_FILE}"

log "Starting PostgreSQL restore"
log "Backup file: ${BACKUP_FILE}"
log "Target database: ${RESTORE_TO_DB}"
log "PostgreSQL host: ${POSTGRES_HOST}:${POSTGRES_PORT}"

# Verify backup checksum if available
if [ -f "${BACKUP_FILE}.sha256" ]; then
    log "Verifying backup checksum..."
    if sha256sum -c "${BACKUP_FILE}.sha256"; then
        log "Checksum verification: PASSED"
    else
        error_exit "Checksum verification: FAILED"
    fi
fi

# Test backup integrity
log "Testing backup file integrity..."
if [[ "${BACKUP_FILE}" == *.gz ]]; then
    gunzip -t "${BACKUP_FILE}" || error_exit "Backup file is corrupted"
fi
log "Backup file integrity: OK"

# Confirm restore operation
read -p "This will OVERWRITE database '${RESTORE_TO_DB}'. Continue? (yes/no): " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
    log "Restore cancelled by user"
    exit 0
fi

# Create backup of current database before restore
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
SAFETY_BACKUP="/tmp/${RESTORE_TO_DB}_before_restore_${TIMESTAMP}.sql.gz"
log "Creating safety backup of current database: ${SAFETY_BACKUP}"
pg_dump -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" \
    -F c -b -f "${SAFETY_BACKUP}" "${RESTORE_TO_DB}" || log "WARNING: Safety backup failed"

# Terminate existing connections to the database
log "Terminating existing connections..."
psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d postgres <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${RESTORE_TO_DB}' AND pid <> pg_backend_pid();
EOF

# Drop and recreate database
log "Dropping database: ${RESTORE_TO_DB}"
dropdb -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" \
    --if-exists "${RESTORE_TO_DB}" || error_exit "Failed to drop database"

log "Creating database: ${RESTORE_TO_DB}"
createdb -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" \
    "${RESTORE_TO_DB}" || error_exit "Failed to create database"

# Restore the database
log "Restoring database from: ${BACKUP_FILE}"
if [[ "${BACKUP_FILE}" == *.gz ]]; then
    gunzip -c "${BACKUP_FILE}" | pg_restore -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" \
        -U "${POSTGRES_USER}" -d "${RESTORE_TO_DB}" -v || error_exit "Restore failed"
else
    pg_restore -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" \
        -d "${RESTORE_TO_DB}" -v "${BACKUP_FILE}" || error_exit "Restore failed"
fi

# Verify restore
log "Verifying restore..."
TABLES_COUNT=$(psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" \
    -d "${RESTORE_TO_DB}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
log "Restored ${TABLES_COUNT} tables"

if [ "${TABLES_COUNT}" -gt 0 ]; then
    log "Restore verification: PASSED"
else
    error_exit "Restore verification: FAILED (no tables found)"
fi

# Update statistics
log "Analyzing database..."
psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" \
    -d "${RESTORE_TO_DB}" -c "ANALYZE;" || log "WARNING: ANALYZE failed"

log "PostgreSQL restore completed successfully"
log "Safety backup saved at: ${SAFETY_BACKUP}"

# Send notification (if configured)
if [ -n "${ALERT_EMAIL}" ]; then
    echo "PostgreSQL restore completed successfully at $(date)" | \
        mail -s "Restore Success: ${RESTORE_TO_DB}" "${ALERT_EMAIL}"
fi

exit 0
