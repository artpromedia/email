#!/bin/bash
# Chaos Engineering Test Runner
# Runs chaos experiments against the Enterprise Email system
#
# Prerequisites:
#   - Docker and docker-compose installed
#   - Chaos Toolkit installed: pip install chaostoolkit chaostoolkit-kubernetes
#   - System running with docker-compose
#
# Usage:
#   ./run-chaos-tests.sh [experiment-name]
#   ./run-chaos-tests.sh --all
#   ./run-chaos-tests.sh --list

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
EXPERIMENTS_FILE="${SCRIPT_DIR}/chaos-experiments.yaml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create results directory
mkdir -p "${RESULTS_DIR}"

# Available experiments
EXPERIMENTS=(
    "database-primary-failure"
    "redis-failure"
    "network-partition"
    "high-cpu-load"
    "memory-pressure"
    "disk-io-saturation"
    "dns-failure"
    "certificate-issues"
)

# Print usage
usage() {
    echo "Chaos Engineering Test Runner"
    echo ""
    echo "Usage: $0 [options] [experiment-name]"
    echo ""
    echo "Options:"
    echo "  --all       Run all experiments"
    echo "  --list      List available experiments"
    echo "  --dry-run   Validate experiments without running"
    echo "  --help      Show this help message"
    echo ""
    echo "Available experiments:"
    for exp in "${EXPERIMENTS[@]}"; do
        echo "  - $exp"
    done
}

# List experiments
list_experiments() {
    echo "Available Chaos Experiments:"
    echo ""
    for exp in "${EXPERIMENTS[@]}"; do
        echo "  - $exp"
    done
    echo ""
    echo "Run with: $0 <experiment-name>"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check for chaos toolkit
    if ! command -v chaos &> /dev/null; then
        log_error "Chaos Toolkit not found. Install with: pip install chaostoolkit"
        exit 1
    fi

    # Check for Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found. Please install Docker."
        exit 1
    fi

    # Check if services are running
    if ! docker ps | grep -q "enterprise-email"; then
        log_warning "Enterprise Email services may not be running"
        log_info "Start services with: docker-compose up -d"
    fi

    log_success "Prerequisites check passed"
}

# Create snapshot before chaos
create_snapshot() {
    local experiment=$1
    local snapshot_dir="${RESULTS_DIR}/snapshots/${experiment}"
    mkdir -p "${snapshot_dir}"

    log_info "Creating pre-chaos snapshot..."

    # Capture container states
    docker ps --filter "name=enterprise-email" --format "{{.Names}}: {{.Status}}" > "${snapshot_dir}/containers.txt"

    # Capture database state
    docker exec enterprise-email-postgres pg_dump -U email_admin enterprise_email --schema-only > "${snapshot_dir}/schema.sql" 2>/dev/null || true

    # Capture metrics
    curl -s http://localhost:9090/api/v1/query?query=up > "${snapshot_dir}/metrics.json" 2>/dev/null || true

    log_success "Snapshot created at ${snapshot_dir}"
}

# Verify system health
verify_health() {
    local max_attempts=30
    local attempt=0

    log_info "Verifying system health..."

    while [ $attempt -lt $max_attempts ]; do
        # Check API health
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health | grep -q "200"; then
            log_success "System is healthy"
            return 0
        fi

        attempt=$((attempt + 1))
        log_info "Waiting for system to be healthy (attempt $attempt/$max_attempts)..."
        sleep 5
    done

    log_error "System health check failed"
    return 1
}

# Run a single experiment
run_experiment() {
    local experiment=$1
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local result_file="${RESULTS_DIR}/${experiment}_${timestamp}.json"
    local journal_file="${RESULTS_DIR}/${experiment}_${timestamp}_journal.json"

    log_info "Running experiment: $experiment"

    # Create snapshot
    create_snapshot "$experiment"

    # Verify health before starting
    if ! verify_health; then
        log_error "System not healthy, aborting experiment"
        return 1
    fi

    # Run the chaos experiment
    log_info "Executing chaos experiment..."

    chaos run \
        --rollback-strategy=always \
        --hypothesis-strategy=continuously \
        --journal-path="${journal_file}" \
        "${EXPERIMENTS_FILE}" \
        --var experiment_name="${experiment}" \
        2>&1 | tee "${RESULTS_DIR}/${experiment}_${timestamp}.log"

    local exit_code=$?

    # Generate report
    if [ -f "${journal_file}" ]; then
        chaos report \
            --export-format=html \
            "${journal_file}" \
            "${RESULTS_DIR}/${experiment}_${timestamp}_report.html" 2>/dev/null || true
    fi

    # Verify health after experiment
    log_info "Verifying system health after experiment..."
    sleep 10
    if verify_health; then
        log_success "System recovered successfully"
    else
        log_warning "System may need manual intervention"
    fi

    if [ $exit_code -eq 0 ]; then
        log_success "Experiment completed successfully: $experiment"
    else
        log_error "Experiment failed: $experiment (exit code: $exit_code)"
    fi

    return $exit_code
}

# Run all experiments
run_all_experiments() {
    local failed=0
    local passed=0

    log_info "Running all chaos experiments..."

    for exp in "${EXPERIMENTS[@]}"; do
        echo ""
        echo "=============================================="
        echo "Experiment: $exp"
        echo "=============================================="

        if run_experiment "$exp"; then
            passed=$((passed + 1))
        else
            failed=$((failed + 1))
        fi

        # Wait between experiments
        log_info "Waiting 30 seconds before next experiment..."
        sleep 30
    done

    echo ""
    echo "=============================================="
    echo "Chaos Testing Summary"
    echo "=============================================="
    echo "Total experiments: ${#EXPERIMENTS[@]}"
    echo "Passed: $passed"
    echo "Failed: $failed"
    echo ""

    if [ $failed -gt 0 ]; then
        log_error "Some experiments failed"
        return 1
    else
        log_success "All experiments passed"
        return 0
    fi
}

# Validate experiments (dry run)
dry_run() {
    log_info "Validating chaos experiments (dry run)..."

    chaos validate "${EXPERIMENTS_FILE}"

    if [ $? -eq 0 ]; then
        log_success "All experiments are valid"
    else
        log_error "Experiment validation failed"
        return 1
    fi
}

# Main execution
main() {
    case "${1:-}" in
        --help|-h)
            usage
            exit 0
            ;;
        --list|-l)
            list_experiments
            exit 0
            ;;
        --dry-run)
            check_prerequisites
            dry_run
            exit $?
            ;;
        --all|-a)
            check_prerequisites
            run_all_experiments
            exit $?
            ;;
        "")
            usage
            exit 1
            ;;
        *)
            # Check if valid experiment
            valid=false
            for exp in "${EXPERIMENTS[@]}"; do
                if [ "$exp" = "$1" ]; then
                    valid=true
                    break
                fi
            done

            if [ "$valid" = true ]; then
                check_prerequisites
                run_experiment "$1"
                exit $?
            else
                log_error "Unknown experiment: $1"
                list_experiments
                exit 1
            fi
            ;;
    esac
}

main "$@"
