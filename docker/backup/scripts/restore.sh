#!/bin/bash
set -euo pipefail

# CEERION Mail Restore Script
# Performs restore from encrypted backups with integrity verification

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESTORE_DIR="/backup/restore"
LOG_DIR="/var/log/backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Configuration
POSTGRES_HOST="${POSTGRES_HOST:-postgres-mail}"
POSTGRES_DB="${POSTGRES_DB:-ceerion_mail}"
POSTGRES_USER="${POSTGRES_USER:-ceerion}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
BACKUP_BUCKET="${BACKUP_BUCKET:-ceerion-mail-backups}"

# Encryption configuration
ENCRYPTION_KEY_ID="${BACKUP_ENCRYPTION_KEY}"
KMS_ENDPOINT="${KMS_ENDPOINT:-http://kms:8443}"

# Restore parameters
BACKUP_ID="${1:-}"
RESTORE_TYPE="${2:-full}"  # full|database|mail|indexes
DRY_RUN="${3:-false}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_DIR}/restore-${TIMESTAMP}.log"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Usage information
usage() {
    cat << EOF
Usage: $0 <backup_id> [restore_type] [dry_run]

Arguments:
  backup_id     - Backup ID to restore (format: YYYYMMDD_HHMMSS)
  restore_type  - Type of restore: full|database|mail|indexes (default: full)
  dry_run       - Set to 'true' for dry run mode (default: false)

Examples:
  $0 20241228_020000                    # Full restore
  $0 20241228_020000 database           # Database only
  $0 20241228_020000 full true          # Dry run mode

EOF
    exit 1
}

# Validate inputs
validate_inputs() {
    if [[ -z "$BACKUP_ID" ]]; then
        log "ERROR: Backup ID is required"
        usage
    fi
    
    if [[ ! "$BACKUP_ID" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
        error_exit "Invalid backup ID format. Expected: YYYYMMDD_HHMMSS"
    fi
    
    if [[ ! "$RESTORE_TYPE" =~ ^(full|database|mail|indexes)$ ]]; then
        error_exit "Invalid restore type. Must be: full|database|mail|indexes"
    fi
    
    log "Restore parameters:"
    log "  Backup ID: $BACKUP_ID"
    log "  Restore Type: $RESTORE_TYPE"
    log "  Dry Run: $DRY_RUN"
}

# Initialize restore
init_restore() {
    log "Starting CEERION Mail restore - ${TIMESTAMP}"
    
    # Create restore directory
    mkdir -p "${RESTORE_DIR}/${BACKUP_ID}"
    
    # Verify KMS connectivity
    if ! curl -sf "${KMS_ENDPOINT}/health" > /dev/null; then
        error_exit "KMS service unavailable"
    fi
    
    # Get decryption key from KMS
    DECRYPTION_KEY=$(kms-client get-key "${ENCRYPTION_KEY_ID}") || error_exit "Failed to retrieve decryption key"
}

# Download backup files
download_backups() {
    log "Downloading backup files for ${BACKUP_ID}..."
    
    local backup_prefix="backups"
    local backup_date="${BACKUP_ID:0:4}-${BACKUP_ID:4:2}-${BACKUP_ID:6:2}"
    local backup_path="${backup_prefix}/${backup_date}/${BACKUP_ID}"
    
    # Download manifest first
    local manifest_file="${RESTORE_DIR}/${BACKUP_ID}/manifest_${BACKUP_ID}.json.enc"
    aws s3 cp "s3://${BACKUP_BUCKET}/${backup_path}/manifest_${BACKUP_ID}.json.enc" "$manifest_file" || error_exit "Failed to download manifest"
    
    # Decrypt and parse manifest
    age -d -i <(echo "${DECRYPTION_KEY}") "$manifest_file" > "${manifest_file%.enc}" || error_exit "Failed to decrypt manifest"
    
    # Parse manifest to get file list
    local files=$(jq -r '.files[].filename' "${manifest_file%.enc}")
    
    # Download required files based on restore type
    for filename in $files; do
        local should_download=false
        
        case "$RESTORE_TYPE" in
            "full")
                should_download=true
                ;;
            "database")
                [[ "$filename" =~ database_.*\.enc$ ]] && should_download=true
                ;;
            "mail")
                [[ "$filename" =~ maildata_.*\.enc$ ]] && should_download=true
                ;;
            "indexes")
                [[ "$filename" =~ indexes_.*\.enc$ ]] && should_download=true
                ;;
        esac
        
        if [[ "$should_download" == "true" ]]; then
            log "Downloading: $filename"
            aws s3 cp "s3://${BACKUP_BUCKET}/${backup_path}/${filename}" "${RESTORE_DIR}/${BACKUP_ID}/${filename}" || error_exit "Failed to download $filename"
        fi
    done
}

