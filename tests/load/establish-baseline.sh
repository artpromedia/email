#!/usr/bin/env bash
# Performance Baseline Establishment Script
# Runs k6 load tests to establish baseline performance metrics

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
SMTP_HOST="${SMTP_HOST:-localhost}"
SMTP_PORT="${SMTP_PORT:-25}"
IMAP_HOST="${IMAP_HOST:-localhost}"
IMAP_PORT="${IMAP_PORT:-143}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
BASELINE_DIR="${SCRIPT_DIR}/baselines"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ENVIRONMENT="${ENVIRONMENT:-development}"

# Baseline thresholds (these will be established)
declare -A BASELINE_METRICS

# Create directories
mkdir -p "$BASELINE_DIR"
mkdir -p results

show_help() {
    echo "Performance Baseline Establishment Script"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  establish       Run tests to establish new baseline"
    echo "  compare         Compare current performance against baseline"
    echo "  view            View current baseline values"
    echo "  export          Export baseline to JSON"
    echo ""
    echo "Options:"
    echo "  --environment   Environment name (default: development)"
    echo "  --iterations    Number of test iterations for baseline (default: 3)"
    echo "  --help          Show this help"
    echo ""
    echo "Environment Variables:"
    echo "  SMTP_HOST       SMTP server host (default: localhost)"
    echo "  SMTP_PORT       SMTP server port (default: 25)"
    echo "  IMAP_HOST       IMAP server host (default: localhost)"
    echo "  IMAP_PORT       IMAP server port (default: 143)"
    echo "  BASE_URL        Web API base URL (default: http://localhost:3000)"
    echo ""
    echo "Examples:"
    echo "  $0 establish                    # Establish new baseline"
    echo "  $0 compare                      # Compare against baseline"
    echo "  $0 establish --environment prod # Baseline for production"
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
        exit 1
    fi
}

# Check for jq
check_jq() {
    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed (required for JSON processing)"
        exit 1
    fi
}

# Run baseline test iteration
run_baseline_iteration() {
    local test_type=$1
    local iteration=$2
    local output_file="results/baseline-${test_type}-${iteration}.json"

    log_info "Running $test_type test - iteration $iteration"

    case "$test_type" in
        api)
            k6 run \
                --vus 50 \
                --duration 2m \
                -e BASE_URL="$BASE_URL" \
                --out json="$output_file" \
                --quiet \
                api-load-test.js 2>&1 | tail -20
            ;;
        smtp)
            k6 run \
                --vus 100 \
                --duration 2m \
                -e SMTP_HOST="$SMTP_HOST" \
                -e SMTP_PORT="$SMTP_PORT" \
                --out json="$output_file" \
                --quiet \
                smtp-load-test.js 2>&1 | tail -20
            ;;
        imap)
            k6 run \
                --vus 100 \
                --duration 2m \
                -e IMAP_HOST="$IMAP_HOST" \
                -e IMAP_PORT="$IMAP_PORT" \
                --out json="$output_file" \
                --quiet \
                imap-load-test.js 2>&1 | tail -20
            ;;
    esac
}

