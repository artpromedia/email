#!/bin/bash
# Health Check Script for Production Readiness
# Comprehensive health verification for all services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Configuration
NAMESPACE="${NAMESPACE:-email-production}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
TIMEOUT="${HEALTH_CHECK_TIMEOUT:-30}"

# Thresholds
ERROR_RATE_THRESHOLD="${ERROR_RATE_THRESHOLD:-1}"         # Percent
LATENCY_P95_THRESHOLD="${LATENCY_P95_THRESHOLD:-1000}"    # Milliseconds
DELIVERY_RATE_THRESHOLD="${DELIVERY_RATE_THRESHOLD:-98}"  # Percent

usage() {
    cat << EOF
Health Check Script

Usage: $0 [options]

Options:
    --quick             Run quick checks only
    --full              Run full comprehensive checks
    --services-only     Check only service health
    --metrics-only      Check only metrics
    --json              Output in JSON format
    -v, --verbose       Verbose output
    -h, --help          Show this help

Environment Variables:
    NAMESPACE               Kubernetes namespace (default: email-production)
    PROMETHEUS_URL          Prometheus URL (default: http://localhost:9090)
    ERROR_RATE_THRESHOLD    Error rate threshold % (default: 1)
    LATENCY_P95_THRESHOLD   P95 latency threshold ms (default: 1000)
    DELIVERY_RATE_THRESHOLD Email delivery rate threshold % (default: 98)

EOF
    exit 0
}

# Service health checks
check_services() {
    log_info "Checking service health..."
    local errors=0

    # Core services
    local services=(
        "auth:8080:/health"
        "smtp-server:2525:/health"
        "imap-server:1143:/health"
        "web:3000:/api/health"
        "admin:3001:/api/health"
        "domain-manager:8082:/health"
    )

    for service_def in "${services[@]}"; do
        IFS=':' read -r name port path <<< "$service_def"

        local url="http://localhost:${port}${path}"
        local status
        status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$TIMEOUT" "$url" 2>/dev/null || echo "000")

        if [ "$status" = "200" ]; then
            echo "  ✓ $name: healthy ($status)"
        else
            echo "  ✗ $name: unhealthy ($status)"
            ((errors++)) || true
        fi
    done

    return $errors
}

# Database health checks
check_database() {
    log_info "Checking database health..."
    local errors=0

    # PostgreSQL primary
    if pg_isready -h localhost -p 5432 -U postgres > /dev/null 2>&1; then
        echo "  ✓ PostgreSQL primary: ready"
    else
        echo "  ✗ PostgreSQL primary: not ready"
        ((errors++)) || true
    fi

    # PostgreSQL replica (if configured)
    if pg_isready -h localhost -p 5433 -U postgres > /dev/null 2>&1; then
        echo "  ✓ PostgreSQL replica: ready"
    else
        echo "  ○ PostgreSQL replica: not configured or unreachable"
    fi

    # Redis
    if redis-cli -h localhost ping 2>/dev/null | grep -q "PONG"; then
        echo "  ✓ Redis: ready"
    else
        echo "  ✗ Redis: not ready"
        ((errors++)) || true
    fi

    # Connection pool
    local active_connections
    active_connections=$(psql -h localhost -U postgres -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null | tr -d ' ' || echo "0")
    local max_connections
    max_connections=$(psql -h localhost -U postgres -t -c "SHOW max_connections;" 2>/dev/null | tr -d ' ' || echo "100")

    local usage_pct=$((active_connections * 100 / max_connections))
    if [ $usage_pct -lt 80 ]; then
        echo "  ✓ Connection pool: $active_connections/$max_connections ($usage_pct%)"
    else
        echo "  ⚠ Connection pool: $active_connections/$max_connections ($usage_pct%) - high usage"
    fi

    return $errors
}

# Kubernetes health checks
check_kubernetes_resources() {
    log_info "Checking Kubernetes resources..."
    local errors=0

    # Check deployments
    local deployments
    deployments=$(kubectl get deployments -n "$NAMESPACE" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

    if [ -z "$deployments" ]; then
        echo "  ○ No deployments found in namespace $NAMESPACE"
        return 0
    fi

    for deployment in $deployments; do
        local ready
        ready=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        local desired
        desired=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")

        if [ "$ready" = "$desired" ] && [ "$desired" != "0" ]; then
            echo "  ✓ $deployment: $ready/$desired ready"
        else
            echo "  ✗ $deployment: $ready/$desired ready"
            ((errors++)) || true
        fi
    done

    # Check for pod issues
    local failing_pods
    failing_pods=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase!=Running,status.phase!=Succeeded -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")

    if [ -n "$failing_pods" ]; then
        echo "  ⚠ Pods not running: $failing_pods"
    fi

    return $errors
}

# Metrics health checks
check_metrics() {
    log_info "Checking metrics thresholds..."
    local errors=0

    # Error rate (last 5 minutes)
    local error_rate
    error_rate=$(curl -s "${PROMETHEUS_URL}/api/v1/query?query=sum(rate(http_requests_total{status=~\"5..\"}[5m]))/sum(rate(http_requests_total[5m]))*100" 2>/dev/null | jq -r '.data.result[0].value[1] // "0"' || echo "0")

    if (( $(echo "$error_rate < $ERROR_RATE_THRESHOLD" | bc -l 2>/dev/null || echo "1") )); then
        echo "  ✓ Error rate: ${error_rate}% (threshold: ${ERROR_RATE_THRESHOLD}%)"
    else
        echo "  ✗ Error rate: ${error_rate}% (threshold: ${ERROR_RATE_THRESHOLD}%)"
        ((errors++)) || true
    fi

    # P95 latency (last 5 minutes)
    local latency_p95
    latency_p95=$(curl -s "${PROMETHEUS_URL}/api/v1/query?query=histogram_quantile(0.95,sum(rate(http_request_duration_seconds_bucket[5m]))by(le))*1000" 2>/dev/null | jq -r '.data.result[0].value[1] // "0"' || echo "0")
    latency_p95=$(printf "%.0f" "$latency_p95" 2>/dev/null || echo "0")

    if [ "$latency_p95" -lt "$LATENCY_P95_THRESHOLD" ] 2>/dev/null; then
        echo "  ✓ P95 latency: ${latency_p95}ms (threshold: ${LATENCY_P95_THRESHOLD}ms)"
    else
        echo "  ✗ P95 latency: ${latency_p95}ms (threshold: ${LATENCY_P95_THRESHOLD}ms)"
        ((errors++)) || true
    fi

    # Email delivery rate (last hour)
    local delivery_rate
    delivery_rate=$(curl -s "${PROMETHEUS_URL}/api/v1/query?query=sum(rate(emails_delivered_total[1h]))/sum(rate(emails_sent_total[1h]))*100" 2>/dev/null | jq -r '.data.result[0].value[1] // "100"' || echo "100")

    if (( $(echo "$delivery_rate >= $DELIVERY_RATE_THRESHOLD" | bc -l 2>/dev/null || echo "1") )); then
        echo "  ✓ Delivery rate: ${delivery_rate}% (threshold: ${DELIVERY_RATE_THRESHOLD}%)"
    else
        echo "  ✗ Delivery rate: ${delivery_rate}% (threshold: ${DELIVERY_RATE_THRESHOLD}%)"
        ((errors++)) || true
    fi

    return $errors
}

# Queue health checks
check_queues() {
    log_info "Checking queue health..."
    local errors=0

    # Email queue depth
    local queue_depth
    queue_depth=$(curl -s "${PROMETHEUS_URL}/api/v1/query?query=email_queue_depth" 2>/dev/null | jq -r '.data.result[0].value[1] // "0"' || echo "0")

    if [ "${queue_depth:-0}" -lt 10000 ] 2>/dev/null; then
        echo "  ✓ Email queue: $queue_depth messages"
    else
        echo "  ⚠ Email queue: $queue_depth messages (high)"
    fi

    # Redis queue lengths (if using Redis for queues)
    local redis_queue
    redis_queue=$(redis-cli -h localhost LLEN email:outbound 2>/dev/null || echo "0")
    echo "  ○ Redis outbound queue: $redis_queue"

    return $errors
}

# Certificate health checks
check_certificates() {
    log_info "Checking certificate expiry..."
    local errors=0

    local endpoints=(
        "localhost:443"
        "localhost:587"
        "localhost:993"
    )

    for endpoint in "${endpoints[@]}"; do
        local expiry
        expiry=$(echo | openssl s_client -connect "$endpoint" -servername localhost 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || echo "")

        if [ -n "$expiry" ]; then
            local expiry_epoch
            expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || echo "0")
            local now_epoch
            now_epoch=$(date +%s)
            local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

            if [ $days_left -gt 30 ]; then
                echo "  ✓ $endpoint: expires in $days_left days"
            elif [ $days_left -gt 7 ]; then
                echo "  ⚠ $endpoint: expires in $days_left days (renew soon)"
            else
                echo "  ✗ $endpoint: expires in $days_left days (critical)"
                ((errors++)) || true
            fi
        else
            echo "  ○ $endpoint: certificate not found or not SSL"
        fi
    done

    return $errors
}

# Disk space checks
check_disk_space() {
    log_info "Checking disk space..."
    local errors=0

    local mounts=("/" "/var/lib/postgresql" "/var/log" "/backups")

    for mount in "${mounts[@]}"; do
        if [ -d "$mount" ]; then
            local usage
            usage=$(df -h "$mount" 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%' || echo "0")

            if [ "$usage" -lt 80 ] 2>/dev/null; then
                echo "  ✓ $mount: ${usage}% used"
            elif [ "$usage" -lt 90 ]; then
                echo "  ⚠ $mount: ${usage}% used (warning)"
            else
                echo "  ✗ $mount: ${usage}% used (critical)"
                ((errors++)) || true
            fi
        fi
    done

    return $errors
}

# Main execution
main() {
    local quick=false
    local services_only=false
    local metrics_only=false
    local json_output=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --quick)
                quick=true
                shift
                ;;
            --full)
                quick=false
                shift
                ;;
            --services-only)
                services_only=true
                shift
                ;;
            --metrics-only)
                metrics_only=true
                shift
                ;;
            --json)
                json_output=true
                shift
                ;;
            -v|--verbose)
                set -x
                shift
                ;;
            -h|--help)
                usage
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                ;;
        esac
    done

    echo ""
    echo "=========================================="
    echo "  Production Health Check"
    echo "  $(date)"
    echo "=========================================="
    echo ""

    local total_errors=0

    if [ "$services_only" = "true" ]; then
        check_services || total_errors=$((total_errors + $?))
    elif [ "$metrics_only" = "true" ]; then
        check_metrics || total_errors=$((total_errors + $?))
    else
        check_services || total_errors=$((total_errors + $?))
        echo ""
        check_database || total_errors=$((total_errors + $?))
        echo ""

        if [ "$quick" = "false" ]; then
            check_kubernetes_resources || total_errors=$((total_errors + $?))
            echo ""
            check_metrics || total_errors=$((total_errors + $?))
            echo ""
            check_queues || total_errors=$((total_errors + $?))
            echo ""
            check_certificates || total_errors=$((total_errors + $?))
            echo ""
            check_disk_space || total_errors=$((total_errors + $?))
        fi
    fi

    echo ""
    echo "=========================================="
    if [ $total_errors -eq 0 ]; then
        echo "  Health Check: PASSED ✓"
        echo "=========================================="
        exit 0
    else
        echo "  Health Check: FAILED ($total_errors issues)"
        echo "=========================================="
        exit 1
    fi
}

main "$@"
