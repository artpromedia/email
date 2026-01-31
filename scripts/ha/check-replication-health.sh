#!/usr/bin/env bash
# Database Replication Health Check Script
# Monitors PostgreSQL HA cluster health and replication status

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }

# Configuration
HAPROXY_HOST="${HAPROXY_HOST:-localhost}"
HAPROXY_STATS_PORT="${HAPROXY_STATS_PORT:-7000}"
PATRONI_HOSTS="${PATRONI_HOSTS:-localhost:8008,localhost:8009,localhost:8010}"
PRIMARY_PORT="${PRIMARY_PORT:-5000}"
REPLICA_PORT="${REPLICA_PORT:-5001}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-}"
MAX_REPLICATION_LAG_BYTES="${MAX_REPLICATION_LAG_BYTES:-16777216}" # 16MB default

# Exit codes
EXIT_OK=0
EXIT_WARNING=1
EXIT_CRITICAL=2
EXIT_UNKNOWN=3

OVERALL_STATUS=$EXIT_OK
ISSUES=()

update_status() {
    local new_status=$1
    if [ "$new_status" -gt "$OVERALL_STATUS" ]; then
        OVERALL_STATUS=$new_status
    fi
}

add_issue() {
    ISSUES+=("$1")
}

# Check HAProxy status
check_haproxy() {
    log_header "HAProxy Health Check"

    if curl -s "http://${HAPROXY_HOST}:${HAPROXY_STATS_PORT}/stats" > /dev/null 2>&1; then
        log_info "HAProxy stats endpoint is accessible"

        # Parse HAProxy stats
        STATS=$(curl -s "http://${HAPROXY_HOST}:${HAPROXY_STATS_PORT}/stats;csv")

        # Check primary backend
        PRIMARY_UP=$(echo "$STATS" | grep "pg_primary" | grep -c "UP" || echo "0")
        if [ "$PRIMARY_UP" -ge 1 ]; then
            log_info "Primary backend: UP ($PRIMARY_UP healthy backends)"
        else
            log_error "Primary backend: DOWN"
            update_status $EXIT_CRITICAL
            add_issue "Primary database backend is DOWN"
        fi

        # Check replica backend
        REPLICA_UP=$(echo "$STATS" | grep "pg_replicas" | grep -c "UP" || echo "0")
        if [ "$REPLICA_UP" -ge 1 ]; then
            log_info "Replica backends: $REPLICA_UP healthy"
        else
            log_warn "Replica backends: All DOWN (reads will fall back to primary)"
            update_status $EXIT_WARNING
            add_issue "All replica backends are DOWN"
        fi
    else
        log_error "HAProxy stats endpoint is not accessible"
        update_status $EXIT_CRITICAL
        add_issue "HAProxy is not responding"
    fi
}

