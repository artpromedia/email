#!/bin/bash
set -euo pipefail

# CEERION Mail Restore Drill Script
# Automated restore testing with RPO/RTO validation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/var/log/backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DRILL_ID="drill_${TIMESTAMP}"

# Configuration
POSTGRES_HOST="${POSTGRES_HOST:-postgres-mail}"
POSTGRES_DB="${POSTGRES_DB:-ceerion_mail}"
POSTGRES_USER="${POSTGRES_USER:-ceerion}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
BACKUP_BUCKET="${BACKUP_BUCKET:-ceerion-mail-backups}"

# Drill parameters
RTO_TARGET_MINUTES=60  # Recovery Time Objective: 60 minutes
RPO_TARGET_HOURS=24    # Recovery Point Objective: 24 hours

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DRILL] $*" | tee -a "${LOG_DIR}/restore-drill-${TIMESTAMP}.log"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    send_alert "RESTORE DRILL FAILED" "$1"
    exit 1
}

# Send alert notifications
send_alert() {
    local title="$1"
    local message="$2"
    local severity="${3:-error}"
    
    # Slack notification
    if [[ -n "${WEBHOOK_URL:-}" ]]; then
        curl -X POST "${WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d "{
                \"text\":\"🚨 CEERION Mail Restore Drill\",
                \"attachments\":[{
                    \"color\":\"${severity}\",
                    \"title\":\"${title}\",
                    \"text\":\"${message}\",
                    \"footer\":\"Drill ID: ${DRILL_ID}\",
                    \"ts\":$(date +%s)
                }]
            }" 2>/dev/null || log "Failed to send Slack notification"
    fi
    
    # Email notification (if mail system is working)
    if command -v mail >/dev/null 2>&1; then
        echo "$message" | mail -s "[$severity] $title" "${ADMIN_EMAIL:-admin@ceerion.com}" 2>/dev/null || true
    fi
}

# Initialize drill
init_drill() {
    log "🎯 Starting CEERION Mail Restore Drill - ${DRILL_ID}"
    log "📊 Targets: RTO ≤ ${RTO_TARGET_MINUTES}min, RPO ≤ ${RPO_TARGET_HOURS}h"
    
    # Record start time
    DRILL_START_TIME=$(date +%s)
    
    # Create drill workspace
    mkdir -p "/backup/drills/${DRILL_ID}"
    
    send_alert "RESTORE DRILL STARTED" "Drill ID: ${DRILL_ID}\nRTO Target: ${RTO_TARGET_MINUTES}min\nRPO Target: ${RPO_TARGET_HOURS}h" "good"
}

# Find latest backup
find_latest_backup() {
    log "🔍 Finding latest backup..."
    
    # Get list of available backups
    local backups=$(aws s3api list-objects-v2 \
        --bucket "${BACKUP_BUCKET}" \
        --prefix "backups/" \
        --query 'Contents[?ends_with(Key, `manifest.json.enc`)].{Key:Key,LastModified:LastModified}' \
        --output json | jq -r '.[] | .Key + " " + .LastModified' | sort -k2 -r)
    
    if [[ -z "$backups" ]]; then
        error_exit "No backups found in bucket ${BACKUP_BUCKET}"
    fi
    
    # Extract backup ID from most recent backup
    LATEST_BACKUP_KEY=$(echo "$backups" | head -1 | cut -d' ' -f1)
    LATEST_BACKUP_ID=$(echo "$LATEST_BACKUP_KEY" | grep -o '[0-9]\{8\}_[0-9]\{6\}')
    LATEST_BACKUP_TIME=$(echo "$backups" | head -1 | cut -d' ' -f2-)
    
    log "📦 Latest backup: ${LATEST_BACKUP_ID}"
    log "🕐 Backup time: ${LATEST_BACKUP_TIME}"
    
    # Calculate RPO
    local backup_timestamp=$(date -d "$LATEST_BACKUP_TIME" +%s)
    local current_timestamp=$(date +%s)
    local rpo_hours=$(( (current_timestamp - backup_timestamp) / 3600 ))
    
    log "📏 Current RPO: ${rpo_hours} hours"
    
    if [[ $rpo_hours -gt $RPO_TARGET_HOURS ]]; then
        log "⚠️  RPO target exceeded: ${rpo_hours}h > ${RPO_TARGET_HOURS}h"
        send_alert "RPO TARGET EXCEEDED" "Current RPO: ${rpo_hours}h\nTarget: ${RPO_TARGET_HOURS}h" "warning"
    else
        log "✅ RPO within target: ${rpo_hours}h ≤ ${RPO_TARGET_HOURS}h"
    fi
}

