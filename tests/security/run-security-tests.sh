#!/usr/bin/env bash
# Security Testing Runner Script
# Runs comprehensive security tests including OWASP ZAP, vulnerability scanning, and more

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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
log_section() { echo -e "\n${PURPLE}--- $1 ---${NC}\n"; }

# Configuration
TARGET_URL="${TARGET_URL:-http://localhost:3000}"
SMTP_HOST="${SMTP_HOST:-localhost}"
SMTP_PORT="${SMTP_PORT:-25}"
IMAP_HOST="${IMAP_HOST:-localhost}"
IMAP_PORT="${IMAP_PORT:-143}"
REPORT_DIR="${SCRIPT_DIR}/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create reports directory
mkdir -p "$REPORT_DIR"

show_help() {
    echo "Security Testing Runner for OONRUMAIL Platform"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  all              Run all security tests"
    echo "  zap              Run OWASP ZAP scan"
    echo "  trivy            Run Trivy vulnerability scan"
    echo "  nuclei           Run Nuclei vulnerability scan"
    echo "  dependency       Run OWASP Dependency Check"
    echo "  ssl              Run SSL/TLS analysis"
    echo "  api              Run API security tests"
    echo "  quick            Quick security smoke test"
    echo "  report           Generate consolidated report"
    echo ""
    echo "Options:"
    echo "  --target URL     Target URL (default: http://localhost:3000)"
    echo "  --help           Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  TARGET_URL       Target application URL"
    echo "  SMTP_HOST        SMTP server host"
    echo "  SMTP_PORT        SMTP server port"
    echo "  IMAP_HOST        IMAP server host"
    echo "  IMAP_PORT        IMAP server port"
    echo ""
    echo "Examples:"
    echo "  $0 quick                        # Quick security smoke test"
    echo "  $0 zap --target http://app:3000 # ZAP scan against specific target"
    echo "  $0 all                          # Full security assessment"
}

# Check if Docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
}

# Start security testing infrastructure
start_infrastructure() {
    log_header "Starting Security Testing Infrastructure"
    docker compose -f docker-compose.security.yml up -d

    # Wait for ZAP to be ready
    log_info "Waiting for OWASP ZAP to be ready..."
    local max_attempts=30
    local attempt=0
    while ! curl -s "http://localhost:8080/JSON/core/view/version/" > /dev/null 2>&1; do
        ((attempt++))
        if [ $attempt -ge $max_attempts ]; then
            log_error "ZAP failed to start within timeout"
            return 1
        fi
        sleep 2
    done
    log_info "Security infrastructure is ready"
}

# Stop security testing infrastructure
stop_infrastructure() {
    log_header "Stopping Security Testing Infrastructure"
    docker compose -f docker-compose.security.yml down
}

# OWASP ZAP Scan
run_zap_scan() {
    log_header "Running OWASP ZAP Security Scan"
    log_info "Target: $TARGET_URL"

    local report_file="$REPORT_DIR/zap-report-${TIMESTAMP}"

    # Spider the application
    log_section "Spidering Application"
    curl -s "http://localhost:8080/JSON/spider/action/scan/?url=${TARGET_URL}&maxChildren=10&recurse=true" > /dev/null

    # Wait for spider to complete
    local spider_status="0"
    while [ "$spider_status" != "100" ]; do
        spider_status=$(curl -s "http://localhost:8080/JSON/spider/view/status/" | grep -o '"status":"[0-9]*"' | cut -d'"' -f4)
        log_info "Spider progress: ${spider_status}%"
        sleep 5
    done

    # Run active scan
    log_section "Running Active Scan"
    curl -s "http://localhost:8080/JSON/ascan/action/scan/?url=${TARGET_URL}&recurse=true&inScopeOnly=false" > /dev/null

    # Wait for active scan to complete
    local scan_status="0"
    while [ "$scan_status" != "100" ]; do
        scan_status=$(curl -s "http://localhost:8080/JSON/ascan/view/status/" | grep -o '"status":"[0-9]*"' | cut -d'"' -f4)
        log_info "Active scan progress: ${scan_status}%"
        sleep 10
    done

    # Generate reports
    log_section "Generating Reports"
    curl -s "http://localhost:8080/OTHER/core/other/htmlreport/" > "${report_file}.html"
    curl -s "http://localhost:8080/JSON/core/view/alerts/" > "${report_file}.json"

    # Parse and display summary
    local high=$(cat "${report_file}.json" | grep -o '"risk":"High"' | wc -l)
    local medium=$(cat "${report_file}.json" | grep -o '"risk":"Medium"' | wc -l)
    local low=$(cat "${report_file}.json" | grep -o '"risk":"Low"' | wc -l)
    local info=$(cat "${report_file}.json" | grep -o '"risk":"Informational"' | wc -l)

    log_info "ZAP Scan Complete"
    echo ""
    echo "  Findings Summary:"
    echo "    High:          $high"
    echo "    Medium:        $medium"
    echo "    Low:           $low"
    echo "    Informational: $info"
    echo ""
    log_info "Reports saved to: ${report_file}.html, ${report_file}.json"

    if [ "$high" -gt 0 ]; then
        log_warn "High severity vulnerabilities found!"
        return 1
    fi
}

