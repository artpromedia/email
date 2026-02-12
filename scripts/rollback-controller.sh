#!/bin/bash
# Production Rollback Controller
# Coordinates rollback procedures across all phases

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
NAMESPACE="${NAMESPACE:-email-production}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
STATUS_PAGE_API="${STATUS_PAGE_API:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    cat << EOF
Enterprise Email Platform - Rollback Controller

Usage: $0 <command> [options]

Commands:
    status              Show current deployment phase and health
    rollback <phase>    Execute rollback to specified phase
    health-check        Run comprehensive health check
    list-backups        List available database backups
    validate <phase>    Validate rollback prerequisites

Phases:
    pre-alpha           Before any deployment (clean state)
    alpha               Phase 1: Internal Alpha
    beta                Phase 2: Closed Beta
    limited             Phase 3: Limited Production
    ga                  Phase 4: General Availability

Options:
    -f, --force         Skip confirmation prompts
    -d, --dry-run       Show what would be done without executing
    -v, --verbose       Verbose output
    -h, --help          Show this help message

Examples:
    $0 status
    $0 rollback beta --dry-run
    $0 rollback alpha --force
    $0 health-check

Environment Variables:
    BACKUP_DIR          Backup directory (default: /backups/postgres)
    NAMESPACE           Kubernetes namespace (default: email-production)
    ALERT_WEBHOOK       Webhook URL for alerts
    STATUS_PAGE_API     Status page API endpoint

EOF
    exit 1
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

send_alert() {
    local severity=$1
    local message=$2

    if [ -n "$ALERT_WEBHOOK" ]; then
        curl -s -X POST "$ALERT_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"[$severity] $message\", \"severity\": \"$severity\"}" \
            > /dev/null 2>&1 || true
    fi

    log_info "Alert sent: [$severity] $message"
}

update_status_page() {
    local status=$1
    local message=$2

    if [ -n "$STATUS_PAGE_API" ]; then
        curl -s -X POST "$STATUS_PAGE_API/incidents" \
            -H "Content-Type: application/json" \
            -d "{\"status\": \"$status\", \"message\": \"$message\"}" \
            > /dev/null 2>&1 || true
    fi
}

get_current_phase() {
    local config_phase
    config_phase=$(kubectl get configmap app-config -n "$NAMESPACE" -o jsonpath='{.data.DEPLOYMENT_PHASE}' 2>/dev/null || echo "unknown")
    echo "$config_phase"
}

