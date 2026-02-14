#!/bin/bash
# =============================================================================
# PostgreSQL Partition Management Script
# OonruMail Platform
# =============================================================================
#
# This script manages table partitions for emails and audit_logs tables.
# It can be run via cron or manually for partition maintenance.
#
# Usage:
#   ./manage-partitions.sh [command] [options]
#
# Commands:
#   create-future    Create partitions for future months
#   archive          Archive old partitions
#   drop-archived    Drop archived partitions
#   stats            Show partition statistics
#   migrate          Migrate existing data to partitioned tables
#   verify           Verify partition health
#   help             Show this help
#
# Environment Variables:
#   PGHOST       PostgreSQL host (default: localhost)
#   PGPORT       PostgreSQL port (default: 5432)
#   PGDATABASE   Database name (default: email)
#   PGUSER       Database user (default: postgres)
#   PGPASSWORD   Database password
#
# =============================================================================

set -e

# Default configuration
: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=email}"
: "${PGUSER:=postgres}"

# Partition configuration
MONTHS_AHEAD=${MONTHS_AHEAD:-3}
RETENTION_MONTHS=${RETENTION_MONTHS:-24}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Execute SQL command
run_sql() {
    psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -U "$PGUSER" -c "$1"
}

# Execute SQL file
run_sql_file() {
    psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -U "$PGUSER" -f "$1"
}

# Execute SQL query and return result
query_sql() {
    psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -U "$PGUSER" -t -A -c "$1"
}

# Create future partitions
cmd_create_future() {
    log_info "Creating partitions for the next $MONTHS_AHEAD months..."

    run_sql "SELECT create_future_partitions($MONTHS_AHEAD);"

    log_success "Future partitions created successfully"
}

# Archive old partitions
cmd_archive() {
    log_info "Archiving partitions older than $RETENTION_MONTHS months..."

    # Show partitions to be archived
    log_info "Partitions that will be archived:"
    archive_date=$(date -d "-${RETENTION_MONTHS} months" +%Y_%m)
    query_sql "
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND (tablename LIKE 'emails_%' OR tablename LIKE 'audit_logs_%')
          AND tablename NOT LIKE 'emails_partitioned%'
          AND tablename NOT LIKE 'audit_logs_partitioned%'
          AND tablename NOT LIKE '%_historical'
          AND tablename < 'emails_${archive_date}'
        ORDER BY tablename;
    "

    read -p "Proceed with archiving? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        run_sql "SELECT archive_old_partitions($RETENTION_MONTHS);"
        log_success "Partitions archived successfully"
    else
        log_warn "Archive cancelled"
    fi
}

# Drop archived partitions
cmd_drop_archived() {
    log_warn "This will PERMANENTLY DELETE archived partitions!"

    # Show archived partitions
    log_info "Archived partitions that will be deleted:"
    query_sql "
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND (tablename LIKE 'archived_emails_%' OR tablename LIKE 'archived_audit_logs_%')
        ORDER BY tablename;
    "

    read -p "Are you SURE you want to permanently delete these partitions? (yes/NO) " -r
    echo
    if [[ $REPLY == "yes" ]]; then
        run_sql "SELECT drop_archived_partitions();"
        log_success "Archived partitions dropped successfully"
    else
        log_warn "Drop cancelled"
    fi
}

# Show partition statistics
cmd_stats() {
    log_info "Partition Statistics:"
    echo

    run_sql "
        SELECT * FROM get_partition_stats()
        ORDER BY partition_name;
    "

    echo
    log_info "Total sizes:"
    run_sql "
        SELECT
            'emails' as table_name,
            pg_size_pretty(SUM(pg_total_relation_size(c.oid))) as total_size
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname LIKE 'emails_%'
          AND c.relkind = 'r'
        UNION ALL
        SELECT
            'audit_logs' as table_name,
            pg_size_pretty(SUM(pg_total_relation_size(c.oid))) as total_size
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname LIKE 'audit_logs_%'
          AND c.relkind = 'r';
    "
}

# Migrate existing data to partitioned tables
cmd_migrate() {
    log_warn "Data migration requires a maintenance window!"
    log_info "This will:"
    log_info "  1. Lock the original tables"
    log_info "  2. Copy all data to partitioned tables"
    log_info "  3. Rename tables"
    log_info "  4. Verify data integrity"
    echo

    # Check if partitioned tables exist
    has_emails_part=$(query_sql "SELECT 1 FROM pg_tables WHERE tablename = 'emails_partitioned' LIMIT 1")
    has_audit_part=$(query_sql "SELECT 1 FROM pg_tables WHERE tablename = 'audit_logs_partitioned' LIMIT 1")

    if [[ -z "$has_emails_part" ]]; then
        log_error "Partitioned tables not found. Run the migration SQL first."
        exit 1
    fi

    # Get row counts
    emails_count=$(query_sql "SELECT COUNT(*) FROM emails")
    audit_count=$(query_sql "SELECT COUNT(*) FROM audit_logs")

    log_info "Data to migrate:"
    log_info "  - emails: $emails_count rows"
    log_info "  - audit_logs: $audit_count rows"
    echo

    read -p "Proceed with migration? (yes/NO) " -r
    echo
    if [[ $REPLY != "yes" ]]; then
        log_warn "Migration cancelled"
        exit 0
    fi

    log_info "Starting migration..."

    # Migrate emails
    log_info "Migrating emails table..."
    run_sql "
        BEGIN;
        LOCK TABLE emails IN ACCESS EXCLUSIVE MODE;
        INSERT INTO emails_partitioned SELECT * FROM emails;
        ALTER TABLE emails RENAME TO emails_old;
        ALTER TABLE emails_partitioned RENAME TO emails;
        COMMIT;
    "

    # Verify
    new_emails_count=$(query_sql "SELECT COUNT(*) FROM emails")
    if [[ "$emails_count" == "$new_emails_count" ]]; then
        log_success "Emails migrated successfully ($new_emails_count rows)"
    else
        log_error "Row count mismatch! Expected $emails_count, got $new_emails_count"
        exit 1
    fi

    # Migrate audit_logs
    log_info "Migrating audit_logs table..."
    run_sql "
        BEGIN;
        LOCK TABLE audit_logs IN ACCESS EXCLUSIVE MODE;
        INSERT INTO audit_logs_partitioned SELECT * FROM audit_logs;
        ALTER TABLE audit_logs RENAME TO audit_logs_old;
        ALTER TABLE audit_logs_partitioned RENAME TO audit_logs;
        COMMIT;
    "

    # Verify
    new_audit_count=$(query_sql "SELECT COUNT(*) FROM audit_logs")
    if [[ "$audit_count" == "$new_audit_count" ]]; then
        log_success "Audit logs migrated successfully ($new_audit_count rows)"
    else
        log_error "Row count mismatch! Expected $audit_count, got $new_audit_count"
        exit 1
    fi

    log_success "Migration completed successfully!"
    log_info "Old tables preserved as 'emails_old' and 'audit_logs_old'"
    log_info "Verify data, then drop old tables with: DROP TABLE emails_old, audit_logs_old;"
}

