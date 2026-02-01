#!/usr/bin/env bash
# Security Testing Environment Setup
# Creates an isolated environment for penetration testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
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

# Configuration
SECURITY_ENV_NAME="${SECURITY_ENV_NAME:-security-test}"
SECURITY_NETWORK="${SECURITY_ENV_NAME}-network"

show_help() {
    echo "Security Testing Environment Setup"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  setup      Create isolated security testing environment"
    echo "  start      Start the security testing environment"
    echo "  stop       Stop the security testing environment"
    echo "  destroy    Destroy the security testing environment"
    echo "  status     Show environment status"
    echo "  logs       View logs from all services"
    echo ""
    echo "Environment Variables:"
    echo "  SECURITY_ENV_NAME    Environment name prefix (default: security-test)"
    echo ""
}

check_prerequisites() {
    log_header "Checking Prerequisites"

    if ! command -v docker &> /dev/null; then
        log_error "Docker is required but not installed"
        exit 1
    fi

    if ! command -v docker compose &> /dev/null; then
        log_error "Docker Compose is required but not installed"
        exit 1
    fi

    log_info "Prerequisites check passed"
}

create_network() {
    log_info "Creating isolated network: $SECURITY_NETWORK"
    docker network create "$SECURITY_NETWORK" 2>/dev/null || true
}

setup_environment() {
    log_header "Setting Up Security Testing Environment"

    check_prerequisites

    # Create isolated Docker network
    create_network

    # Create reports directory
    mkdir -p "$SCRIPT_DIR/reports"

    # Create .env file for security testing
    cat > "$SCRIPT_DIR/.env.security" << EOF
# Security Testing Environment
# Auto-generated - do not edit manually

NODE_ENV=test
DATABASE_URL=postgresql://postgres:securitytest@${SECURITY_ENV_NAME}-postgres:5432/emailplatform_security
REDIS_URL=redis://${SECURITY_ENV_NAME}-redis:6379
JWT_SECRET=security-testing-jwt-secret-do-not-use-in-production
SESSION_SECRET=security-testing-session-secret

# Disable rate limiting for thorough testing
RATE_LIMIT_ENABLED=false

# Enable verbose logging
LOG_LEVEL=debug

# Security test mode
SECURITY_TEST_MODE=true

# CSP in report-only mode for testing
CSP_REPORT_ONLY=true
CSP_REPORT_URI=/api/csp-report
EOF

    log_info "Environment configuration created: .env.security"

    # Create docker-compose override for security testing
    cat > "$SCRIPT_DIR/docker-compose.security-app.yml" << EOF
# Security Testing Application Stack
# Isolated from production environment

services:
  # PostgreSQL for isolated testing
  postgres:
    image: postgres:16-alpine
    container_name: ${SECURITY_ENV_NAME}-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: securitytest
      POSTGRES_DB: emailplatform_security
    volumes:
      - ${SECURITY_ENV_NAME}-postgres-data:/var/lib/postgresql/data
    networks:
      - ${SECURITY_NETWORK}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Redis for isolated testing
  redis:
    image: redis:7-alpine
    container_name: ${SECURITY_ENV_NAME}-redis
    networks:
      - ${SECURITY_NETWORK}
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # MinIO for isolated storage testing
  minio:
    image: minio/minio:latest
    container_name: ${SECURITY_ENV_NAME}-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - ${SECURITY_ENV_NAME}-minio-data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    networks:
      - ${SECURITY_NETWORK}

  # Web application
  web:
    build:
      context: ${PROJECT_ROOT}
      dockerfile: apps/web/Dockerfile
    container_name: ${SECURITY_ENV_NAME}-web
    env_file:
      - .env.security
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - ${SECURITY_NETWORK}
      - security-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Admin application (optional)
  admin:
    build:
      context: ${PROJECT_ROOT}
      dockerfile: apps/admin/Dockerfile
    container_name: ${SECURITY_ENV_NAME}-admin
    env_file:
      - .env.security
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - ${SECURITY_NETWORK}
      - security-network

volumes:
  ${SECURITY_ENV_NAME}-postgres-data:
  ${SECURITY_ENV_NAME}-minio-data:

networks:
  ${SECURITY_NETWORK}:
    external: true
  security-network:
    external: true
EOF

    log_info "Application stack configuration created: docker-compose.security-app.yml"

    log_header "Security Testing Environment Ready"
    echo ""
    echo "Next steps:"
    echo "  1. Start the environment:    $0 start"
    echo "  2. Run security tests:       ./run-security-tests.sh all"
    echo "  3. View reports:             ls reports/"
    echo "  4. Stop when done:           $0 stop"
    echo "  5. Destroy environment:      $0 destroy"
}

start_environment() {
    log_header "Starting Security Testing Environment"

    create_network

    # Start security scanning tools
    log_info "Starting security scanning infrastructure..."
    docker compose -f docker-compose.security.yml up -d

    # Start application stack
    log_info "Starting application under test..."
    docker compose -f docker-compose.security-app.yml up -d

    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 10

    # Health check
    local max_attempts=30
    local attempt=0
    while ! curl -s "http://localhost:3000/api/health" > /dev/null 2>&1; do
        ((attempt++))
        if [ $attempt -ge $max_attempts ]; then
            log_warn "Application may not be fully ready"
            break
        fi
        sleep 2
    done

    show_status
}

stop_environment() {
    log_header "Stopping Security Testing Environment"

    docker compose -f docker-compose.security-app.yml down 2>/dev/null || true
    docker compose -f docker-compose.security.yml down 2>/dev/null || true

    log_info "Environment stopped"
}

destroy_environment() {
    log_header "Destroying Security Testing Environment"

    log_warn "This will delete all test data and volumes. Continue? [y/N]"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "Cancelled"
        exit 0
    fi

    # Stop all containers
    stop_environment

    # Remove volumes
    log_info "Removing volumes..."
    docker volume rm "${SECURITY_ENV_NAME}-postgres-data" 2>/dev/null || true
    docker volume rm "${SECURITY_ENV_NAME}-minio-data" 2>/dev/null || true
    docker volume rm "$(docker volume ls -q | grep security)" 2>/dev/null || true

    # Remove network
    log_info "Removing network..."
    docker network rm "$SECURITY_NETWORK" 2>/dev/null || true

    # Remove config files
    rm -f "$SCRIPT_DIR/.env.security"
    rm -f "$SCRIPT_DIR/docker-compose.security-app.yml"

    log_info "Environment destroyed"
}

show_status() {
    log_header "Security Testing Environment Status"

    echo "Services:"
    docker compose -f docker-compose.security.yml ps 2>/dev/null || echo "  Security tools not running"
    echo ""
    docker compose -f docker-compose.security-app.yml ps 2>/dev/null || echo "  Application not running"

    echo ""
    echo "Access points:"
    echo "  Web Application:  http://localhost:3000"
    echo "  Admin Panel:      http://localhost:3001"
    echo "  ZAP API:          http://localhost:8080"
    echo "  MinIO Console:    http://localhost:9001"

    echo ""
    echo "Reports directory:  $SCRIPT_DIR/reports"
}

view_logs() {
    log_header "Security Testing Environment Logs"

    docker compose -f docker-compose.security-app.yml logs -f
}

# Main
case "${1:-help}" in
    setup)
        setup_environment
        ;;
    start)
        start_environment
        ;;
    stop)
        stop_environment
        ;;
    destroy)
        destroy_environment
        ;;
    status)
        show_status
        ;;
    logs)
        view_logs
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