# Extract metrics from k6 JSON output
extract_metrics() {
    local json_file=$1

    if [ ! -f "$json_file" ]; then
        echo "{}"
        return
    fi

    # Parse k6 JSON output for key metrics
    cat "$json_file" | grep -E '"type":"Point"' | jq -s '
        {
            http_req_duration_p50: ([.[] | select(.metric == "http_req_duration") | .data.value] | sort | .[length/2] // 0),
            http_req_duration_p95: ([.[] | select(.metric == "http_req_duration") | .data.value] | sort | .[length * 0.95 | floor] // 0),
            http_req_duration_p99: ([.[] | select(.metric == "http_req_duration") | .data.value] | sort | .[length * 0.99 | floor] // 0),
            http_reqs_rate: ([.[] | select(.metric == "http_reqs") | .data.value] | length / 120),
            http_req_failed_rate: ([.[] | select(.metric == "http_req_failed") | .data.value] | add / length // 0),
            iterations: ([.[] | select(.metric == "iterations") | .data.value] | length)
        }
    ' 2>/dev/null || echo "{}"
}

# Calculate average metrics across iterations
calculate_average() {
    local test_type=$1
    local iterations=$2

    local sum_p50=0
    local sum_p95=0
    local sum_p99=0
    local sum_rate=0
    local count=0

    for i in $(seq 1 "$iterations"); do
        local metrics_file="results/baseline-${test_type}-${i}.json"
        if [ -f "$metrics_file" ]; then
            local metrics=$(extract_metrics "$metrics_file")
            local p50=$(echo "$metrics" | jq '.http_req_duration_p50 // 0')
            local p95=$(echo "$metrics" | jq '.http_req_duration_p95 // 0')
            local p99=$(echo "$metrics" | jq '.http_req_duration_p99 // 0')
            local rate=$(echo "$metrics" | jq '.http_reqs_rate // 0')

            sum_p50=$(echo "$sum_p50 + $p50" | bc)
            sum_p95=$(echo "$sum_p95 + $p95" | bc)
            sum_p99=$(echo "$sum_p99 + $p99" | bc)
            sum_rate=$(echo "$sum_rate + $rate" | bc)
            ((count++))
        fi
    done

    if [ $count -gt 0 ]; then
        echo "{
            \"p50\": $(echo "scale=2; $sum_p50 / $count" | bc),
            \"p95\": $(echo "scale=2; $sum_p95 / $count" | bc),
            \"p99\": $(echo "scale=2; $sum_p99 / $count" | bc),
            \"requests_per_second\": $(echo "scale=2; $sum_rate / $count" | bc),
            \"iterations\": $count
        }"
    else
        echo "{}"
    fi
}

# Establish baseline
establish_baseline() {
    local iterations=${1:-3}

    log_header "Establishing Performance Baseline"
    log_info "Environment: $ENVIRONMENT"
    log_info "Iterations per test: $iterations"
    log_info "Target URLs:"
    log_info "  API:  $BASE_URL"
    log_info "  SMTP: $SMTP_HOST:$SMTP_PORT"
    log_info "  IMAP: $IMAP_HOST:$IMAP_PORT"

    # Clean up previous iteration results
    rm -f results/baseline-*.json

    # Run API baseline tests
    log_section "API Performance Baseline"
    for i in $(seq 1 "$iterations"); do
        run_baseline_iteration "api" "$i"
        sleep 10  # Cool-down between iterations
    done

    # Run SMTP baseline tests
    log_section "SMTP Performance Baseline"
    for i in $(seq 1 "$iterations"); do
        run_baseline_iteration "smtp" "$i"
        sleep 10
    done

    # Run IMAP baseline tests
    log_section "IMAP Performance Baseline"
    for i in $(seq 1 "$iterations"); do
        run_baseline_iteration "imap" "$i"
        sleep 10
    done

    # Calculate and save baselines
    log_section "Calculating Baseline Metrics"

    local api_baseline=$(calculate_average "api" "$iterations")
    local smtp_baseline=$(calculate_average "smtp" "$iterations")
    local imap_baseline=$(calculate_average "imap" "$iterations")

    local baseline_file="$BASELINE_DIR/baseline-${ENVIRONMENT}-${TIMESTAMP}.json"

    cat > "$baseline_file" << EOF
{
    "metadata": {
        "environment": "$ENVIRONMENT",
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "iterations": $iterations,
        "targets": {
            "api": "$BASE_URL",
            "smtp": "$SMTP_HOST:$SMTP_PORT",
            "imap": "$IMAP_HOST:$IMAP_PORT"
        }
    },
    "baselines": {
        "api": $api_baseline,
        "smtp": $smtp_baseline,
        "imap": $imap_baseline
    },
    "thresholds": {
        "api": {
            "p95_max_ms": $(echo "$api_baseline" | jq '.p95 * 1.2' 2>/dev/null || echo "500"),
            "p99_max_ms": $(echo "$api_baseline" | jq '.p99 * 1.3' 2>/dev/null || echo "1000"),
            "error_rate_max": 0.01,
            "rps_min": $(echo "$api_baseline" | jq '.requests_per_second * 0.8' 2>/dev/null || echo "100")
        },
        "smtp": {
            "p95_max_ms": $(echo "$smtp_baseline" | jq '.p95 * 1.2' 2>/dev/null || echo "1000"),
            "p99_max_ms": $(echo "$smtp_baseline" | jq '.p99 * 1.3' 2>/dev/null || echo "2000"),
            "error_rate_max": 0.01
        },
        "imap": {
            "p95_max_ms": $(echo "$imap_baseline" | jq '.p95 * 1.2' 2>/dev/null || echo "500"),
            "p99_max_ms": $(echo "$imap_baseline" | jq '.p99 * 1.3' 2>/dev/null || echo "1000"),
            "error_rate_max": 0.01
        }
    }
}
EOF

    # Create symlink to latest baseline
    ln -sf "$(basename "$baseline_file")" "$BASELINE_DIR/baseline-${ENVIRONMENT}-latest.json"

    log_header "Baseline Established"
    log_info "Baseline saved to: $baseline_file"
    echo ""
    echo "API Baseline:"
    echo "$api_baseline" | jq '.'
    echo ""
    echo "SMTP Baseline:"
    echo "$smtp_baseline" | jq '.'
    echo ""
    echo "IMAP Baseline:"
    echo "$imap_baseline" | jq '.'

    # Generate k6 thresholds file
    generate_k6_thresholds "$baseline_file"
}

# Generate k6 thresholds configuration
generate_k6_thresholds() {
    local baseline_file=$1
    local thresholds_file="$SCRIPT_DIR/thresholds-${ENVIRONMENT}.js"

    local api_p95=$(cat "$baseline_file" | jq '.thresholds.api.p95_max_ms')
    local api_p99=$(cat "$baseline_file" | jq '.thresholds.api.p99_max_ms')
    local smtp_p95=$(cat "$baseline_file" | jq '.thresholds.smtp.p95_max_ms')
    local imap_p95=$(cat "$baseline_file" | jq '.thresholds.imap.p95_max_ms')

    cat > "$thresholds_file" << EOF
// Auto-generated k6 thresholds based on baseline: $(basename "$baseline_file")
// Environment: $ENVIRONMENT
// Generated: $(date)

export const apiThresholds = {
    http_req_duration: ['p(95)<${api_p95}', 'p(99)<${api_p99}'],
    http_req_failed: ['rate<0.01'],
};

export const smtpThresholds = {
    smtp_send_duration: ['p(95)<${smtp_p95}'],
    smtp_connection_failed: ['rate<0.01'],
};

export const imapThresholds = {
    imap_fetch_duration: ['p(95)<${imap_p95}'],
    imap_connection_failed: ['rate<0.01'],
};

export const thresholds = {
    api: apiThresholds,
    smtp: smtpThresholds,
    imap: imapThresholds,
};

export default thresholds;
EOF

    log_info "k6 thresholds generated: $thresholds_file"
}

# Compare current performance against baseline
compare_performance() {
    log_header "Comparing Performance Against Baseline"

    local baseline_file="$BASELINE_DIR/baseline-${ENVIRONMENT}-latest.json"

    if [ ! -f "$baseline_file" ]; then
        log_error "No baseline found for environment: $ENVIRONMENT"
        log_info "Run '$0 establish' first to create a baseline"
        exit 1
    fi

    log_info "Using baseline: $baseline_file"

    # Run a quick test
    log_section "Running Comparison Test"

    run_baseline_iteration "api" "compare"

    local current_metrics=$(extract_metrics "results/baseline-api-compare.json")
    local baseline_metrics=$(cat "$baseline_file" | jq '.baselines.api')

    local current_p95=$(echo "$current_metrics" | jq '.http_req_duration_p95')
    local baseline_p95=$(echo "$baseline_metrics" | jq '.p95')
    local threshold_p95=$(cat "$baseline_file" | jq '.thresholds.api.p95_max_ms')

    log_section "Comparison Results"

    echo "Metric              | Baseline   | Current    | Threshold  | Status"
    echo "--------------------|------------|------------|------------|--------"

    # P95 comparison
    local p95_status="PASS"
    if (( $(echo "$current_p95 > $threshold_p95" | bc -l) )); then
        p95_status="FAIL"
    fi
    printf "P95 Latency (ms)    | %-10.2f | %-10.2f | %-10.2f | %s\n" "$baseline_p95" "$current_p95" "$threshold_p95" "$p95_status"

    # Calculate degradation percentage
    local degradation=$(echo "scale=2; (($current_p95 - $baseline_p95) / $baseline_p95) * 100" | bc)
    echo ""
    if (( $(echo "$degradation > 0" | bc -l) )); then
        log_warn "Performance degraded by ${degradation}% compared to baseline"
    else
        log_info "Performance improved by ${degradation#-}% compared to baseline"
    fi
}

# View current baseline
view_baseline() {
    local baseline_file="$BASELINE_DIR/baseline-${ENVIRONMENT}-latest.json"

    if [ ! -f "$baseline_file" ]; then
        log_error "No baseline found for environment: $ENVIRONMENT"
        exit 1
    fi

    log_header "Current Baseline for $ENVIRONMENT"
    cat "$baseline_file" | jq '.'
}

# Export baseline
export_baseline() {
    local baseline_file="$BASELINE_DIR/baseline-${ENVIRONMENT}-latest.json"
    local export_file="${1:-baseline-export.json}"

    if [ ! -f "$baseline_file" ]; then
        log_error "No baseline found for environment: $ENVIRONMENT"
        exit 1
    fi

    cp "$baseline_file" "$export_file"
    log_info "Baseline exported to: $export_file"
}

# Parse arguments
COMMAND="${1:-help}"
shift || true
ITERATIONS=3

while [[ $# -gt 0 ]]; do
    case $1 in
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --iterations)
            ITERATIONS="$2"
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
check_k6
check_jq

case "$COMMAND" in
    establish)
        establish_baseline "$ITERATIONS"
        ;;
    compare)
        compare_performance
        ;;
    view)
        view_baseline
        ;;
    export)
        export_baseline
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
