#!/usr/bin/env bash
# Integration Test Runner Script
# This script sets up the test environment and runs integration tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
CLEANUP_AFTER=false
VERBOSE=false
SPECIFIC_TEST=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --cleanup)
            CLEANUP_AFTER=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -t|--test)
            SPECIFIC_TEST="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --cleanup     Clean up containers after tests"
            echo "  -v, --verbose Enable verbose output"
            echo "  -t, --test    Run specific test (e.g., TestEmailSendReceiveFlow)"
            echo "  -h, --help    Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check for Docker
if ! command -v docker &> /dev/null; then
    log_error "Docker is required but not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    log_error "Docker Compose is required but not installed"
    exit 1
fi

# Determine docker-compose command
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

cd "$SCRIPT_DIR"

# Cleanup function
cleanup() {
    log_info "Cleaning up test environment..."
    $COMPOSE_CMD -f docker-compose.test.yml down -v --remove-orphans 2>/dev/null || true
}

# Trap to ensure cleanup on exit if requested
if [ "$CLEANUP_AFTER" = true ]; then
    trap cleanup EXIT
fi

# Start test infrastructure
log_info "Starting test infrastructure..."
$COMPOSE_CMD -f docker-compose.test.yml up -d postgres-test redis-test minio-test mailpit-test

# Wait for services to be healthy
log_info "Waiting for services to be healthy..."
MAX_RETRIES=30
RETRY_COUNT=0

wait_for_service() {
    local service=$1
    local check_cmd=$2
    local retries=0

    while ! eval "$check_cmd" &>/dev/null; do
        retries=$((retries + 1))
        if [ $retries -ge $MAX_RETRIES ]; then
            log_error "Service $service failed to become healthy"
            return 1
        fi
        sleep 1
    done
    log_info "Service $service is healthy"
}

# Wait for PostgreSQL
wait_for_service "postgres" "docker exec email-test-postgres pg_isready -U test_user -d email_test"

# Wait for Redis
wait_for_service "redis" "docker exec email-test-redis redis-cli ping"

# Wait for MinIO
wait_for_service "minio" "curl -sf http://localhost:9002/minio/health/live"

# Wait for Mailpit
wait_for_service "mailpit" "curl -sf http://localhost:8026/api/v1/info"

# Create MinIO bucket
log_info "Creating MinIO test bucket..."
docker exec email-test-minio mc alias set local http://localhost:9000 test_access_key test_secret_key 2>/dev/null || true
docker exec email-test-minio mc mb --ignore-existing local/test-attachments 2>/dev/null || true

# Set environment variables for local test run
# SECURITY NOTE: sslmode=disable is ONLY acceptable for local Docker test containers.
# NEVER use sslmode=disable in production - always use sslmode=require or sslmode=verify-full
export DATABASE_URL="postgres://test_user:test_password@localhost:5433/email_test?sslmode=disable"
export REDIS_URL="redis://localhost:6380"
export MINIO_ENDPOINT="localhost:9002"
export MINIO_ACCESS_KEY="test_access_key"
export MINIO_SECRET_KEY="test_secret_key"
export MINIO_BUCKET="test-attachments"
export MINIO_USE_SSL="false"
export SMTP_HOST="localhost"
export SMTP_PORT="1026"
export MAILPIT_API="http://localhost:8026"

# Run tests
log_info "Running integration tests..."

TEST_FLAGS="-v -timeout 300s"
if [ -n "$SPECIFIC_TEST" ]; then
    TEST_FLAGS="$TEST_FLAGS -run $SPECIFIC_TEST"
fi

if [ "$VERBOSE" = true ]; then
    TEST_FLAGS="$TEST_FLAGS -v"
fi

cd "$SCRIPT_DIR"

# Download dependencies if needed
go mod download

# Run the tests
if go test $TEST_FLAGS ./...; then
    log_info "All integration tests passed!"
    EXIT_CODE=0
else
    log_error "Some integration tests failed"
    EXIT_CODE=1
fi

# Generate coverage report if available
if [ -f coverage.out ]; then
    log_info "Generating coverage report..."
    go tool cover -html=coverage.out -o coverage.html
fi

exit $EXIT_CODE