health_check() {
    log_info "Running comprehensive health check..."

    local errors=0

    # Check Kubernetes deployments
    log_info "Checking Kubernetes deployments..."
    for deployment in auth smtp-server imap-server web admin; do
        local ready
        ready=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        local desired
        desired=$(kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")

        if [ "$ready" = "$desired" ] && [ "$desired" != "0" ]; then
            echo "  ✓ $deployment: $ready/$desired replicas ready"
        else
            echo "  ✗ $deployment: $ready/$desired replicas ready"
            ((errors++)) || true
        fi
    done

    # Check database
    log_info "Checking PostgreSQL..."
    if pg_isready -h localhost -p 5432 -U postgres > /dev/null 2>&1; then
        echo "  ✓ PostgreSQL: responsive"
    else
        echo "  ✗ PostgreSQL: not responding"
        ((errors++)) || true
    fi

    # Check Redis
    log_info "Checking Redis..."
    if redis-cli -h localhost ping 2>/dev/null | grep -q "PONG"; then
        echo "  ✓ Redis: responsive"
    else
        echo "  ✗ Redis: not responding"
        ((errors++)) || true
    fi

    # Check service endpoints
    log_info "Checking service endpoints..."
    for endpoint in "http://localhost:8080/health" "http://localhost:3000/api/health"; do
        local status
        status=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint" 2>/dev/null || echo "000")
        if [ "$status" = "200" ]; then
            echo "  ✓ $endpoint: $status"
        else
            echo "  ✗ $endpoint: $status"
            ((errors++)) || true
        fi
    done

    # Check error rate
    log_info "Checking error rate (last 5 minutes)..."
    local error_rate
    error_rate=$(curl -s "http://localhost:9090/api/v1/query?query=sum(rate(http_requests_total{status=~\"5..\"}[5m]))/sum(rate(http_requests_total[5m]))*100" 2>/dev/null | jq -r '.data.result[0].value[1] // "0"' || echo "0")
    if (( $(echo "$error_rate < 1" | bc -l) )); then
        echo "  ✓ Error rate: ${error_rate}%"
    else
        echo "  ✗ Error rate: ${error_rate}% (threshold: 1%)"
        ((errors++)) || true
    fi

    if [ $errors -eq 0 ]; then
        log_info "Health check passed ✓"
        return 0
    else
        log_error "Health check failed with $errors error(s)"
        return 1
    fi
}

list_backups() {
    log_info "Available backups in $BACKUP_DIR:"

    if [ -d "$BACKUP_DIR" ]; then
        find "$BACKUP_DIR" -name "*.sql.gz" -type f -printf "%T+ %p\n" | sort -r | head -20
    else
        log_warn "Backup directory not found: $BACKUP_DIR"
    fi
}

validate_rollback() {
    local target_phase=$1
    log_info "Validating rollback prerequisites for: $target_phase"

    local errors=0

    # Check backup availability
    case $target_phase in
        pre-alpha)
            backup_tag="initial"
            ;;
        alpha)
            backup_tag="pre-alpha"
            ;;
        beta)
            backup_tag="pre-beta"
            ;;
        limited)
            backup_tag="pre-limited-prod"
            ;;
        *)
            log_error "Unknown phase: $target_phase"
            return 1
            ;;
    esac

    local backup_file
    backup_file=$(find "$BACKUP_DIR" -name "*${backup_tag}*.sql.gz" -type f 2>/dev/null | head -1)
    if [ -n "$backup_file" ]; then
        echo "  ✓ Backup available: $backup_file"
    else
        echo "  ✗ No backup found with tag: $backup_tag"
        ((errors++)) || true
    fi

    # Check Kubernetes access
    if kubectl auth can-i update deployments -n "$NAMESPACE" > /dev/null 2>&1; then
        echo "  ✓ Kubernetes access: authorized"
    else
        echo "  ✗ Kubernetes access: not authorized"
        ((errors++)) || true
    fi

    # Check rollback config exists
    local config_file="${SCRIPT_DIR}/../infrastructure/kubernetes/configmap-${target_phase}.yaml"
    if [ -f "$config_file" ]; then
        echo "  ✓ Config file: $config_file"
    else
        echo "  ✗ Config file not found: $config_file"
        ((errors++)) || true
    fi

    if [ $errors -eq 0 ]; then
        log_info "Validation passed ✓"
        return 0
    else
        log_error "Validation failed with $errors error(s)"
        return 1
    fi
}

rollback_to_pre_alpha() {
    log_info "Rolling back to pre-alpha (clean state)..."

    send_alert "CRITICAL" "ROLLBACK: Rolling back to pre-alpha state"
    update_status_page "major_outage" "Service rollback in progress"

    # Scale down all deployments
    log_info "Scaling down all deployments..."
    kubectl scale deployment --all --replicas=0 -n "$NAMESPACE"

    # Remove ingress
    log_info "Removing ingress..."
    kubectl delete ingress --all -n "$NAMESPACE" 2>/dev/null || true

    # Restore initial database
    log_info "Restoring initial database..."
    local backup_file
    backup_file=$(find "$BACKUP_DIR" -name "*initial*.sql.gz" -type f | head -1)
    if [ -n "$backup_file" ]; then
        "${SCRIPT_DIR}/backups/restore-postgres.sh" "$backup_file" --confirm
    fi

    # Update phase marker
    kubectl patch configmap app-config -n "$NAMESPACE" --type merge -p '{"data":{"DEPLOYMENT_PHASE":"pre-alpha"}}'

    log_info "Rollback to pre-alpha complete"
    update_status_page "resolved" "Rollback complete - service at pre-alpha state"
}

