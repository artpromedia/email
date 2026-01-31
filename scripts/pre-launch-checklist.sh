#!/usr/bin/env bash
# Pre-Launch Checklist Validation Script
# Validates all requirements are in place before production launch

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }
log_check() { echo -e "${PURPLE}[CHECK]${NC} $1"; }
log_pass() { echo -e "  ${GREEN}✓${NC} $1"; }
log_fail() { echo -e "  ${RED}✗${NC} $1"; }
log_skip() { echo -e "  ${YELLOW}○${NC} $1 (skipped)"; }

# Counters
PASSED=0
FAILED=0
SKIPPED=0
WARNINGS=0

check_pass() {
    log_pass "$1"
    ((PASSED++))
}

check_fail() {
    log_fail "$1"
    ((FAILED++))
}

check_skip() {
    log_skip "$1"
    ((SKIPPED++))
}

check_warn() {
    log_warn "$1"
    ((WARNINGS++))
}

show_help() {
    echo "Pre-Launch Checklist Validation"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --all           Run all checks (default)"
    echo "  --security      Security checks only"
    echo "  --performance   Performance checks only"
    echo "  --infrastructure Infrastructure checks only"
    echo "  --quick         Quick validation only"
    echo "  --help          Show this help"
}

# Security Checks
check_security() {
    log_header "Security Checks"

    # Check for security testing framework
    log_check "Security testing framework"
    if [ -f "tests/security/docker-compose.security.yml" ]; then
        check_pass "Security testing infrastructure configured"
    else
        check_fail "Missing security testing infrastructure"
    fi

    if [ -f "tests/security/run-security-tests.sh" ]; then
        check_pass "Security test runner script present"
    else
        check_fail "Missing security test runner"
    fi

    # Check for ZAP configuration
    log_check "OWASP ZAP configuration"
    if [ -f "tests/security/zap-api-scan.yaml" ]; then
        check_pass "ZAP API scan configuration present"
    else
        check_fail "Missing ZAP configuration"
    fi

    # Check for dependency scanning
    log_check "Dependency vulnerability scanning"
    if [ -f "tests/security/dependency-check-suppression.xml" ]; then
        check_pass "Dependency check suppression file present"
    else
        check_warn "Missing dependency check suppression file"
    fi

    # Check for security headers in ingress
    log_check "Security headers configuration"
    if [ -f "infrastructure/kubernetes/ingress.yaml" ]; then
        if grep -q "X-Frame-Options" infrastructure/kubernetes/ingress.yaml; then
            check_pass "Security headers configured in ingress"
        else
            check_warn "Security headers may not be configured"
        fi
    else
        check_skip "Kubernetes ingress not configured"
    fi

    # Check for rate limiting
    log_check "Rate limiting configuration"
    if grep -rq "rate-limit\|rateLimit" infrastructure/ 2>/dev/null; then
        check_pass "Rate limiting configured"
    else
        check_warn "Rate limiting may not be configured"
    fi

    # Check for CORS configuration
    log_check "CORS configuration"
    if grep -rq "cors\|CORS\|Access-Control" src/ 2>/dev/null; then
        check_pass "CORS configuration found"
    else
        check_warn "CORS configuration not found"
    fi
}

# Database Checks
check_database() {
    log_header "Database & High Availability Checks"

    # Check for HA configuration
    log_check "PostgreSQL HA configuration"
    if [ -f "infrastructure/postgresql/docker-compose.ha.yml" ]; then
        check_pass "PostgreSQL HA cluster configured"
    else
        check_fail "Missing PostgreSQL HA configuration"
    fi

    if [ -f "infrastructure/postgresql/patroni.yml" ]; then
        check_pass "Patroni configuration present"
    else
        check_fail "Missing Patroni configuration"
    fi

    if [ -f "infrastructure/postgresql/haproxy.cfg" ]; then
        check_pass "HAProxy load balancer configured"
    else
        check_fail "Missing HAProxy configuration"
    fi

    # Check for replication health monitoring
    log_check "Replication health monitoring"
    if [ -f "scripts/ha/check-replication-health.sh" ]; then
        check_pass "Replication health check script present"
    else
        check_fail "Missing replication health check script"
    fi

    # Check for backup configuration
    log_check "Backup configuration"
    if [ -f "scripts/backups/backup-postgres.sh" ]; then
        check_pass "Backup script present"
    else
        check_fail "Missing backup script"
    fi

    if [ -f "scripts/backups/restore-postgres.sh" ]; then
        check_pass "Restore script present"
    else
        check_fail "Missing restore script"
    fi
}