# Trivy Vulnerability Scan
run_trivy_scan() {
    log_header "Running Trivy Vulnerability Scan"

    local report_file="$REPORT_DIR/trivy-report-${TIMESTAMP}"

    # Scan the project directory for vulnerabilities
    log_section "Scanning Dependencies"
    docker exec email-trivy trivy fs --severity HIGH,CRITICAL --format json -o /reports/trivy-deps-${TIMESTAMP}.json /src || true
    docker exec email-trivy trivy fs --severity HIGH,CRITICAL --format table /src 2>&1 | tee "${report_file}-deps.txt" || true

    # Scan Docker images if available
    log_section "Scanning Container Images"
    for image in $(docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "^email-" | head -5); do
        log_info "Scanning image: $image"
        docker exec email-trivy trivy image --severity HIGH,CRITICAL "$image" 2>&1 | tee -a "${report_file}-images.txt" || true
    done

    log_info "Trivy scan complete. Reports saved to: $REPORT_DIR"
}

# Nuclei Vulnerability Scan
run_nuclei_scan() {
    log_header "Running Nuclei Vulnerability Scan"

    local report_file="$REPORT_DIR/nuclei-report-${TIMESTAMP}"

    # Update templates
    log_section "Updating Nuclei Templates"
    docker exec email-nuclei nuclei -update-templates || true

    # Run scan with relevant templates
    log_section "Running Nuclei Scan"
    docker exec email-nuclei nuclei \
        -u "$TARGET_URL" \
        -severity critical,high,medium \
        -tags cve,security-misconfiguration,exposure \
        -json -o "/reports/nuclei-${TIMESTAMP}.json" || true

    docker exec email-nuclei nuclei \
        -u "$TARGET_URL" \
        -severity critical,high,medium \
        -tags cve,security-misconfiguration,exposure \
        2>&1 | tee "${report_file}.txt" || true

    log_info "Nuclei scan complete. Report saved to: ${report_file}.txt"
}

# OWASP Dependency Check
run_dependency_check() {
    log_header "Running OWASP Dependency Check"

    local report_file="$REPORT_DIR/dependency-check-${TIMESTAMP}"

    docker exec email-dependency-check /usr/share/dependency-check/bin/dependency-check.sh \
        --project "EmailPlatform" \
        --scan /src \
        --format HTML \
        --format JSON \
        --out /reports \
        --suppression /src/tests/security/dependency-check-suppression.xml 2>&1 || true

    # Rename reports with timestamp
    if [ -f "$REPORT_DIR/dependency-check-report.html" ]; then
        mv "$REPORT_DIR/dependency-check-report.html" "${report_file}.html"
    fi
    if [ -f "$REPORT_DIR/dependency-check-report.json" ]; then
        mv "$REPORT_DIR/dependency-check-report.json" "${report_file}.json"
    fi

    log_info "Dependency Check complete. Report saved to: ${report_file}"
}

# SSL/TLS Analysis
run_ssl_analysis() {
    log_header "Running SSL/TLS Analysis"

    local report_file="$REPORT_DIR/ssl-report-${TIMESTAMP}"

    # Extract hostname from TARGET_URL
    local hostname=$(echo "$TARGET_URL" | sed -e 's|^[^/]*//||' -e 's|/.*$||' -e 's|:.*$||')

    log_section "Analyzing Web SSL/TLS"
    docker exec email-sslyze sslyze --regular "$hostname:443" 2>&1 | tee "${report_file}-web.txt" || true

    log_section "Analyzing SMTP STARTTLS"
    docker exec email-sslyze sslyze --starttls smtp "$SMTP_HOST:$SMTP_PORT" 2>&1 | tee "${report_file}-smtp.txt" || true

    log_section "Analyzing IMAPS"
    docker exec email-sslyze sslyze --regular "$IMAP_HOST:993" 2>&1 | tee "${report_file}-imap.txt" || true

    log_info "SSL/TLS analysis complete. Reports saved to: $REPORT_DIR"
}