rollback_to_alpha() {
    log_info "Rolling back to Phase 1 (Alpha)..."

    send_alert "HIGH" "ROLLBACK: Rolling back to Phase 1 Alpha"
    update_status_page "major_outage" "Service rollback to alpha in progress"

    # Restore alpha configuration
    log_info "Applying alpha configuration..."
    kubectl apply -f "${SCRIPT_DIR}/../infrastructure/kubernetes/configmap-alpha.yaml"

    # Scale to alpha levels
    log_info "Scaling to alpha capacity..."
    kubectl scale deployment auth --replicas=2 -n "$NAMESPACE"
    kubectl scale deployment smtp-server --replicas=2 -n "$NAMESPACE"
    kubectl scale deployment imap-server --replicas=2 -n "$NAMESPACE"
    kubectl scale deployment web --replicas=2 -n "$NAMESPACE"
    kubectl scale deployment admin --replicas=1 -n "$NAMESPACE"

    # Rollback deployments
    log_info "Rolling back deployment versions..."
    kubectl rollout undo deployment/auth -n "$NAMESPACE"
    kubectl rollout undo deployment/smtp-server -n "$NAMESPACE"
    kubectl rollout undo deployment/imap-server -n "$NAMESPACE"
    kubectl rollout undo deployment/web -n "$NAMESPACE"

    # Wait for rollout
    log_info "Waiting for rollout to complete..."
    kubectl rollout status deployment/auth -n "$NAMESPACE" --timeout=300s
    kubectl rollout status deployment/smtp-server -n "$NAMESPACE" --timeout=300s

    # Apply alpha ingress
    log_info "Applying alpha ingress..."
    kubectl apply -f "${SCRIPT_DIR}/../infrastructure/kubernetes/ingress-alpha.yaml"

    # Update phase marker
    kubectl patch configmap app-config -n "$NAMESPACE" --type merge -p '{"data":{"DEPLOYMENT_PHASE":"alpha"}}'

    log_info "Rollback to alpha complete"
    update_status_page "resolved" "Rollback complete - service restored to alpha"
}

rollback_to_beta() {
    log_info "Rolling back to Phase 2 (Beta)..."

    send_alert "HIGH" "ROLLBACK: Rolling back to Phase 2 Beta"
    update_status_page "partial_outage" "Service rollback to beta in progress"

    # Notify beta users
    log_info "Notifying beta users..."
    "${SCRIPT_DIR}/notify-beta-users.sh" --status=maintenance 2>/dev/null || true

    # Restore beta configuration
    log_info "Applying beta configuration..."
    kubectl apply -f "${SCRIPT_DIR}/../infrastructure/kubernetes/configmap-beta.yaml"

    # Scale to beta levels
    log_info "Scaling to beta capacity..."
    kubectl scale deployment auth --replicas=3 -n "$NAMESPACE"
    kubectl scale deployment smtp-server --replicas=3 -n "$NAMESPACE"
    kubectl scale deployment imap-server --replicas=3 -n "$NAMESPACE"
    kubectl scale deployment web --replicas=3 -n "$NAMESPACE"
    kubectl scale deployment admin --replicas=2 -n "$NAMESPACE"

    # Rolling restart
    log_info "Rolling restart of services..."
    kubectl rollout restart deployment -n "$NAMESPACE"

    # Wait for rollout
    kubectl rollout status deployment/auth -n "$NAMESPACE" --timeout=300s
    kubectl rollout status deployment/smtp-server -n "$NAMESPACE" --timeout=300s

    # Apply beta ingress
    log_info "Applying beta ingress..."
    kubectl apply -f "${SCRIPT_DIR}/../infrastructure/kubernetes/ingress-beta.yaml"

    # Update phase marker
    kubectl patch configmap app-config -n "$NAMESPACE" --type merge -p '{"data":{"DEPLOYMENT_PHASE":"beta"}}'

    log_info "Rollback to beta complete"
    update_status_page "resolved" "Rollback complete - service restored to beta"
}