# Check Patroni cluster status
check_patroni() {
    log_header "Patroni Cluster Health Check"

    IFS=',' read -ra HOSTS <<< "$PATRONI_HOSTS"
    LEADER_FOUND=false
    HEALTHY_NODES=0

    for host in "${HOSTS[@]}"; do
        HOST_NAME=$(echo "$host" | cut -d: -f1)
        HOST_PORT=$(echo "$host" | cut -d: -f2)

        # Check node health
        if RESPONSE=$(curl -s "http://${HOST_NAME}:${HOST_PORT}/health" 2>/dev/null); then
            STATE=$(echo "$RESPONSE" | grep -o '"state":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
            ROLE=$(echo "$RESPONSE" | grep -o '"role":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

            if [ "$STATE" = "running" ]; then
                ((HEALTHY_NODES++))
                if [ "$ROLE" = "master" ] || [ "$ROLE" = "primary" ]; then
                    LEADER_FOUND=true
                    log_info "Node $HOST_NAME: PRIMARY (running)"
                else
                    log_info "Node $HOST_NAME: REPLICA (running)"
                fi
            else
                log_warn "Node $HOST_NAME: $STATE ($ROLE)"
            fi
        else
            log_error "Node $HOST_NAME: Not responding"
            update_status $EXIT_WARNING
        fi
    done

    if [ "$LEADER_FOUND" = false ]; then
        log_error "No leader found in cluster!"
        update_status $EXIT_CRITICAL
        add_issue "No primary/leader node found in Patroni cluster"
    fi

    if [ "$HEALTHY_NODES" -lt 2 ]; then
        log_warn "Cluster has less than 2 healthy nodes (quorum at risk)"
        update_status $EXIT_WARNING
        add_issue "Only $HEALTHY_NODES healthy nodes - quorum at risk"
    fi

    log_info "Healthy nodes: $HEALTHY_NODES"
}

# Check replication lag
check_replication_lag() {
    log_header "Replication Lag Check"

    if [ -z "$PGPASSWORD" ]; then
        log_warn "PGPASSWORD not set, skipping replication lag check"
        return
    fi

    export PGPASSWORD

    # Query replication status from primary
    REPLICATION_QUERY="SELECT
        client_addr,
        state,
        pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) as lag_bytes,
        pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) / 1024 / 1024 as lag_mb
    FROM pg_stat_replication;"

    if RESULT=$(psql -h "$HAPROXY_HOST" -p "$PRIMARY_PORT" -U "$PGUSER" -d postgres -t -c "$REPLICATION_QUERY" 2>/dev/null); then
        if [ -n "$RESULT" ]; then
            echo "$RESULT" | while IFS='|' read -r client_addr state lag_bytes lag_mb; do
                client_addr=$(echo "$client_addr" | xargs)
                state=$(echo "$state" | xargs)
                lag_bytes=$(echo "$lag_bytes" | xargs)
                lag_mb=$(echo "$lag_mb" | xargs)

                if [ -n "$client_addr" ]; then
                    if [ "${lag_bytes:-0}" -gt "$MAX_REPLICATION_LAG_BYTES" ]; then
                        log_warn "Replica $client_addr: ${lag_mb}MB lag (state: $state)"
                        update_status $EXIT_WARNING
                        add_issue "Replica $client_addr has ${lag_mb}MB replication lag"
                    else
                        log_info "Replica $client_addr: ${lag_mb}MB lag (state: $state) - OK"
                    fi
                fi
            done
        else
            log_info "No active replicas found"
        fi
    else
        log_warn "Could not query replication status from primary"
    fi
}

# Check etcd cluster
check_etcd() {
    log_header "etcd Cluster Health Check"

    ETCD_ENDPOINTS="${ETCD_ENDPOINTS:-localhost:2379}"

    if command -v etcdctl &> /dev/null; then
        if RESULT=$(ETCDCTL_API=3 etcdctl --endpoints="$ETCD_ENDPOINTS" endpoint health 2>/dev/null); then
            HEALTHY=$(echo "$RESULT" | grep -c "is healthy" || echo "0")
            log_info "etcd healthy endpoints: $HEALTHY"

            if [ "$HEALTHY" -lt 2 ]; then
                log_warn "etcd cluster has less than 2 healthy nodes"
                update_status $EXIT_WARNING
                add_issue "etcd cluster degraded - only $HEALTHY healthy nodes"
            fi
        else
            log_warn "Could not check etcd health"
        fi
    else
        log_info "etcdctl not available, skipping etcd check"
    fi
}

# Check database connectivity
check_connectivity() {
    log_header "Database Connectivity Check"

    if [ -z "$PGPASSWORD" ]; then
        log_warn "PGPASSWORD not set, skipping connectivity check"
        return
    fi

    export PGPASSWORD

    # Check primary connection
    if psql -h "$HAPROXY_HOST" -p "$PRIMARY_PORT" -U "$PGUSER" -d postgres -c "SELECT 1" > /dev/null 2>&1; then
        log_info "Primary connection (port $PRIMARY_PORT): OK"
    else
        log_error "Primary connection (port $PRIMARY_PORT): FAILED"
        update_status $EXIT_CRITICAL
        add_issue "Cannot connect to primary database"
    fi

    # Check replica connection
    if psql -h "$HAPROXY_HOST" -p "$REPLICA_PORT" -U "$PGUSER" -d postgres -c "SELECT 1" > /dev/null 2>&1; then
        log_info "Replica connection (port $REPLICA_PORT): OK"
    else
        log_warn "Replica connection (port $REPLICA_PORT): FAILED"
        update_status $EXIT_WARNING
        add_issue "Cannot connect to replica database"
    fi
}