# Verify partition health
cmd_verify() {
    log_info "Verifying partition health..."
    echo

    # Check for missing partitions in the next 3 months
    log_info "Checking for missing future partitions..."
    for i in 1 2 3; do
        partition_date=$(date -d "+${i} months" +%Y_%m)

        emails_exists=$(query_sql "SELECT 1 FROM pg_tables WHERE tablename = 'emails_${partition_date}' LIMIT 1")
        if [[ -z "$emails_exists" ]]; then
            log_warn "Missing emails partition for $partition_date"
        else
            log_success "emails_${partition_date} exists"
        fi

        audit_exists=$(query_sql "SELECT 1 FROM pg_tables WHERE tablename = 'audit_logs_${partition_date}' LIMIT 1")
        if [[ -z "$audit_exists" ]]; then
            log_warn "Missing audit_logs partition for $partition_date"
        else
            log_success "audit_logs_${partition_date} exists"
        fi
    done
    echo

    # Check for orphaned partitions (detached but not archived)
    log_info "Checking for orphaned partitions..."
    orphaned=$(query_sql "
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND (tablename LIKE 'emails_%' OR tablename LIKE 'audit_logs_%')
          AND tablename NOT IN (
              SELECT inhrelid::regclass::text
              FROM pg_inherits
              WHERE inhparent IN ('emails'::regclass, 'audit_logs'::regclass)
          )
          AND tablename NOT LIKE '%_old'
          AND tablename NOT LIKE 'archived_%';
    ")

    if [[ -n "$orphaned" ]]; then
        log_warn "Found orphaned partitions:"
        echo "$orphaned"
    else
        log_success "No orphaned partitions found"
    fi
    echo

    # Check partition boundaries
    log_info "Partition boundaries:"
    run_sql "
        SELECT
            parent.relname AS parent,
            child.relname AS partition,
            pg_get_expr(child.relpartbound, child.oid) AS partition_bounds
        FROM pg_class parent
        JOIN pg_inherits i ON i.inhparent = parent.oid
        JOIN pg_class child ON i.inhrelid = child.oid
        WHERE parent.relname IN ('emails', 'audit_logs')
        ORDER BY parent.relname, child.relname;
    "
}

# Show help
cmd_help() {
    cat << EOF
PostgreSQL Partition Management Script
OonruMail Platform

Usage: $0 [command] [options]

Commands:
    create-future    Create partitions for future months (default: 3)
    archive          Archive partitions older than retention period
    drop-archived    Permanently drop archived partitions
    stats            Show partition statistics
    migrate          Migrate existing data to partitioned tables
    verify           Verify partition health
    help             Show this help

Environment Variables:
    PGHOST           PostgreSQL host (default: localhost)
    PGPORT           PostgreSQL port (default: 5432)
    PGDATABASE       Database name (default: email)
    PGUSER           Database user (default: postgres)
    PGPASSWORD       Database password (required)
    MONTHS_AHEAD     Months to create ahead (default: 3)
    RETENTION_MONTHS Months to retain before archiving (default: 24)

Examples:
    # Create partitions for next 6 months
    MONTHS_AHEAD=6 $0 create-future

    # Archive partitions older than 12 months
    RETENTION_MONTHS=12 $0 archive

    # Show partition stats
    $0 stats

    # Verify partition health
    $0 verify

Cron Examples:
    # Create future partitions monthly
    0 0 1 * * /path/to/manage-partitions.sh create-future

    # Archive old partitions monthly
    0 1 1 * * RETENTION_MONTHS=24 /path/to/manage-partitions.sh archive

EOF
}

# Main entry point
main() {
    case "${1:-help}" in
        create-future)
            cmd_create_future
            ;;
        archive)
            cmd_archive
            ;;
        drop-archived)
            cmd_drop_archived
            ;;
        stats)
            cmd_stats
            ;;
        migrate)
            cmd_migrate
            ;;
        verify)
            cmd_verify
            ;;
        help|--help|-h)
            cmd_help
            ;;
        *)
            log_error "Unknown command: $1"
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
