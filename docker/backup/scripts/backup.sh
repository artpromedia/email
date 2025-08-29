#!/bin/bash
set -euo pipefail

# CEERION Mail Backup Script
# Performs encrypted logical backups of PostgreSQL and mail data

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/backup/staging"
LOG_DIR="/var/log/backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DATE=$(date +%Y-%m-%d)

# Configuration
POSTGRES_HOST="${POSTGRES_HOST:-postgres-mail}"
POSTGRES_DB="${POSTGRES_DB:-ceerion_mail}"
POSTGRES_USER="${POSTGRES_USER:-ceerion}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
BACKUP_BUCKET="${BACKUP_BUCKET:-ceerion-mail-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESSION_LEVEL="${COMPRESSION_LEVEL:-9}"

# Encryption configuration
ENCRYPTION_KEY_ID="${BACKUP_ENCRYPTION_KEY}"
KMS_ENDPOINT="${KMS_ENDPOINT:-http://kms:8443}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_DIR}/backup-${BACKUP_DATE}.log"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Cleanup function
cleanup() {
    log "Cleaning up temporary files..."
    rm -rf "${BACKUP_DIR:?}/${TIMESTAMP:?}"*
}
trap cleanup EXIT

# Main backup function
perform_backup() {
    local backup_type="${1:-incremental}"
    log "Performing ${backup_type} backup"
    
    init_backup
    backup_postgres
    backup_mail_data
    backup_configuration
    backup_dkim_keys
    
    # Create final archive
    create_encrypted_archive
    
    # Upload to storage
    upload_backup
    
    # Cleanup old backups
    cleanup_old_backups
    
    log "Backup completed successfully"
    echo "$(date +%s)" > "/backup/logs/last-backup.timestamp"
}
init_backup() {
    log "Starting CEERION Mail backup - ${TIMESTAMP}"
    
    # Create staging directory
    mkdir -p "${BACKUP_DIR}/${TIMESTAMP}"
    
    # Verify KMS connectivity
    if ! curl -sf "${KMS_ENDPOINT}/health" > /dev/null; then
        error_exit "KMS service unavailable"
    fi
    
    # Get encryption key from KMS
    ENCRYPTION_KEY=$(kms-client get-key "${ENCRYPTION_KEY_ID}") || error_exit "Failed to retrieve encryption key"
}

# Database backup
backup_database() {
    log "Starting database backup..."
    
    local db_backup_file="${BACKUP_DIR}/${TIMESTAMP}/database_${TIMESTAMP}.sql"
    
    # Set PostgreSQL password
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    
    # Create logical backup
    pg_dump \
        --host="${POSTGRES_HOST}" \
        --username="${POSTGRES_USER}" \
        --dbname="${POSTGRES_DB}" \
        --verbose \
        --clean \
        --if-exists \
        --create \
        --format=custom \
        --compress="${COMPRESSION_LEVEL}" \
        --file="${db_backup_file}.pgdump" \
    || error_exit "Database backup failed"
    
    # Also create SQL dump for portability
    pg_dump \
        --host="${POSTGRES_HOST}" \
        --username="${POSTGRES_USER}" \
        --dbname="${POSTGRES_DB}" \
        --verbose \
        --clean \
        --if-exists \
        --create \
        --format=plain \
        --file="${db_backup_file}" \
    || error_exit "SQL dump failed"
    
    # Compress SQL dump
    gzip -"${COMPRESSION_LEVEL}" "${db_backup_file}"
    
    log "Database backup completed: $(du -h "${db_backup_file}.gz" | cut -f1)"
}

# Mail data backup
backup_mail_data() {
    log "Starting mail data backup..."
    
    local mail_backup_file="${BACKUP_DIR}/${TIMESTAMP}/maildata_${TIMESTAMP}.tar.gz"
    
    # Backup mail directories
    tar \
        --create \
        --gzip \
        --preserve-permissions \
        --same-owner \
        --file="${mail_backup_file}" \
        --directory="/data" \
        mail index \
    || error_exit "Mail data backup failed"
    
    log "Mail data backup completed: $(du -h "${mail_backup_file}" | cut -f1)"
}

# Index backup
backup_indexes() {
    log "Starting index backup..."
    
    local index_backup_file="${BACKUP_DIR}/${TIMESTAMP}/indexes_${TIMESTAMP}.tar.gz"
    
    # Backup search indexes and metadata
    tar \
        --create \
        --gzip \
        --preserve-permissions \
        --file="${index_backup_file}" \
        --directory="/data/index" \
        . \
    || error_exit "Index backup failed"
    
    log "Index backup completed: $(du -h "${index_backup_file}" | cut -f1)"
}

