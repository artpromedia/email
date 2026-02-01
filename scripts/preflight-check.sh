#!/bin/bash
# Pre-flight Check Script
# Validates environment before deployment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

# Required commands
REQUIRED_COMMANDS=(
    "kubectl"
    "docker"
    "psql"
    "redis-cli"
    "curl"
    "jq"
    "openssl"
)

# Required environment variables
REQUIRED_ENV_VARS=(
    "DATABASE_URL"
    "REDIS_URL"
    "JWT_SECRET"
)

usage() {
    cat << EOF
Pre-flight Check Script

Validates the environment is ready for deployment.

Usage: $0 [options]

Options:
    --phase <phase>     Validate for specific phase (alpha|beta|limited|ga)
    --skip-network      Skip network connectivity checks
    --skip-permissions  Skip permission checks
    -v, --verbose       Verbose output
    -h, --help          Show this help

EOF
    exit 0
}

check_required_commands() {
    log_info "Checking required commands..."
    local errors=0

    for cmd in "${REQUIRED_COMMANDS[@]}"; do
        if command_exists "$cmd"; then
            echo "  ✓ $cmd: $(command -v "$cmd")"
        else
            echo "  ✗ $cmd: not found"
            ((errors++)) || true
        fi
    done

    return $errors
}

check_environment_variables() {
    log_info "Checking environment variables..."
    local errors=0

    for var in "${REQUIRED_ENV_VARS[@]}"; do
        if [ -n "${!var:-}" ]; then
            echo "  ✓ $var: set"
        else
            echo "  ✗ $var: not set"
            ((errors++)) || true
        fi
    done

    # Check sensitive vars are not defaults
    if [ "${JWT_SECRET:-}" = "CHANGE_ME" ] || [ "${JWT_SECRET:-}" = "your-secret-key" ]; then
        echo "  ✗ JWT_SECRET: using default value (SECURITY RISK)"
        ((errors++)) || true
    fi

    return $errors
}

