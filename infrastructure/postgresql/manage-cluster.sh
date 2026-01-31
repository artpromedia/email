#!/usr/bin/env bash
# PostgreSQL HA Cluster Management Script
# Manages Patroni-based PostgreSQL cluster

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Determine docker-compose command
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

COMPOSE_FILE="docker-compose.ha.yml"

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }

# Start the cluster
cmd_start() {
    log_header "Starting PostgreSQL HA Cluster"

    log_info "Building Patroni image..."
    $COMPOSE_CMD -f $COMPOSE_FILE build

    log_info "Starting etcd cluster..."
    $COMPOSE_CMD -f $COMPOSE_FILE up -d etcd1 etcd2 etcd3

    log_info "Waiting for etcd cluster to be healthy..."
    sleep 10

    log_info "Starting Patroni nodes..."
    $COMPOSE_CMD -f $COMPOSE_FILE up -d patroni1 patroni2 patroni3

    log_info "Waiting for Patroni cluster to initialize..."
    sleep 30

    log_info "Starting HAProxy..."
    $COMPOSE_CMD -f $COMPOSE_FILE up -d haproxy

    log_info "Cluster started successfully!"
    echo ""
    log_info "Endpoints:"
    echo "  - Primary (R/W):    localhost:5000"
    echo "  - Replicas (R/O):   localhost:5001"
    echo "  - HAProxy Stats:    http://localhost:7000"
    echo ""

    cmd_status
}

# Stop the cluster
cmd_stop() {
    log_header "Stopping PostgreSQL HA Cluster"
    $COMPOSE_CMD -f $COMPOSE_FILE down
    log_info "Cluster stopped"
}

# Destroy the cluster (including volumes)
cmd_destroy() {
    log_header "Destroying PostgreSQL HA Cluster"
    log_warn "This will delete all data!"
    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        $COMPOSE_CMD -f $COMPOSE_FILE down -v --remove-orphans
        log_info "Cluster destroyed"
    else
        log_info "Cancelled"
    fi
}

# Show cluster status
cmd_status() {
    log_header "Cluster Status"

    echo "Container Status:"
    $COMPOSE_CMD -f $COMPOSE_FILE ps

    echo ""
    echo "Patroni Cluster Status:"

    # Try to get status from each Patroni node
    for node in patroni1 patroni2 patroni3; do
        port=$((8008 + $(echo $node | grep -o '[0-9]') - 1))
        if curl -s "http://localhost:$port/cluster" > /dev/null 2>&1; then
            echo ""
            echo "Cluster info from $node:"
            curl -s "http://localhost:$port/cluster" | jq '.' 2>/dev/null || curl -s "http://localhost:$port/cluster"
            break
        fi
    done

    echo ""
    echo "etcd Cluster Status:"
    docker exec email-etcd1 etcdctl endpoint status --cluster -w table 2>/dev/null || echo "etcd not available"
}

# Show logs
cmd_logs() {
    local node=${1:-}
    if [ -n "$node" ]; then
        $COMPOSE_CMD -f $COMPOSE_FILE logs -f "$node"
    else
        $COMPOSE_CMD -f $COMPOSE_FILE logs -f
    fi
}

# Perform manual failover
cmd_failover() {
    local target=${1:-}
    log_header "Performing Failover"

    if [ -z "$target" ]; then
        log_error "Please specify target node (e.g., patroni2)"
        exit 1
    fi

    # Find current leader
    for node in patroni1 patroni2 patroni3; do
        port=$((8008 + $(echo $node | grep -o '[0-9]') - 1))
        if curl -s "http://localhost:$port/primary" > /dev/null 2>&1; then
            log_info "Current leader: $node"
            log_info "Initiating failover to: $target"

            # Trigger failover via Patroni API
            curl -s -X POST "http://localhost:$port/failover" \
                -H "Content-Type: application/json" \
                -d "{\"leader\": \"$node\", \"candidate\": \"$target\"}"

            log_info "Failover initiated. Waiting for completion..."
            sleep 15
            cmd_status
            return
        fi
    done

    log_error "Could not find current leader"
    exit 1
}

# Reinitialize a failed node
cmd_reinit() {
    local node=${1:-}
    log_header "Reinitializing Node"

    if [ -z "$node" ]; then
        log_error "Please specify node to reinitialize (e.g., patroni2)"
        exit 1
    fi

    port=$((8008 + $(echo $node | grep -o '[0-9]') - 1))

    log_info "Reinitializing $node..."
    curl -s -X POST "http://localhost:$port/reinitialize" \
        -H "Content-Type: application/json" \
        -d '{"force": true}'

    log_info "Reinitialization started"
}

# Switchover (graceful failover)
cmd_switchover() {
    local target=${1:-}
    log_header "Performing Switchover"

    if [ -z "$target" ]; then
        log_error "Please specify target node"
        exit 1
    fi

    # Find current leader
    for node in patroni1 patroni2 patroni3; do
        port=$((8008 + $(echo $node | grep -o '[0-9]') - 1))
        if curl -s "http://localhost:$port/primary" > /dev/null 2>&1; then
            log_info "Current leader: $node"
            log_info "Initiating switchover to: $target"

            curl -s -X POST "http://localhost:$port/switchover" \
                -H "Content-Type: application/json" \
                -d "{\"leader\": \"$node\", \"candidate\": \"$target\"}"

            log_info "Switchover initiated"
            sleep 15
            cmd_status
            return
        fi
    done
}

# Backup current leader
cmd_backup() {
    log_header "Creating Backup"

    # Find current leader
    for node in patroni1 patroni2 patroni3; do
        port=$((8008 + $(echo $node | grep -o '[0-9]') - 1))
        if curl -s "http://localhost:$port/primary" > /dev/null 2>&1; then
            container="email-$node"
            timestamp=$(date +%Y%m%d_%H%M%S)
            backup_file="backup_${timestamp}.sql.gz"

            log_info "Creating backup from $node..."
            docker exec $container pg_dumpall -U postgres | gzip > "$backup_file"

            log_info "Backup saved to: $backup_file"
            return
        fi
    done

    log_error "Could not find leader for backup"
    exit 1
}

# Show help
cmd_help() {
    echo "PostgreSQL HA Cluster Management"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  start              Start the HA cluster"
    echo "  stop               Stop the HA cluster"
    echo "  destroy            Destroy cluster and delete all data"
    echo "  status             Show cluster status"
    echo "  logs [node]        Show logs (optionally for specific node)"
    echo "  failover <node>    Force failover to specified node"
    echo "  switchover <node>  Graceful switchover to specified node"
    echo "  reinit <node>      Reinitialize a failed node"
    echo "  backup             Create database backup"
    echo "  help               Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 status"
    echo "  $0 failover patroni2"
    echo "  $0 logs patroni1"
}

# Main
case "${1:-help}" in
    start)      cmd_start ;;
    stop)       cmd_stop ;;
    destroy)    cmd_destroy ;;
    status)     cmd_status ;;
    logs)       cmd_logs "$2" ;;
    failover)   cmd_failover "$2" ;;
    switchover) cmd_switchover "$2" ;;
    reinit)     cmd_reinit "$2" ;;
    backup)     cmd_backup ;;
    help|*)     cmd_help ;;
esac