# Check WAL archiving
check_wal_archiving() {
    log_header "WAL Archiving Check"

    if [ -z "$PGPASSWORD" ]; then
        log_warn "PGPASSWORD not set, skipping WAL archiving check"
        return
    fi

    export PGPASSWORD

    ARCHIVE_QUERY="SELECT
        archived_count,
        failed_count,
        last_archived_time,
        CASE WHEN failed_count > 0 THEN 'WARNING' ELSE 'OK' END as status
    FROM pg_stat_archiver;"

    if RESULT=$(psql -h "$HAPROXY_HOST" -p "$PRIMARY_PORT" -U "$PGUSER" -d postgres -t -c "$ARCHIVE_QUERY" 2>/dev/null); then
        IFS='|' read -r archived failed last_time status <<< "$RESULT"
        archived=$(echo "$archived" | xargs)
        failed=$(echo "$failed" | xargs)
        last_time=$(echo "$last_time" | xargs)
        status=$(echo "$status" | xargs)

        log_info "Archived WAL segments: $archived"
        if [ "${failed:-0}" -gt 0 ]; then
            log_warn "Failed WAL archives: $failed"
            update_status $EXIT_WARNING
            add_issue "WAL archiving has $failed failed attempts"
        else
            log_info "Failed WAL archives: 0"
        fi
        log_info "Last archived: $last_time"
    else
        log_warn "Could not query WAL archiving status"
    fi
}

# Generate JSON output
generate_json_output() {
    local status_text
    case $OVERALL_STATUS in
        0) status_text="OK" ;;
        1) status_text="WARNING" ;;
        2) status_text="CRITICAL" ;;
        *) status_text="UNKNOWN" ;;
    esac

    ISSUES_JSON=$(printf '%s\n' "${ISSUES[@]}" | jq -R . | jq -s .)

    cat << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "status": "$status_text",
    "exit_code": $OVERALL_STATUS,
    "issues": $ISSUES_JSON,
    "checks": {
        "haproxy": true,
        "patroni": true,
        "replication": true,
        "etcd": true,
        "connectivity": true,
        "wal_archiving": true
    }
}
EOF
}

# Print summary
print_summary() {
    log_header "Health Check Summary"

    case $OVERALL_STATUS in
        0)
            log_info "Overall Status: ${GREEN}HEALTHY${NC}"
            ;;
        1)
            log_warn "Overall Status: ${YELLOW}WARNING${NC}"
            ;;
        2)
            log_error "Overall Status: ${RED}CRITICAL${NC}"
            ;;
        *)
            log_error "Overall Status: ${RED}UNKNOWN${NC}"
            ;;
    esac

    if [ ${#ISSUES[@]} -gt 0 ]; then
        echo ""
        log_warn "Issues found:"
        for issue in "${ISSUES[@]}"; do
            echo "  - $issue"
        done
    fi
}

# Main
show_help() {
    echo "Database Replication Health Check"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -j, --json      Output results as JSON"
    echo "  -q, --quiet     Only output status code"
    echo "  -h, --help      Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  HAPROXY_HOST              HAProxy host (default: localhost)"
    echo "  HAPROXY_STATS_PORT        HAProxy stats port (default: 7000)"
    echo "  PATRONI_HOSTS             Comma-separated Patroni endpoints"
    echo "  PRIMARY_PORT              Primary database port (default: 5000)"
    echo "  REPLICA_PORT              Replica database port (default: 5001)"
    echo "  PGUSER                    PostgreSQL user (default: postgres)"
    echo "  PGPASSWORD                PostgreSQL password"
    echo "  MAX_REPLICATION_LAG_BYTES Max allowed replication lag (default: 16MB)"
    echo "  ETCD_ENDPOINTS            etcd endpoints (default: localhost:2379)"
    echo ""
    echo "Exit Codes:"
    echo "  0 - OK"
    echo "  1 - WARNING"
    echo "  2 - CRITICAL"
    echo "  3 - UNKNOWN"
}

JSON_OUTPUT=false
QUIET=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -j|--json)
            JSON_OUTPUT=true
            shift
            ;;
        -q|--quiet)
            QUIET=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

if [ "$QUIET" = true ]; then
    check_haproxy > /dev/null 2>&1
    check_patroni > /dev/null 2>&1
    check_etcd > /dev/null 2>&1
    check_connectivity > /dev/null 2>&1
    check_replication_lag > /dev/null 2>&1
    check_wal_archiving > /dev/null 2>&1
    exit $OVERALL_STATUS
fi

if [ "$JSON_OUTPUT" = true ]; then
    check_haproxy > /dev/null 2>&1
    check_patroni > /dev/null 2>&1
    check_etcd > /dev/null 2>&1
    check_connectivity > /dev/null 2>&1
    check_replication_lag > /dev/null 2>&1
    check_wal_archiving > /dev/null 2>&1
    generate_json_output
    exit $OVERALL_STATUS
fi

log_header "PostgreSQL HA Cluster Health Check"
log_info "Timestamp: $(date)"

check_haproxy
check_patroni
check_etcd
check_connectivity
check_replication_lag
check_wal_archiving
print_summary

exit $OVERALL_STATUS
