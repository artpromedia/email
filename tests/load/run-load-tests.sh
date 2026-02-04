#!/usr/bin/env bash
# Load Test Runner Script
# Runs k6 load tests against the email platform

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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

# Default configuration
SMTP_HOST="${SMTP_HOST:-localhost}"
SMTP_PORT="${SMTP_PORT:-25}"
IMAP_HOST="${IMAP_HOST:-localhost}"
IMAP_PORT="${IMAP_PORT:-143}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

# Test profiles
PROFILE="${1:-standard}"
TEST="${2:-all}"

# Create results directory
mkdir -p results

show_help() {
    echo "Load Test Runner for OONRUMAIL Platform"
    echo ""
    echo "Usage: $0 [profile] [test]"
    echo ""
    echo "Profiles:"
    echo "  smoke       Quick smoke test (10 VUs, 1 minute)"
    echo "  standard    Standard load test (recommended for beta)"
    echo "  stress      Stress test (high load)"
    echo "  soak        Soak test (extended duration)"
    echo ""
    echo "Tests:"
    echo "  all         Run all tests"
    echo "  smtp        SMTP server load test"
    echo "  imap        IMAP server load test"
    echo "  api         Web API load test"
    echo ""
    echo "Environment Variables:"
    echo "  SMTP_HOST   SMTP server host (default: localhost)"
    echo "  SMTP_PORT   SMTP server port (default: 25)"
    echo "  IMAP_HOST   IMAP server host (default: localhost)"
    echo "  IMAP_PORT   IMAP server port (default: 143)"
    echo "  BASE_URL    Web API base URL (default: http://localhost:3000)"
    echo ""
    echo "Examples:"
    echo "  $0 smoke all           # Quick smoke test"
    echo "  $0 standard smtp       # Standard SMTP load test"
    echo "  $0 stress imap         # Stress test IMAP server"
}

# Check for k6
check_k6() {
    if ! command -v k6 &> /dev/null; then
        log_error "k6 is not installed"
        echo ""
        echo "Install k6:"
        echo "  macOS:   brew install k6"
        echo "  Ubuntu:  sudo snap install k6"
        echo "  Docker:  docker pull grafana/k6"
        echo ""
        echo "Or download from: https://k6.io/docs/getting-started/installation/"
        exit 1
    fi
}

# Get VUs and duration based on profile
get_profile_config() {
    case "$PROFILE" in
        smoke)
            echo "10 1m"
            ;;
        standard)
            echo "500 10m"
            ;;
        stress)
            echo "2000 15m"
            ;;
        soak)
            echo "200 60m"
            ;;
        *)
            echo "100 5m"
            ;;
    esac
}

# Run SMTP load test
run_smtp_test() {
    log_header "Running SMTP Load Test"

    read -r VUS DURATION <<< "$(get_profile_config)"

    # Adjust for SMTP specifics
    case "$PROFILE" in
        smoke)     SMTP_VUS=10 ;;
        standard)  SMTP_VUS=1000 ;;
        stress)    SMTP_VUS=2000 ;;
        soak)      SMTP_VUS=500 ;;
        *)         SMTP_VUS=100 ;;
    esac

    log_info "Profile: $PROFILE"
    log_info "VUs: $SMTP_VUS, Duration: $DURATION"
    log_info "Target: $SMTP_HOST:$SMTP_PORT"

    k6 run \
        --vus "$SMTP_VUS" \
        --duration "$DURATION" \
        -e SMTP_HOST="$SMTP_HOST" \
        -e SMTP_PORT="$SMTP_PORT" \
        --out json=results/smtp-metrics.json \
        smtp-load-test.js

    log_info "Results saved to results/smtp-load-test-summary.json"
}

# Run IMAP load test
run_imap_test() {
    log_header "Running IMAP Load Test"

    read -r VUS DURATION <<< "$(get_profile_config)"

    # Adjust for IMAP specifics (target 10k concurrent)
    case "$PROFILE" in
        smoke)     IMAP_VUS=10 ;;
        standard)  IMAP_VUS=5000 ;;
        stress)    IMAP_VUS=10000 ;;
        soak)      IMAP_VUS=2000 ;;
        *)         IMAP_VUS=1000 ;;
    esac

    log_info "Profile: $PROFILE"
    log_info "VUs: $IMAP_VUS, Duration: $DURATION"
    log_info "Target: $IMAP_HOST:$IMAP_PORT"

    k6 run \
        --vus "$IMAP_VUS" \
        --duration "$DURATION" \
        -e IMAP_HOST="$IMAP_HOST" \
        -e IMAP_PORT="$IMAP_PORT" \
        --out json=results/imap-metrics.json \
        imap-load-test.js

    log_info "Results saved to results/imap-load-test-summary.json"
}

# Run API load test
run_api_test() {
    log_header "Running API Load Test"

    read -r VUS DURATION <<< "$(get_profile_config)"

    log_info "Profile: $PROFILE"
    log_info "VUs: $VUS, Duration: $DURATION"
    log_info "Target: $BASE_URL"

    k6 run \
        --vus "$VUS" \
        --duration "$DURATION" \
        -e BASE_URL="$BASE_URL" \
        --out json=results/api-metrics.json \
        api-load-test.js

    log_info "Results saved to results/api-load-test-summary.json"
}

# Generate combined report
generate_report() {
    log_header "Generating Combined Report"

    cat > results/load-test-report.md << EOF
# Load Test Report

**Date:** $(date)
**Profile:** $PROFILE
**Tests Run:** $TEST

## Configuration

- SMTP: $SMTP_HOST:$SMTP_PORT
- IMAP: $IMAP_HOST:$IMAP_PORT
- API: $BASE_URL

## Results Summary

EOF

    # Append individual results if they exist
    for result in results/*-summary.json; do
        if [ -f "$result" ]; then
            echo "### $(basename "$result" .json)" >> results/load-test-report.md
            echo '```json' >> results/load-test-report.md
            cat "$result" >> results/load-test-report.md
            echo '```' >> results/load-test-report.md
            echo "" >> results/load-test-report.md
        fi
    done

    log_info "Report saved to results/load-test-report.md"
}

# Main
case "$1" in
    -h|--help|help)
        show_help
        exit 0
        ;;
esac

check_k6

log_header "OONRUMAIL Platform Load Tests"
log_info "Profile: $PROFILE"
log_info "Test: $TEST"

case "$TEST" in
    smtp)
        run_smtp_test
        ;;
    imap)
        run_imap_test
        ;;
    api)
        run_api_test
        ;;
    all)
        run_smtp_test
        run_imap_test
        run_api_test
        generate_report
        ;;
    *)
        log_error "Unknown test: $TEST"
        show_help
        exit 1
        ;;
esac

log_header "Load Tests Completed"
log_info "Results are in the 'results' directory"