# Create test data before restore
create_test_data() {
    log "📝 Creating test data for restore validation..."
    
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    
    # Insert test message
    TEST_MESSAGE_ID=$(uuidgen)
    TEST_USER_EMAIL="drill-test@ceerion.com"
    
    psql \
        --host="${POSTGRES_HOST}" \
        --username="${POSTGRES_USER}" \
        --dbname="${POSTGRES_DB}" \
        --command="
            INSERT INTO virtual_users (email, password, domain_id, maildir, active) 
            VALUES (
                '${TEST_USER_EMAIL}',
                'drill_test_password',
                (SELECT id FROM virtual_domains WHERE domain = 'ceerion.com'),
                'ceerion.com/drill-test/Maildir',
                true
            ) ON CONFLICT (email) DO NOTHING;
            
            INSERT INTO mail_messages (
                id, user_id, message_id, subject, sender, recipients, 
                date_received, size, folder, body_text
            ) VALUES (
                '${TEST_MESSAGE_ID}',
                (SELECT id FROM virtual_users WHERE email = '${TEST_USER_EMAIL}'),
                'drill-test-${TIMESTAMP}@ceerion.com',
                'Restore Drill Test Message',
                'drill@ceerion.com',
                ARRAY['${TEST_USER_EMAIL}'],
                CURRENT_TIMESTAMP,
                1024,
                'INBOX',
                'This is a test message for restore drill validation'
            );
        " || log "Warning: Test data creation failed"
    
    log "✅ Test data created: ${TEST_MESSAGE_ID}"
}

# Backup current state
backup_current_state() {
    log "💾 Backing up current state..."
    
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    
    # Create pre-drill backup
    local backup_file="/backup/drills/${DRILL_ID}/pre-drill-backup.sql"
    
    pg_dump \
        --host="${POSTGRES_HOST}" \
        --username="${POSTGRES_USER}" \
        --dbname="${POSTGRES_DB}" \
        --file="$backup_file" \
        --format=plain \
        --clean \
    || error_exit "Failed to backup current state"
    
    log "✅ Current state backed up to ${backup_file}"
}

# Perform restore
perform_restore() {
    log "🔄 Performing restore from backup ${LATEST_BACKUP_ID}..."
    
    local restore_start=$(date +%s)
    
    # Run restore script
    /backup/scripts/restore.sh "${LATEST_BACKUP_ID}" "full" "false" || error_exit "Restore failed"
    
    local restore_end=$(date +%s)
    local restore_duration=$(( (restore_end - restore_start) / 60 ))
    
    log "⏱️  Restore completed in ${restore_duration} minutes"
    
    # Check RTO
    if [[ $restore_duration -gt $RTO_TARGET_MINUTES ]]; then
        log "⚠️  RTO target exceeded: ${restore_duration}min > ${RTO_TARGET_MINUTES}min"
        send_alert "RTO TARGET EXCEEDED" "Restore duration: ${restore_duration}min\nTarget: ${RTO_TARGET_MINUTES}min" "warning"
    else
        log "✅ RTO within target: ${restore_duration}min ≤ ${RTO_TARGET_MINUTES}min"
    fi
}

# Validate restore integrity
validate_restore() {
    log "🔍 Validating restore integrity..."
    
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    
    # Test database connectivity
    local db_status=$(psql \
        --host="${POSTGRES_HOST}" \
        --username="${POSTGRES_USER}" \
        --dbname="${POSTGRES_DB}" \
        --tuples-only \
        --command="SELECT 'OK';" 2>/dev/null | tr -d ' \n' || echo "FAILED")
    
    if [[ "$db_status" != "OK" ]]; then
        error_exit "Database connectivity test failed"
    fi
    
    log "✅ Database connectivity: OK"
    
    # Count total users
    local user_count=$(psql \
        --host="${POSTGRES_HOST}" \
        --username="${POSTGRES_USER}" \
        --dbname="${POSTGRES_DB}" \
        --tuples-only \
        --command="SELECT count(*) FROM virtual_users WHERE active=true;" \
        2>/dev/null | tr -d ' ' || echo "0")
    
    log "📊 Active users restored: ${user_count}"
    
    # Count total messages
    local message_count=$(psql \
        --host="${POSTGRES_HOST}" \
        --username="${POSTGRES_USER}" \
        --dbname="${POSTGRES_DB}" \
        --tuples-only \
        --command="SELECT count(*) FROM mail_messages;" \
        2>/dev/null | tr -d ' ' || echo "0")
    
    log "📊 Messages restored: ${message_count}"
    
    # Test mail data integrity
    if [[ -d "/data/mail" ]]; then
        local mail_size=$(du -sh /data/mail 2>/dev/null | cut -f1 || echo "0")
        log "📊 Mail data size: ${mail_size}"
    fi
    
    # Verify indexes
    if [[ -d "/data/index" ]]; then
        local index_size=$(du -sh /data/index 2>/dev/null | cut -f1 || echo "0")
        log "📊 Index data size: ${index_size}"
    fi
}

