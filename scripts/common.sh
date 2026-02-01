#!/bin/bash
# Common functions for deployment scripts

set -e

# Logging utilities
log_timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
    echo "[$(log_timestamp)] [INFO] $1"
}

log_warn() {
    echo "[$(log_timestamp)] [WARN] $1" >&2
}

log_error() {
    echo "[$(log_timestamp)] [ERROR] $1" >&2
}

log_debug() {
    if [ "${DEBUG:-false}" = "true" ]; then
        echo "[$(log_timestamp)] [DEBUG] $1"
    fi
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Require command
require_command() {
    if ! command_exists "$1"; then
        log_error "Required command not found: $1"
        exit 1
    fi
}

# Check Kubernetes connectivity
check_kubernetes() {
    if ! kubectl cluster-info >/dev/null 2>&1; then
        log_error "Cannot connect to Kubernetes cluster"
        return 1
    fi
    return 0
}

# Wait for deployment
wait_for_deployment() {
    local deployment=$1
    local namespace=${2:-default}
    local timeout=${3:-300}

    log_info "Waiting for deployment $deployment in namespace $namespace..."
    kubectl rollout status deployment/"$deployment" -n "$namespace" --timeout="${timeout}s"
}

# Check pod health
check_pod_health() {
    local label=$1
    local namespace=${2:-default}

    local ready
    ready=$(kubectl get pods -l "$label" -n "$namespace" -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)

    if echo "$ready" | grep -q "False"; then
        return 1
    fi
    return 0
}

# Get service endpoint
get_service_endpoint() {
    local service=$1
    local namespace=${2:-default}

    kubectl get service "$service" -n "$namespace" -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null
}

# Send Slack notification
send_slack_notification() {
    local webhook_url=$1
    local message=$2
    local color=${3:-good}

    if [ -z "$webhook_url" ]; then
        log_debug "Slack webhook URL not configured"
        return 0
    fi

    curl -s -X POST "$webhook_url" \
        -H "Content-Type: application/json" \
        -d "{
            \"attachments\": [{
                \"color\": \"$color\",
                \"text\": \"$message\",
                \"ts\": $(date +%s)
            }]
        }" > /dev/null 2>&1 || true
}

# Create timestamped backup tag
create_backup_tag() {
    local prefix=${1:-backup}
    echo "${prefix}-$(date +%Y%m%d-%H%M%S)"
}

# Verify checksum
verify_checksum() {
    local file=$1
    local checksum_file=$2

    if [ ! -f "$checksum_file" ]; then
        log_warn "Checksum file not found: $checksum_file"
        return 1
    fi

    sha256sum -c "$checksum_file" > /dev/null 2>&1
}

# Retry command with exponential backoff
retry_with_backoff() {
    local max_attempts=${1:-5}
    local delay=${2:-1}
    local max_delay=${3:-60}
    shift 3

    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if "$@"; then
            return 0
        fi

        if [ $attempt -lt $max_attempts ]; then
            log_warn "Attempt $attempt failed, retrying in ${delay}s..."
            sleep $delay
            delay=$((delay * 2))
            if [ $delay -gt $max_delay ]; then
                delay=$max_delay
            fi
        fi

        attempt=$((attempt + 1))
    done

    log_error "Command failed after $max_attempts attempts"
    return 1
}

# Check HTTP endpoint
check_http_endpoint() {
    local url=$1
    local expected_status=${2:-200}
    local timeout=${3:-10}

    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$timeout" "$url" 2>/dev/null || echo "000")

    if [ "$status" = "$expected_status" ]; then
        return 0
    fi
    return 1
}

# Parse YAML value (basic)
yaml_get() {
    local file=$1
    local key=$2

    grep "^${key}:" "$file" 2>/dev/null | cut -d':' -f2- | sed 's/^[ \t]*//'
}

# Confirm action
confirm_action() {
    local prompt=${1:-"Are you sure?"}

    read -p "$prompt (yes/no): " response
    if [ "$response" = "yes" ]; then
        return 0
    fi
    return 1
}

# Export all functions
export -f log_timestamp log_info log_warn log_error log_debug
export -f command_exists require_command
export -f check_kubernetes wait_for_deployment check_pod_health get_service_endpoint
export -f send_slack_notification create_backup_tag verify_checksum
export -f retry_with_backoff check_http_endpoint yaml_get confirm_action