rollback_to_limited() {
    log_info "Rolling back to Phase 3 (Limited Production)..."

    send_alert "CRITICAL" "ROLLBACK: Rolling back to Phase 3 Limited Production"
    update_status_page "major_outage" "Service rollback to limited production in progress"

    # Notify customers
    log_info "Notifying customers..."
    "${SCRIPT_DIR}/notify-customers.sh" --status=maintenance --severity=high 2>/dev/null || true

    # Disable auto-scaling if enabled
    log_info "Disabling auto-scaling..."
    kubectl delete hpa --all -n "$NAMESPACE" 2>/dev/null || true

    # Re-enable traffic controls
    log_info "Re-enabling traffic controls..."
    kubectl annotate ingress email-production \
        nginx.ingress.kubernetes.io/canary-weight=50 \
        --overwrite 2>/dev/null || true

    # Restore limited production configuration
    log_info "Applying limited production configuration..."
    kubectl apply -f "${SCRIPT_DIR}/../infrastructure/kubernetes/configmap-limited.yaml"

    # Scale to limited production levels
    log_info "Scaling to limited production capacity..."
    kubectl scale deployment auth --replicas=5 -n "$NAMESPACE"
    kubectl scale deployment smtp-server --replicas=5 -n "$NAMESPACE"
    kubectl scale deployment imap-server --replicas=5 -n "$NAMESPACE"
    kubectl scale deployment web --replicas=5 -n "$NAMESPACE"
    kubectl scale deployment admin --replicas=3 -n "$NAMESPACE"

    # Wait for rollout
    kubectl rollout status deployment/auth -n "$NAMESPACE" --timeout=300s
    kubectl rollout status deployment/smtp-server -n "$NAMESPACE" --timeout=300s

    # Apply limited production ingress
    log_info "Applying limited production ingress..."
    kubectl apply -f "${SCRIPT_DIR}/../infrastructure/kubernetes/ingress-limited.yaml"

    # Update phase marker
    kubectl patch configmap app-config -n "$NAMESPACE" --type merge -p '{"data":{"DEPLOYMENT_PHASE":"limited"}}'

    log_info "Rollback to limited production complete"
    update_status_page "resolved" "Rollback complete - service at limited production"
}

show_status() {
    local current_phase
    current_phase=$(get_current_phase)

    echo ""
    echo "=========================================="
    echo "  Enterprise Email Platform Status"
    echo "=========================================="
    echo ""
    echo "Current Phase: $current_phase"
    echo ""
    echo "Deployment Status:"
    kubectl get deployments -n "$NAMESPACE" -o wide 2>/dev/null || echo "  Unable to fetch deployments"
    echo ""
    echo "Pod Status:"
    kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | awk '{printf "  %-40s %s\n", $1, $3}' || echo "  Unable to fetch pods"
    echo ""
    echo "Recent Events:"
    kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' 2>/dev/null | tail -5 || echo "  Unable to fetch events"
    echo ""
}

execute_rollback() {
    local target_phase=$1
    local force=$2
    local dry_run=$3

    local current_phase
    current_phase=$(get_current_phase)

    log_info "Current phase: $current_phase"
    log_info "Target phase: $target_phase"

    # Validate
    if ! validate_rollback "$target_phase"; then
        log_error "Rollback validation failed"
        exit 1
    fi

    # Confirm
    if [ "$force" != "true" ] && [ "$dry_run" != "true" ]; then
        echo ""
        log_warn "WARNING: This will rollback from '$current_phase' to '$target_phase'"
        log_warn "This may cause service disruption and data changes."
        echo ""
        read -p "Are you sure you want to proceed? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log_info "Rollback cancelled"
            exit 0
        fi
    fi

    if [ "$dry_run" = "true" ]; then
        log_info "[DRY RUN] Would execute rollback to: $target_phase"
        log_info "[DRY RUN] No changes made"
        exit 0
    fi

    # Execute rollback
    case $target_phase in
        pre-alpha)
            rollback_to_pre_alpha
            ;;
        alpha)
            rollback_to_alpha
            ;;
        beta)
            rollback_to_beta
            ;;
        limited)
            rollback_to_limited
            ;;
        *)
            log_error "Unknown phase: $target_phase"
            exit 1
            ;;
    esac

    # Run health check
    log_info "Running post-rollback health check..."
    sleep 30  # Wait for services to stabilize
    health_check
}

# Main
FORCE="false"
DRY_RUN="false"
VERBOSE="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force)
            FORCE="true"
            shift
            ;;
        -d|--dry-run)
            DRY_RUN="true"
            shift
            ;;
        -v|--verbose)
            VERBOSE="true"
            set -x
            shift
            ;;
        -h|--help)
            usage
            ;;
        status)
            show_status
            exit 0
            ;;
        health-check)
            health_check
            exit $?
            ;;
        list-backups)
            list_backups
            exit 0
            ;;
        validate)
            shift
            if [ -z "$1" ]; then
                log_error "Phase required for validate command"
                exit 1
            fi
            validate_rollback "$1"
            exit $?
            ;;
        rollback)
            shift
            if [ -z "$1" ]; then
                log_error "Phase required for rollback command"
                exit 1
            fi
            execute_rollback "$1" "$FORCE" "$DRY_RUN"
            exit $?
            ;;
        *)
            log_error "Unknown command: $1"
            usage
            ;;
    esac
done

usage