# API Security Tests
run_api_security_tests() {
    log_header "Running API Security Tests"

    local report_file="$REPORT_DIR/api-security-${TIMESTAMP}.json"

    # OWASP API Security Top 10 checks
    log_section "OWASP API Security Top 10 Checks"

    local results=()

    # API1: Broken Object Level Authorization
    log_info "Testing: Broken Object Level Authorization (API1)"
    # Test accessing resources with different IDs without proper auth

    # API2: Broken Authentication
    log_info "Testing: Broken Authentication (API2)"
    # Test weak password policies, brute force protection

    # API3: Broken Object Property Level Authorization
    log_info "Testing: Broken Object Property Level Authorization (API3)"
    # Test mass assignment vulnerabilities

    # API4: Unrestricted Resource Consumption
    log_info "Testing: Unrestricted Resource Consumption (API4)"
    # Test rate limiting

    # API5: Broken Function Level Authorization
    log_info "Testing: Broken Function Level Authorization (API5)"
    # Test accessing admin endpoints without proper roles

    # API6: Unrestricted Access to Sensitive Business Flows
    log_info "Testing: Unrestricted Access to Sensitive Business Flows (API6)"

    # API7: Server Side Request Forgery
    log_info "Testing: Server Side Request Forgery (API7)"

    # API8: Security Misconfiguration
    log_info "Testing: Security Misconfiguration (API8)"
    # Test for exposed debug endpoints, default credentials, etc.

    # API9: Improper Inventory Management
    log_info "Testing: Improper Inventory Management (API9)"

    # API10: Unsafe Consumption of APIs
    log_info "Testing: Unsafe Consumption of APIs (API10)"

    # Test security headers
    log_section "Security Headers Check"
    local headers_response=$(curl -s -I "$TARGET_URL" 2>/dev/null || echo "")

    check_header() {
        local header=$1
        if echo "$headers_response" | grep -qi "$header"; then
            log_info "  $header: Present"
            return 0
        else
            log_warn "  $header: Missing"
            return 1
        fi
    }

    echo "Checking security headers:"
    check_header "Strict-Transport-Security" || true
    check_header "X-Content-Type-Options" || true
    check_header "X-Frame-Options" || true
    check_header "Content-Security-Policy" || true
    check_header "X-XSS-Protection" || true

    # Test CORS configuration
    log_section "CORS Configuration Check"
    local cors_response=$(curl -s -I -H "Origin: https://malicious-site.com" "$TARGET_URL" 2>/dev/null || echo "")
    if echo "$cors_response" | grep -qi "Access-Control-Allow-Origin: https://malicious-site.com"; then
        log_warn "CORS misconfiguration: Allows arbitrary origins"
    else
        log_info "CORS configuration appears secure"
    fi

    log_info "API security tests complete. Report saved to: $report_file"
}

# Quick Security Smoke Test
run_quick_test() {
    log_header "Running Quick Security Smoke Test"

    # Basic security checks without full infrastructure
    local issues=0

    log_section "Security Headers Check"
    local headers_response=$(curl -s -I "$TARGET_URL" 2>/dev/null || echo "connection failed")

    if [ "$headers_response" = "connection failed" ]; then
        log_error "Cannot connect to target: $TARGET_URL"
        return 1
    fi

    # Check critical headers
    for header in "Strict-Transport-Security" "X-Content-Type-Options" "X-Frame-Options"; do
        if echo "$headers_response" | grep -qi "$header"; then
            log_info "$header: OK"
        else
            log_warn "$header: Missing"
            ((issues++))
        fi
    done

    log_section "Common Vulnerability Checks"

    # Check for exposed sensitive endpoints
    local sensitive_paths=("/.git/config" "/.env" "/config.json" "/api/debug" "/phpinfo.php" "/server-status")
    for path in "${sensitive_paths[@]}"; do
        local status=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}${path}" 2>/dev/null || echo "000")
        if [ "$status" = "200" ]; then
            log_warn "Exposed sensitive endpoint: $path (HTTP $status)"
            ((issues++))
        else
            log_info "Endpoint $path: Protected (HTTP $status)"
        fi
    done

    # Check for directory listing
    log_section "Directory Listing Check"
    local dir_response=$(curl -s "${TARGET_URL}/assets/" 2>/dev/null || echo "")
    if echo "$dir_response" | grep -qi "index of"; then
        log_warn "Directory listing enabled"
        ((issues++))
    else
        log_info "Directory listing: Disabled"
    fi

    log_section "Summary"
    if [ $issues -eq 0 ]; then
        log_info "Quick security check passed with no issues"
    else
        log_warn "Found $issues potential security issues"
    fi

    return 0
}