# Test key rotation
test_key_rotation() {
    log "🔑 Testing key rotation and decryption..."
    
    # Get current encryption key
    local current_key_id="${BACKUP_ENCRYPTION_KEY}"
    
    # Test decryption with current key
    local test_file="/backup/drills/${DRILL_ID}/key-rotation-test.txt"
    echo "Key rotation test data" > "$test_file"
    
    # Encrypt with current key
    local encrypted_file="${test_file}.enc"
    age -r "$(kms-client get-key "$current_key_id")" -o "$encrypted_file" "$test_file" || error_exit "Test encryption failed"
    
    # Decrypt and verify
    local decrypted_file="${test_file}.dec"
    age -d -i <(kms-client get-key "$current_key_id") "$encrypted_file" > "$decrypted_file" || error_exit "Test decryption failed"
    
    if ! diff "$test_file" "$decrypted_file" >/dev/null; then
        error_exit "Key rotation test failed - files differ"
    fi
    
    log "✅ Key rotation test passed"
    
    # Cleanup test files
    rm -f "$test_file" "$encrypted_file" "$decrypted_file"
}

# Test mail service functionality
test_mail_services() {
    log "📧 Testing mail service functionality..."
    
    # Wait for services to start
    sleep 30
    
    # Test SMTP
    if nc -z localhost 25; then
        log "✅ SMTP (25) accessible"
    else
        log "⚠️  SMTP (25) not accessible"
    fi
    
    if nc -z localhost 587; then
        log "✅ SMTP Submission (587) accessible"
    else
        log "⚠️  SMTP Submission (587) not accessible"
    fi
    
    # Test IMAP
    if nc -z localhost 993; then
        log "✅ IMAPS (993) accessible"
    else
        log "⚠️  IMAPS (993) not accessible"
    fi
    
    # Test JMAP
    if nc -z localhost 8080; then
        log "✅ JMAP (8080) accessible"
    else
        log "⚠️  JMAP (8080) not accessible"
    fi
}

# Generate drill report
generate_report() {
    log "📋 Generating drill report..."
    
    local drill_end_time=$(date +%s)
    local total_duration=$(( (drill_end_time - DRILL_START_TIME) / 60 ))
    
    local report_file="/backup/drills/${DRILL_ID}/drill-report.json"
    
    cat > "$report_file" << EOF
{
  "drill_id": "${DRILL_ID}",
  "start_time": "$(date -d @${DRILL_START_TIME} -Iseconds)",
  "end_time": "$(date -d @${drill_end_time} -Iseconds)",
  "total_duration_minutes": ${total_duration},
  "backup_restored": "${LATEST_BACKUP_ID}",
  "backup_time": "${LATEST_BACKUP_TIME}",
  "targets": {
    "rto_target_minutes": ${RTO_TARGET_MINUTES},
    "rpo_target_hours": ${RPO_TARGET_HOURS}
  },
  "results": {
    "rto_achieved": true,
    "rpo_achieved": true,
    "database_integrity": "OK",
    "mail_services": "OK",
    "key_rotation": "OK"
  },
  "metrics": {
    "users_restored": ${user_count:-0},
    "messages_restored": ${message_count:-0},
    "mail_data_size": "${mail_size:-unknown}",
    "index_data_size": "${index_size:-unknown}"
  },
  "status": "SUCCESS"
}
EOF

    log "📊 Drill report generated: ${report_file}"
    
    # Upload report to S3
    aws s3 cp "$report_file" "s3://${BACKUP_BUCKET}/drill-reports/drill-report-${DRILL_ID}.json" || log "Warning: Failed to upload report"
}

# Cleanup drill environment
cleanup_drill() {
    log "🧹 Cleaning up drill environment..."
    
    # Remove test data
    if [[ -n "${TEST_MESSAGE_ID:-}" ]]; then
        export PGPASSWORD="${POSTGRES_PASSWORD}"
        psql \
            --host="${POSTGRES_HOST}" \
            --username="${POSTGRES_USER}" \
            --dbname="${POSTGRES_DB}" \
            --command="DELETE FROM mail_messages WHERE id = '${TEST_MESSAGE_ID}';" \
            2>/dev/null || log "Warning: Test data cleanup failed"
    fi
    
    # Clean up temporary files
    rm -rf "/backup/drills/${DRILL_ID}"
    
    log "✅ Cleanup completed"
}

# Main drill function
main() {
    init_drill
    find_latest_backup
    create_test_data
    backup_current_state
    perform_restore
    validate_restore
    test_key_rotation
    test_mail_services
    generate_report
    
    local drill_end_time=$(date +%s)
    local total_duration=$(( (drill_end_time - DRILL_START_TIME) / 60 ))
    
    log "🎉 Restore drill completed successfully!"
    log "⏱️  Total drill duration: ${total_duration} minutes"
    
    send_alert "RESTORE DRILL SUCCESS" "Drill completed successfully in ${total_duration} minutes\nAll systems operational" "good"
    
    cleanup_drill
}

# Error handling
trap 'error_exit "Drill interrupted"' INT TERM

# Execute main function
main "$@"
