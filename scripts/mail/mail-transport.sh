#!/bin/bash
# CEERION Mail Transport Management Script
# Production operations and monitoring

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# Help function
show_help() {
    echo "CEERION Mail Transport Management"
    echo ""
    echo "Usage: $0 COMMAND [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  start       Start all mail services"
    echo "  stop        Stop all mail services"
    echo "  restart     Restart all mail services"
    echo "  status      Show service status"
    echo "  logs        Show service logs"
    echo "  backup      Run manual backup"
    echo "  restore     Run restore test"
    echo "  monitor     Show real-time monitoring"
    echo "  test        Run acceptance tests"
    echo "  setup       Initial setup"
    echo "  cleanup     Cleanup old data"
    echo "  health      Health check"
    echo ""
    echo "Examples:"
    echo "  $0 start              # Start all services"
    echo "  $0 logs postfix       # Show Postfix logs"
    echo "  $0 backup             # Run manual backup"
    echo "  $0 test smtp          # Test SMTP functionality"
}

# Start services
start_services() {
    log "Starting CEERION Mail Transport..."
    docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" up -d
    log "Services started ✓"
}

# Stop services
stop_services() {
    log "Stopping CEERION Mail Transport..."
    docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" down
    log "Services stopped ✓"
}

# Restart services
restart_services() {
    log "Restarting CEERION Mail Transport..."
    docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" restart
    log "Services restarted ✓"
}

# Show service status
show_status() {
    log "CEERION Mail Transport Status:"
    echo ""
    docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" ps
    echo ""
    
    # Show port status
    log "Port Status:"
    ports=(25 143 587 993 8080 11334)
    for port in "${ports[@]}"; do
        if timeout 1 bash -c "</dev/tcp/localhost/$port" &>/dev/null; then
            echo -e "  Port $port: ${GREEN}✓ Open${NC}"
        else
            echo -e "  Port $port: ${RED}✗ Closed${NC}"
        fi
    done
}

# Show logs
show_logs() {
    local service="${1:-}"
    
    if [[ -n "$service" ]]; then
        log "Showing logs for $service..."
        docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" logs -f "$service"
    else
        log "Showing logs for all services..."
        docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" logs -f
    fi
}

# Run backup
run_backup() {
    log "Running manual backup..."
    docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" exec backup-service \
        /backup/scripts/backup.sh
    log "Backup completed ✓"
}

# Run restore test
run_restore() {
    log "Running restore test..."
    docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" exec backup-service \
        /backup/scripts/test-restore.sh
    log "Restore test completed ✓"
}

# Show monitoring
show_monitoring() {
    log "Real-time Mail Transport Monitoring"
    echo ""
    
    while true; do
        clear
        echo -e "${BLUE}CEERION Mail Transport - Live Monitor${NC}"
        echo "$(date)"
        echo "========================================"
        echo ""
        
        # Service status
        echo -e "${YELLOW}Service Status:${NC}"
        docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        
        # Queue status
        echo -e "${YELLOW}Mail Queue:${NC}"
        if docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" exec -T postfix postqueue -p 2>/dev/null | grep -q "Mail queue is empty"; then
            echo "✓ Queue is empty"
        else
            docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" exec -T postfix postqueue -p | head -20
        fi
        echo ""
        
        # Database connections
        echo -e "${YELLOW}Database Connections:${NC}"
        docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" exec -T postgres-mail \
            psql -U ceerion -d ceerion_mail -c "SELECT COUNT(*) as active_connections FROM pg_stat_activity;" 2>/dev/null || echo "Unable to connect"
        echo ""
        
        # Memory usage
        echo -e "${YELLOW}Memory Usage:${NC}"
        docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" | grep ceerion
        
        echo ""
        echo "Press Ctrl+C to exit"
        sleep 5
    done
}

# Run acceptance tests
run_tests() {
    local test_type="${1:-all}"
    
    case "$test_type" in
        "smtp")
            test_smtp
            ;;
        "imap")
            test_imap
            ;;
        "jmap")
            test_jmap
            ;;
        "security")
            test_security
            ;;
        "all")
            test_smtp
            test_imap
            test_jmap
            test_security
            ;;
        *)
            error "Unknown test type: $test_type"
            exit 1
            ;;
    esac
}