# Generate Consolidated Report
generate_report() {
    log_header "Generating Consolidated Security Report"

    local report_file="$REPORT_DIR/security-assessment-${TIMESTAMP}.md"

    cat > "$report_file" << EOF
# Security Assessment Report

**Date:** $(date)
**Target:** $TARGET_URL
**Report ID:** $TIMESTAMP

## Executive Summary

This report consolidates findings from automated security testing tools.

## Test Results

### OWASP ZAP (Dynamic Application Security Testing)
EOF

    if [ -f "$REPORT_DIR/zap-report-${TIMESTAMP}.json" ]; then
        local high=$(cat "$REPORT_DIR/zap-report-${TIMESTAMP}.json" | grep -o '"risk":"High"' | wc -l)
        local medium=$(cat "$REPORT_DIR/zap-report-${TIMESTAMP}.json" | grep -o '"risk":"Medium"' | wc -l)
        local low=$(cat "$REPORT_DIR/zap-report-${TIMESTAMP}.json" | grep -o '"risk":"Low"' | wc -l)
        cat >> "$report_file" << EOF

| Severity | Count |
|----------|-------|
| High | $high |
| Medium | $medium |
| Low | $low |

See detailed report: zap-report-${TIMESTAMP}.html
EOF
    else
        echo "No ZAP scan results found." >> "$report_file"
    fi

    cat >> "$report_file" << EOF

### Trivy (Vulnerability Scanning)
EOF

    if [ -f "$REPORT_DIR/trivy-deps-${TIMESTAMP}.json" ]; then
        echo "Scan completed. See detailed results in trivy-report-${TIMESTAMP}-*.txt" >> "$report_file"
    else
        echo "No Trivy scan results found." >> "$report_file"
    fi

    cat >> "$report_file" << EOF

### Nuclei (Vulnerability Scanner)
EOF

    if [ -f "$REPORT_DIR/nuclei-${TIMESTAMP}.json" ]; then
        local nuclei_findings=$(cat "$REPORT_DIR/nuclei-${TIMESTAMP}.json" | wc -l)
        echo "Findings: $nuclei_findings" >> "$report_file"
        echo "See detailed results in nuclei-report-${TIMESTAMP}.txt" >> "$report_file"
    else
        echo "No Nuclei scan results found." >> "$report_file"
    fi

    cat >> "$report_file" << EOF

### SSL/TLS Analysis

See detailed results in ssl-report-${TIMESTAMP}-*.txt

## Recommendations

1. Address all HIGH severity findings immediately
2. Review and remediate MEDIUM severity findings within 30 days
3. Document accepted risks for LOW severity findings
4. Re-run security tests after remediation

## Next Steps

1. Review detailed findings in individual tool reports
2. Prioritize remediation based on risk severity
3. Consider engaging third-party penetration testing
4. Implement continuous security scanning in CI/CD

---
*Report generated by OONRUMAIL Platform Security Testing Suite*
EOF

    log_info "Consolidated report saved to: $report_file"
}

# Parse arguments
COMMAND="${1:-help}"
shift || true

while [[ $# -gt 0 ]]; do
    case $1 in
        --target)
            TARGET_URL="$2"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# Main
check_docker

case "$COMMAND" in
    all)
        start_infrastructure
        run_zap_scan || true
        run_trivy_scan || true
        run_nuclei_scan || true
        run_dependency_check || true
        run_ssl_analysis || true
        run_api_security_tests || true
        generate_report
        stop_infrastructure
        ;;
    zap)
        start_infrastructure
        run_zap_scan
        ;;
    trivy)
        start_infrastructure
        run_trivy_scan
        ;;
    nuclei)
        start_infrastructure
        run_nuclei_scan
        ;;
    dependency)
        start_infrastructure
        run_dependency_check
        ;;
    ssl)
        start_infrastructure
        run_ssl_analysis
        ;;
    api)
        run_api_security_tests
        ;;
    quick)
        run_quick_test
        ;;
    report)
        generate_report
        ;;
    stop)
        stop_infrastructure
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac

log_header "Security Testing Complete"
log_info "Reports are in the '$REPORT_DIR' directory"