# Performance Checks
check_performance() {
    log_header "Performance Testing Checks"

    # Check for k6 load tests
    log_check "k6 load testing framework"
    if [ -f "tests/load/api-load-test.js" ]; then
        check_pass "API load test present"
    else
        check_fail "Missing API load test"
    fi

    if [ -f "tests/load/smtp-load-test.js" ]; then
        check_pass "SMTP load test present"
    else
        check_fail "Missing SMTP load test"
    fi

    if [ -f "tests/load/imap-load-test.js" ]; then
        check_pass "IMAP load test present"
    else
        check_fail "Missing IMAP load test"
    fi

    # Check for test runner
    log_check "Load test runner"
    if [ -f "tests/load/run-load-tests.sh" ]; then
        check_pass "Load test runner script present"
    else
        check_fail "Missing load test runner"
    fi

    # Check for baseline establishment
    log_check "Performance baseline configuration"
    if [ -f "tests/load/establish-baseline.sh" ]; then
        check_pass "Baseline establishment script present"
    else
        check_fail "Missing baseline establishment script"
    fi

    # Check for baselines directory
    if [ -d "tests/load/baselines" ]; then
        if ls tests/load/baselines/*.json 1> /dev/null 2>&1; then
            check_pass "Performance baselines established"
        else
            check_warn "Baselines directory exists but no baselines saved"
        fi
    else
        check_warn "No performance baselines established yet"
    fi
}

# Infrastructure Checks
check_infrastructure() {
    log_header "Infrastructure Checks"

    # Check Kubernetes configs
    log_check "Kubernetes configuration"
    if [ -f "infrastructure/kubernetes/ingress.yaml" ]; then
        check_pass "Ingress configuration present"
    else
        check_warn "Ingress configuration not found"
    fi

    if [ -f "infrastructure/kubernetes/cert-manager-setup.yaml" ]; then
        check_pass "Cert-manager configuration present"
    else
        check_warn "Cert-manager configuration not found"
    fi

    # Check monitoring
    log_check "Monitoring configuration"
    if [ -f "infrastructure/monitoring/prometheus.yml" ]; then
        check_pass "Prometheus configuration present"
    else
        check_warn "Prometheus configuration not found"
    fi

    if [ -f "infrastructure/monitoring/alert-rules.yml" ]; then
        check_pass "Alert rules configured"
    else
        check_warn "Alert rules not configured"
    fi

    # Check Terraform
    log_check "Infrastructure as Code"
    if [ -d "infrastructure/terraform" ]; then
        check_pass "Terraform infrastructure present"
    else
        check_skip "Terraform not configured"
    fi
}

# Chaos Engineering Checks
check_chaos() {
    log_header "Resilience & Chaos Engineering Checks"

    log_check "Chaos engineering framework"
    if [ -f "tests/chaos/chaos-experiments.yaml" ]; then
        check_pass "Chaos experiments configured"
    else
        check_warn "Chaos experiments not configured"
    fi

    if [ -f "tests/chaos/run-chaos-tests.sh" ]; then
        check_pass "Chaos test runner present"
    else
        check_warn "Chaos test runner not found"
    fi
}

# Quick validation
quick_check() {
    log_header "Quick Pre-Launch Validation"

    # Essential files
    log_check "Essential configuration files"

    local essential_files=(
        "docker-compose.yml"
        "package.json"
    )

    for file in "${essential_files[@]}"; do
        if [ -f "$file" ]; then
            check_pass "$file exists"
        else
            check_fail "$file missing"
        fi
    done

    # Check for environment template
    log_check "Environment configuration"
    if [ -f ".env.example" ] || [ -f ".env.template" ]; then
        check_pass "Environment template present"
    else
        check_warn "Environment template not found"
    fi

    # Check for secrets in git
    log_check "Secrets exposure"
    if [ -f ".env" ]; then
        if git ls-files --error-unmatch .env 2>/dev/null; then
            check_fail ".env file tracked in git!"
        else
            check_pass ".env file not tracked in git"
        fi
    else
        check_skip "No .env file present"
    fi
}

# Print summary
print_summary() {
    log_header "Pre-Launch Checklist Summary"

    echo "Results:"
    echo "  ${GREEN}✓ Passed:${NC}   $PASSED"
    echo "  ${RED}✗ Failed:${NC}   $FAILED"
    echo "  ${YELLOW}○ Skipped:${NC}  $SKIPPED"
    echo "  ${YELLOW}! Warnings:${NC} $WARNINGS"
    echo ""

    if [ $FAILED -eq 0 ]; then
        log_info "${GREEN}All critical checks passed!${NC}"
        if [ $WARNINGS -gt 0 ]; then
            log_warn "Review warnings before launch"
        fi
        return 0
    else
        log_error "Some critical checks failed. Address issues before launch."
        return 1
    fi
}

# Main
COMMAND="${1:-all}"

case "$COMMAND" in
    --all|all)
        check_security
        check_database
        check_performance
        check_infrastructure
        check_chaos
        ;;
    --security|security)
        check_security
        ;;
    --performance|performance)
        check_performance
        ;;
    --infrastructure|infrastructure)
        check_infrastructure
        ;;
    --quick|quick)
        quick_check
        ;;
    --help|-h|help)
        show_help
        exit 0
        ;;
    *)
        log_error "Unknown option: $COMMAND"
        show_help
        exit 1
        ;;
esac

print_summary