# Test SMTP functionality
test_smtp() {
    log "Testing SMTP functionality..."
    
    # Test SMTP connectivity
    if timeout 5 bash -c "</dev/tcp/localhost/25"; then
        log "SMTP port 25: ✓"
    else
        error "SMTP port 25: ✗"
    fi
    
    if timeout 5 bash -c "</dev/tcp/localhost/587"; then
        log "SMTP submission port 587: ✓"
    else
        error "SMTP submission port 587: ✗"
    fi
    
    # Test queue performance
    queue_size=$(docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" exec -T postfix \
        postqueue -p | wc -l)
    
    if [[ $queue_size -lt 5 ]]; then
        log "Mail queue size: ✓ ($queue_size messages)"
    else
        warn "Mail queue size: ⚠ ($queue_size messages)"
    fi
}

# Test IMAP functionality
test_imap() {
    log "Testing IMAP functionality..."
    
    if timeout 5 bash -c "</dev/tcp/localhost/993"; then
        log "IMAP port 993: ✓"
    else
        error "IMAP port 993: ✗"
    fi
    
    if timeout 5 bash -c "</dev/tcp/localhost/143"; then
        log "IMAP port 143: ✓"
    else
        error "IMAP port 143: ✗"
    fi
}

# Test JMAP functionality
test_jmap() {
    log "Testing JMAP functionality..."
    
    if timeout 5 bash -c "</dev/tcp/localhost/8080"; then
        log "JMAP port 8080: ✓"
    else
        error "JMAP port 8080: ✗"
    fi
    
    # Test JMAP WebSocket
    if timeout 5 bash -c "</dev/tcp/localhost/8081"; then
        log "JMAP WebSocket port 8081: ✓"
    else
        error "JMAP WebSocket port 8081: ✗"
    fi
}

# Test security features
test_security() {
    log "Testing security features..."
    
    # Test TLS configuration
    if openssl s_client -connect localhost:993 -verify_return_error </dev/null 2>/dev/null; then
        log "TLS configuration: ✓"
    else
        warn "TLS configuration: ⚠ (may be using self-signed certificate)"
    fi
    
    # Test DKIM setup
    if [[ -f "$PROJECT_ROOT/docker/dkim/ceerion.private" ]]; then
        log "DKIM private key: ✓"
    else
        error "DKIM private key: ✗"
    fi
    
    # Test Rspamd
    if timeout 5 bash -c "</dev/tcp/localhost/11334"; then
        log "Rspamd web interface: ✓"
    else
        error "Rspamd web interface: ✗"
    fi
}

# Health check
health_check() {
    log "Running comprehensive health check..."
    
    local healthy=0
    local total=0
    
    # Service health checks
    services=("postgres-mail" "redis-mail" "postfix" "dovecot" "rspamd" "clamav" "nginx-mail")
    
    for service in "${services[@]}"; do
        ((total++))
        if docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" ps "$service" | grep -q "healthy\|Up"; then
            log "$service: ✓"
            ((healthy++))
        else
            error "$service: ✗"
        fi
    done
    
    # Port checks
    ports=(25 143 587 993 8080 11334)
    for port in "${ports[@]}"; do
        ((total++))
        if timeout 1 bash -c "</dev/tcp/localhost/$port" &>/dev/null; then
            ((healthy++))
        fi
    done
    
    # Health score
    local score=$((healthy * 100 / total))
    
    echo ""
    log "Health Score: $score% ($healthy/$total checks passed)"
    
    if [[ $score -ge 90 ]]; then
        log "System status: ✓ HEALTHY"
    elif [[ $score -ge 70 ]]; then
        warn "System status: ⚠ DEGRADED"
    else
        error "System status: ✗ UNHEALTHY"
    fi
}

# Cleanup old data
cleanup_data() {
    log "Cleaning up old data..."
    
    # Cleanup old logs
    find /var/log -name "*.log" -mtime +30 -delete 2>/dev/null || true
    
    # Cleanup old backup files
    docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" exec backup-service \
        find /backup -name "*.enc" -mtime +3 -delete 2>/dev/null || true
    
    # Cleanup Docker
    docker system prune -f --volumes
    
    log "Cleanup completed ✓"
}

# Main execution
main() {
    local command="${1:-help}"
    
    case "$command" in
        "start")
            start_services
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            restart_services
            ;;
        "status")
            show_status
            ;;
        "logs")
            show_logs "${2:-}"
            ;;
        "backup")
            run_backup
            ;;
        "restore")
            run_restore
            ;;
        "monitor")
            show_monitoring
            ;;
        "test")
            run_tests "${2:-all}"
            ;;
        "setup")
            "$SCRIPT_DIR/setup-mail-transport.sh"
            ;;
        "cleanup")
            cleanup_data
            ;;
        "health")
            health_check
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# Execute main function with all arguments
main "$@"