check_docker() {
    log_info "Checking Docker..."
    local errors=0

    if docker info > /dev/null 2>&1; then
        echo "  ✓ Docker daemon: running"
    else
        echo "  ✗ Docker daemon: not running or not accessible"
        ((errors++)) || true
        return $errors
    fi

    # Check docker compose
    if docker compose version > /dev/null 2>&1; then
        echo "  ✓ Docker Compose: $(docker compose version --short)"
    elif docker-compose version > /dev/null 2>&1; then
        echo "  ✓ Docker Compose (legacy): $(docker-compose version --short)"
    else
        echo "  ⚠ Docker Compose: not found"
    fi

    # Check disk space for docker
    local docker_root
    docker_root=$(docker info 2>/dev/null | grep "Docker Root Dir" | cut -d: -f2 | tr -d ' ')
    if [ -n "$docker_root" ] && [ -d "$docker_root" ]; then
        local usage
        usage=$(df "$docker_root" 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%' || echo "0")
        if [ "$usage" -lt 80 ] 2>/dev/null; then
            echo "  ✓ Docker disk: ${usage}% used"
        else
            echo "  ⚠ Docker disk: ${usage}% used (low space)"
        fi
    fi

    return $errors
}

check_kubernetes() {
    log_info "Checking Kubernetes..."
    local errors=0

    if ! command_exists kubectl; then
        echo "  ○ kubectl: not installed (skipping Kubernetes checks)"
        return 0
    fi

    if kubectl cluster-info > /dev/null 2>&1; then
        echo "  ✓ Kubernetes cluster: connected"

        # Check context
        local context
        context=$(kubectl config current-context 2>/dev/null || echo "unknown")
        echo "  ○ Current context: $context"

        # Check namespace
        local namespace="${NAMESPACE:-email-production}"
        if kubectl get namespace "$namespace" > /dev/null 2>&1; then
            echo "  ✓ Namespace $namespace: exists"
        else
            echo "  ⚠ Namespace $namespace: not found (will be created)"
        fi

        # Check permissions
        if kubectl auth can-i create deployments -n "$namespace" > /dev/null 2>&1; then
            echo "  ✓ Permissions: can create deployments"
        else
            echo "  ✗ Permissions: cannot create deployments"
            ((errors++)) || true
        fi
    else
        echo "  ⚠ Kubernetes cluster: not connected (deployment will use Docker)"
    fi

    return $errors
}

check_database_connectivity() {
    log_info "Checking database connectivity..."
    local errors=0

    # PostgreSQL
    if [ -n "${DATABASE_URL:-}" ]; then
        if pg_isready -d "$DATABASE_URL" > /dev/null 2>&1; then
            echo "  ✓ PostgreSQL: connected"

            # Check version
            local pg_version
            pg_version=$(psql "$DATABASE_URL" -t -c "SELECT version();" 2>/dev/null | head -1 | awk '{print $2}')
            echo "  ○ PostgreSQL version: $pg_version"
        else
            echo "  ✗ PostgreSQL: cannot connect"
            ((errors++)) || true
        fi
    else
        if pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
            echo "  ✓ PostgreSQL (localhost): connected"
        else
            echo "  ⚠ PostgreSQL: not reachable (will be started with Docker)"
        fi
    fi

    # Redis
    if [ -n "${REDIS_URL:-}" ]; then
        local redis_host
        redis_host=$(echo "$REDIS_URL" | sed -E 's|redis://([^:]+).*|\1|')
        if redis-cli -h "$redis_host" ping 2>/dev/null | grep -q "PONG"; then
            echo "  ✓ Redis: connected"
        else
            echo "  ✗ Redis: cannot connect"
            ((errors++)) || true
        fi
    else
        if redis-cli ping 2>/dev/null | grep -q "PONG"; then
            echo "  ✓ Redis (localhost): connected"
        else
            echo "  ⚠ Redis: not reachable (will be started with Docker)"
        fi
    fi

    return $errors
}

check_network_ports() {
    log_info "Checking network ports..."
    local errors=0

    local ports=(
        "80:HTTP"
        "443:HTTPS"
        "587:SMTP"
        "993:IMAPS"
        "5432:PostgreSQL"
        "6379:Redis"
        "9090:Prometheus"
        "3030:Grafana"
    )

    for port_def in "${ports[@]}"; do
        IFS=':' read -r port name <<< "$port_def"

        if netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "; then
            echo "  ⚠ Port $port ($name): already in use"
        else
            echo "  ✓ Port $port ($name): available"
        fi
    done

    return $errors
}

check_dns() {
    log_info "Checking DNS configuration..."
    local errors=0

    local domain="${DOMAIN:-mail.example.com}"

    # Check domain resolution
    if host "$domain" > /dev/null 2>&1; then
        local ip
        ip=$(host "$domain" | grep "has address" | head -1 | awk '{print $4}')
        echo "  ✓ $domain: resolves to $ip"
    else
        echo "  ⚠ $domain: does not resolve (configure DNS before production)"
    fi

    # Check MX record
    local mx_domain
    mx_domain=$(echo "$domain" | cut -d. -f2-)
    if host -t MX "$mx_domain" > /dev/null 2>&1; then
        echo "  ✓ MX record for $mx_domain: configured"
    else
        echo "  ⚠ MX record for $mx_domain: not found"
    fi

    return $errors
}

check_certificates() {
    log_info "Checking TLS certificates..."
    local errors=0

    local cert_paths=(
        "${CERT_DIR:-./certs}/server.crt"
        "${CERT_DIR:-./certs}/server.key"
    )

    for cert_path in "${cert_paths[@]}"; do
        if [ -f "$cert_path" ]; then
            echo "  ✓ Certificate: $cert_path exists"

            # Check expiry
            if [[ "$cert_path" == *.crt ]]; then
                local expiry
                expiry=$(openssl x509 -enddate -noout -in "$cert_path" 2>/dev/null | cut -d= -f2)
                if [ -n "$expiry" ]; then
                    echo "  ○ Expires: $expiry"
                fi
            fi
        else
            echo "  ⚠ Certificate: $cert_path not found (self-signed will be generated)"
        fi
    done

    return $errors
}

check_phase_requirements() {
    local phase=$1
    log_info "Checking requirements for phase: $phase..."
    local errors=0

    case $phase in
        alpha)
            # Alpha requirements - minimal
            echo "  ○ Alpha phase requirements: basic infrastructure"
            ;;
        beta)
            # Beta requirements
            if [ ! -f ".phase1-signoff" ]; then
                echo "  ⚠ Phase 1 (Alpha) sign-off not found"
            else
                echo "  ✓ Phase 1 (Alpha) sign-off: found"
            fi
            ;;
        limited)
            # Limited production requirements
            if [ ! -f ".phase2-signoff" ]; then
                echo "  ⚠ Phase 2 (Beta) sign-off not found"
            else
                echo "  ✓ Phase 2 (Beta) sign-off: found"
            fi

            # Check penetration test
            if [ -f "docs/PENTEST_REPORT.md" ]; then
                echo "  ✓ Penetration test report: found"
            else
                echo "  ✗ Penetration test report: required for limited production"
                ((errors++)) || true
            fi
            ;;
        ga)
            # GA requirements
            if [ ! -f ".phase3-signoff" ]; then
                echo "  ⚠ Phase 3 (Limited) sign-off not found"
            else
                echo "  ✓ Phase 3 (Limited) sign-off: found"
            fi

            # Check SLA documentation
            if [ -f "docs/SLA.md" ]; then
                echo "  ✓ SLA documentation: found"
            else
                echo "  ⚠ SLA documentation: recommended for GA"
            fi
            ;;
        *)
            echo "  Unknown phase: $phase"
            ;;
    esac

    return $errors
}

# Main
main() {
    local phase=""
    local skip_network=false
    local skip_permissions=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --phase)
                phase="$2"
                shift 2
                ;;
            --skip-network)
                skip_network=true
                shift
                ;;
            --skip-permissions)
                skip_permissions=true
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
    echo "  Pre-flight Checks"
    echo "  $(date)"
    echo "=========================================="
    echo ""

    local total_errors=0

    check_required_commands || total_errors=$((total_errors + $?))
    echo ""

    check_environment_variables || total_errors=$((total_errors + $?))
    echo ""

    check_docker || total_errors=$((total_errors + $?))
    echo ""

    check_kubernetes || total_errors=$((total_errors + $?))
    echo ""

    check_database_connectivity || total_errors=$((total_errors + $?))
    echo ""

    if [ "$skip_network" = "false" ]; then
        check_network_ports || total_errors=$((total_errors + $?))
        echo ""

        check_dns || total_errors=$((total_errors + $?))
        echo ""
    fi

    check_certificates || total_errors=$((total_errors + $?))
    echo ""

    if [ -n "$phase" ]; then
        check_phase_requirements "$phase" || total_errors=$((total_errors + $?))
        echo ""
    fi

    echo "=========================================="
    if [ $total_errors -eq 0 ]; then
        echo "  Pre-flight Check: PASSED ✓"
        echo "  Ready for deployment"
        echo "=========================================="
        exit 0
    else
        echo "  Pre-flight Check: $total_errors issue(s) found"
        echo "  Address issues before deployment"
        echo "=========================================="
        exit 1
    fi
}

main "$@"