# Encrypt backup files
encrypt_backups() {
    log "Encrypting backup files..."
    
    for file in "${BACKUP_DIR}/${TIMESTAMP}"/*; do
        if [[ -f "$file" && ! "$file" =~ \.enc$ ]]; then
            log "Encrypting $(basename "$file")..."
            
            # Encrypt using age with KMS-provided key
            age -r "${ENCRYPTION_KEY}" -o "${file}.enc" "$file" || error_exit "Encryption failed for $file"
            
            # Remove unencrypted file
            rm "$file"
            
            log "Encrypted: $(basename "$file").enc ($(du -h "${file}.enc" | cut -f1))"
        fi
    done
}

# Upload to cloud storage
upload_backups() {
    log "Uploading backups to cloud storage..."
    
    local backup_prefix="backups/${BACKUP_DATE}/${TIMESTAMP}"
    
    # Upload encrypted files
    for file in "${BACKUP_DIR}/${TIMESTAMP}"/*.enc; do
        if [[ -f "$file" ]]; then
            local filename=$(basename "$file")
            local s3_key="${backup_prefix}/${filename}"
            
            log "Uploading ${filename}..."
            
            aws s3 cp "$file" "s3://${BACKUP_BUCKET}/${s3_key}" \
                --storage-class STANDARD_IA \
                --metadata "backup-date=${BACKUP_DATE},timestamp=${TIMESTAMP},encrypted=true" \
            || error_exit "Upload failed for $filename"
            
            log "Uploaded: s3://${BACKUP_BUCKET}/${s3_key}"
        fi
    done
}

# Create backup manifest
create_manifest() {
    log "Creating backup manifest..."
    
    local manifest_file="${BACKUP_DIR}/${TIMESTAMP}/manifest_${TIMESTAMP}.json"
    
    cat > "$manifest_file" << EOF
{
  "backup_id": "${TIMESTAMP}",
  "backup_date": "${BACKUP_DATE}",
  "backup_type": "logical",
  "encryption": {
    "algorithm": "age",
    "key_id": "${ENCRYPTION_KEY_ID}",
    "encrypted": true
  },
  "database": {
    "host": "${POSTGRES_HOST}",
    "database": "${POSTGRES_DB}",
    "version": "$(pg_dump --version | head -1)"
  },
  "files": [
EOF

    # Add file entries
    local first=true
    for file in "${BACKUP_DIR}/${TIMESTAMP}"/*.enc; do
        if [[ -f "$file" && "$file" != "$manifest_file" ]]; then
            if [[ "$first" == "true" ]]; then
                first=false
            else
                echo "," >> "$manifest_file"
            fi
            
            local filename=$(basename "$file")
            local filesize=$(stat -c%s "$file")
            local checksum=$(sha256sum "$file" | cut -d' ' -f1)
            
            cat >> "$manifest_file" << EOF
    {
      "filename": "${filename}",
      "size": ${filesize},
      "checksum": "${checksum}",
      "type": "encrypted"
    }
EOF
        fi
    done

    cat >> "$manifest_file" << EOF
  ],
  "created_at": "$(date -Iseconds)",
  "retention_until": "$(date -d "+${RETENTION_DAYS} days" -Iseconds)"
}
EOF

    # Encrypt manifest
    age -r "${ENCRYPTION_KEY}" -o "${manifest_file}.enc" "$manifest_file"
    rm "$manifest_file"
    
    # Upload manifest
    aws s3 cp "${manifest_file}.enc" "s3://${BACKUP_BUCKET}/backups/${BACKUP_DATE}/${TIMESTAMP}/manifest_${TIMESTAMP}.json.enc"
    
    log "Backup manifest created and uploaded"
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning up backups older than ${RETENTION_DAYS} days..."
    
    local cutoff_date=$(date -d "-${RETENTION_DAYS} days" +%Y-%m-%d)
    
    # List and delete old backups
    aws s3api list-objects-v2 \
        --bucket "${BACKUP_BUCKET}" \
        --prefix "backups/" \
        --query "Contents[?LastModified<'${cutoff_date}'].Key" \
        --output text | \
    while read -r key; do
        if [[ -n "$key" && "$key" != "None" ]]; then
            log "Deleting old backup: $key"
            aws s3 rm "s3://${BACKUP_BUCKET}/${key}"
        fi
    done
}

# Test backup integrity
test_backup_integrity() {
    log "Testing backup integrity..."
    
    # Verify all encrypted files can be decrypted
    for file in "${BACKUP_DIR}/${TIMESTAMP}"/*.enc; do
        if [[ -f "$file" ]]; then
            local test_file="${file}.test"
            age -d -i <(echo "${ENCRYPTION_KEY}") "$file" > "$test_file" 2>/dev/null || error_exit "Decryption test failed for $(basename "$file")"
            rm "$test_file"
        fi
    done
    
    log "Backup integrity test passed"
}

# Main backup function
main() {
    init_backup
    backup_database
    backup_mail_data
    backup_indexes
    encrypt_backups
    test_backup_integrity
    upload_backups
    create_manifest
    cleanup_old_backups
    
    log "CEERION Mail backup completed successfully - ${TIMESTAMP}"
    
    # Send success notification
    curl -X POST "${WEBHOOK_URL:-}" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"CEERION Mail backup completed successfully: ${TIMESTAMP}\"}" \
        2>/dev/null || true
}

# Execute main function
main "$@"