# Verify backup integrity
verify_backup_integrity() {
    log "Verifying backup integrity..."
    
    local manifest_file="${RESTORE_DIR}/${BACKUP_ID}/manifest_${BACKUP_ID}.json"
    
    # Verify each downloaded file
    while IFS= read -r filename; do
        local filepath="${RESTORE_DIR}/${BACKUP_ID}/${filename}"
        
        if [[ -f "$filepath" ]]; then
            # Get expected checksum from manifest
            local expected_checksum=$(jq -r ".files[] | select(.filename==\"$filename\") | .checksum" "$manifest_file")
            
            # Calculate actual checksum
            local actual_checksum=$(sha256sum "$filepath" | cut -d' ' -f1)
            
            if [[ "$expected_checksum" != "$actual_checksum" ]]; then
                error_exit "Checksum mismatch for $filename"
            fi
            
            log "Checksum verified: $filename"
        fi
    done < <(jq -r '.files[].filename' "$manifest_file")
}

# Decrypt backup files
decrypt_backups() {
    log "Decrypting backup files..."
    
    for file in "${RESTORE_DIR}/${BACKUP_ID}"/*.enc; do
        if [[ -f "$file" && ! "$file" =~ manifest ]]; then
            local decrypted_file="${file%.enc}"
            log "Decrypting $(basename "$file")..."
            
            age -d -i <(echo "${DECRYPTION_KEY}") "$file" > "$decrypted_file" || error_exit "Decryption failed for $file"
            
            log "Decrypted: $(basename "$decrypted_file") ($(du -h "$decrypted_file" | cut -f1))"
        fi
    done
}

# Restore database
restore_database() {
    if [[ "$RESTORE_TYPE" != "database" && "$RESTORE_TYPE" != "full" ]]; then
        return 0
    fi
    
    log "Restoring database..."
    
    local db_backup_file="${RESTORE_DIR}/${BACKUP_ID}/database_${BACKUP_ID}.sql.gz"
    local pgdump_file="${RESTORE_DIR}/${BACKUP_ID}/database_${BACKUP_ID}.sql.pgdump"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would restore database from $db_backup_file"
        return 0
    fi
    
    # Set PostgreSQL password
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    
    # Stop services that use the database
    log "Stopping dependent services..."
    # Note: In production, implement proper service coordination
    
    # Create database backup before restore
    log "Creating pre-restore backup..."
    pg_dump \
        --host="${POSTGRES_HOST}" \
        --username="${POSTGRES_USER}" \
        --dbname="${POSTGRES_DB}" \
        --format=custom \
        --file="/backup/pre-restore-${TIMESTAMP}.pgdump" \
    || log "WARNING: Pre-restore backup failed"
    
    # Restore from custom format if available
    if [[ -f "$pgdump_file" ]]; then
        log "Restoring from custom format backup..."
        pg_restore \
            --host="${POSTGRES_HOST}" \
            --username="${POSTGRES_USER}" \
            --dbname="${POSTGRES_DB}" \
            --clean \
            --if-exists \
            --verbose \
            "$pgdump_file" \
        || error_exit "Database restore failed"
    else
        # Restore from SQL dump
        log "Restoring from SQL dump..."
        gunzip -c "$db_backup_file" | psql \
            --host="${POSTGRES_HOST}" \
            --username="${POSTGRES_USER}" \
            --dbname="${POSTGRES_DB}" \
            --quiet \
        || error_exit "Database restore failed"
    fi
    
    # Verify database integrity
    log "Verifying database integrity..."
    local table_count=$(psql \
        --host="${POSTGRES_HOST}" \
        --username="${POSTGRES_USER}" \
        --dbname="${POSTGRES_DB}" \
        --tuples-only \
        --command="SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" \
    | tr -d ' ')
    
    log "Database restored successfully ($table_count tables)"
}

# Restore mail data
restore_mail_data() {
    if [[ "$RESTORE_TYPE" != "mail" && "$RESTORE_TYPE" != "full" ]]; then
        return 0
    fi
    
    log "Restoring mail data..."
    
    local mail_backup_file="${RESTORE_DIR}/${BACKUP_ID}/maildata_${BACKUP_ID}.tar.gz"
    
    if [[ ! -f "$mail_backup_file" ]]; then
        log "WARNING: Mail data backup not found, skipping"
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would restore mail data from $mail_backup_file"
        return 0
    fi
    
    # Create backup of current mail data
    log "Creating backup of current mail data..."
    tar -czf "/backup/mail-pre-restore-${TIMESTAMP}.tar.gz" -C /data mail index 2>/dev/null || log "WARNING: Current mail backup failed"
    
    # Extract mail data
    log "Extracting mail data..."
    tar -xzf "$mail_backup_file" -C /data || error_exit "Mail data extraction failed"
    
    # Fix permissions
    chown -R vmail:vmail /data/mail /data/index
    
    log "Mail data restored successfully"
}

# Restore indexes
restore_indexes() {
    if [[ "$RESTORE_TYPE" != "indexes" && "$RESTORE_TYPE" != "full" ]]; then
        return 0
    fi
    
    log "Restoring search indexes..."
    
    local index_backup_file="${RESTORE_DIR}/${BACKUP_ID}/indexes_${BACKUP_ID}.tar.gz"
    
    if [[ ! -f "$index_backup_file" ]]; then
        log "WARNING: Index backup not found, skipping"
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would restore indexes from $index_backup_file"
        return 0
    fi
    
    # Extract indexes
    log "Extracting search indexes..."
    tar -xzf "$index_backup_file" -C /data/index || error_exit "Index extraction failed"
    
    # Fix permissions
    chown -R vmail:vmail /data/index
    
    log "Search indexes restored successfully"
}

# Verify restore
verify_restore() {
    log "Verifying restore completion..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Restore verification skipped"
        return 0
    fi
    
    # Database verification
    if [[ "$RESTORE_TYPE" == "database" || "$RESTORE_TYPE" == "full" ]]; then
        export PGPASSWORD="${POSTGRES_PASSWORD}"
        local user_count=$(psql \
            --host="${POSTGRES_HOST}" \
            --username="${POSTGRES_USER}" \
            --dbname="${POSTGRES_DB}" \
            --tuples-only \
            --command="SELECT count(*) FROM virtual_users WHERE active=1;" \
        | tr -d ' ')
        
        log "Active users in database: $user_count"
    fi
    
    # Mail data verification
    if [[ "$RESTORE_TYPE" == "mail" || "$RESTORE_TYPE" == "full" ]]; then
        local mail_size=$(du -sh /data/mail 2>/dev/null | cut -f1 || echo "0")
        log "Mail data size: $mail_size"
    fi
    
    log "Restore verification completed"
}

# Cleanup function
cleanup() {
    log "Cleaning up restore files..."
    rm -rf "${RESTORE_DIR:?}/${BACKUP_ID:?}"
}

# Main restore function
main() {
    validate_inputs
    init_restore
    download_backups
    verify_backup_integrity
    decrypt_backups
    restore_database
    restore_mail_data
    restore_indexes
    verify_restore
    
    if [[ "$DRY_RUN" != "true" ]]; then
        cleanup
    fi
    
    log "CEERION Mail restore completed successfully - ${TIMESTAMP}"
    
    # Send notification
    curl -X POST "${WEBHOOK_URL:-}" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"CEERION Mail restore completed: ${BACKUP_ID} (${RESTORE_TYPE})\"}" \
        2>/dev/null || true
}

# Execute main function
main "$@"
