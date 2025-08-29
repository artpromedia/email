#!/bin/bash
# CEERION Mail Transport Setup Script
# Production-grade mail stack deployment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        error "Docker is not running. Please start Docker service."
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi
    
    # Check if AWS CLI is installed (for backups)
    if ! command -v aws &> /dev/null; then
        warn "AWS CLI is not installed. Backup functionality will be limited."
    fi
    
    log "Prerequisites check passed ✓"
}

# Generate SSL certificates
generate_ssl_certs() {
    log "Generating SSL certificates..."
    
    mkdir -p "$PROJECT_ROOT/docker/ssl"
    
    # Generate DH parameters
    if [[ ! -f "$PROJECT_ROOT/docker/ssl/dh.pem" ]]; then
        log "Generating Diffie-Hellman parameters (this may take a while)..."
        openssl dhparam -out "$PROJECT_ROOT/docker/ssl/dh.pem" 2048
    fi
    
    # Generate self-signed certificate for development
    if [[ ! -f "$PROJECT_ROOT/docker/ssl/mail.ceerion.com.crt" ]]; then
        log "Generating self-signed SSL certificate..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$PROJECT_ROOT/docker/ssl/mail.ceerion.com.key" \
            -out "$PROJECT_ROOT/docker/ssl/mail.ceerion.com.crt" \
            -subj "/C=US/ST=State/L=City/O=CEERION/OU=Mail/CN=mail.ceerion.com"
    fi
    
    log "SSL certificates generated ✓"
}

# Generate DKIM keys
generate_dkim_keys() {
    log "Generating DKIM keys..."
    
    mkdir -p "$PROJECT_ROOT/docker/dkim"
    
    if [[ ! -f "$PROJECT_ROOT/docker/dkim/ceerion.private" ]]; then
        # Generate DKIM private key
        openssl genrsa -out "$PROJECT_ROOT/docker/dkim/ceerion.private" 1024
        
        # Generate DKIM public key
        openssl rsa -in "$PROJECT_ROOT/docker/dkim/ceerion.private" \
            -pubout -outform DER | openssl base64 -A > "$PROJECT_ROOT/docker/dkim/ceerion.public"
        
        # Generate DNS record
        echo "ceerion._domainkey IN TXT \"v=DKIM1; k=rsa; p=$(cat "$PROJECT_ROOT/docker/dkim/ceerion.public")\"" \
            > "$PROJECT_ROOT/docker/dkim/dns-record.txt"
    fi
    
    log "DKIM keys generated ✓"
}

# Setup environment
setup_environment() {
    log "Setting up environment configuration..."
    
    if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
        if [[ -f "$PROJECT_ROOT/.env.mail" ]]; then
            cp "$PROJECT_ROOT/.env.mail" "$PROJECT_ROOT/.env"
            log "Environment file created from template"
        else
            error "Environment template not found. Please create .env.mail file."
            exit 1
        fi
    fi
    
    # Generate secure passwords if not set
    if grep -q "your_" "$PROJECT_ROOT/.env"; then
        warn "Default placeholder values detected in .env file."
        warn "Please update the following:"
        grep "your_" "$PROJECT_ROOT/.env" || true
        warn "Update these values before proceeding to production."
    fi
    
    log "Environment configuration completed ✓"
}

# Initialize databases
init_databases() {
    log "Initializing databases..."
    
    # Start only PostgreSQL for initialization
    docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" up -d postgres-mail
    
    # Wait for PostgreSQL to be ready
    log "Waiting for PostgreSQL to be ready..."
    sleep 10
    
    # Check if database is responsive
    for i in {1..30}; do
        if docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" exec -T postgres-mail \
           pg_isready -U ceerion -d ceerion_mail &> /dev/null; then
            break
        fi
        echo -n "."
        sleep 2
        if [[ $i -eq 30 ]]; then
            error "PostgreSQL failed to start after 60 seconds"
            exit 1
        fi
    done
    
    log "Database initialization completed ✓"
}

# Setup DNS records information
show_dns_records() {
    log "Required DNS Records:"
    echo ""
    echo -e "${BLUE}A Records:${NC}"
    echo "mail.ceerion.com.     IN A     [YOUR_SERVER_IP]"
    echo "mta-sts.ceerion.com. IN A     [YOUR_SERVER_IP]"
    echo ""
    echo -e "${BLUE}MX Record:${NC}"  
    echo "ceerion.com.         IN MX 10 mail.ceerion.com."
    echo ""
    echo -e "${BLUE}DKIM Record:${NC}"
    if [[ -f "$PROJECT_ROOT/docker/dkim/dns-record.txt" ]]; then
        cat "$PROJECT_ROOT/docker/dkim/dns-record.txt"
    else
        echo "ceerion._domainkey.ceerion.com. IN TXT \"v=DKIM1; k=rsa; p=[DKIM_PUBLIC_KEY]\""
    fi
    echo ""
    echo -e "${BLUE}DMARC Record:${NC}"
    echo "_dmarc.ceerion.com.  IN TXT \"v=DMARC1; p=quarantine; rua=mailto:dmarc@ceerion.com\""
    echo ""
    echo -e "${BLUE}SPF Record:${NC}"
    echo "ceerion.com.         IN TXT \"v=spf1 mx ip4:[YOUR_SERVER_IP] -all\""
    echo ""
    echo -e "${BLUE}MTA-STS Record:${NC}"
    echo "_mta-sts.ceerion.com. IN TXT \"v=STSv1; id=1\""
    echo ""
    echo -e "${BLUE}TLS-RPT Record:${NC}"
    echo "_tlsrpt.ceerion.com. IN TXT \"v=TLSRPTv1; rua=mailto:tlsrpt@ceerion.com\""
    echo ""
}

# Start mail services
start_services() {
    log "Starting CEERION Mail Transport services..."
    
    # Build and start all services
    docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" up -d --build
    
    log "Waiting for services to start..."
    sleep 30
    
    # Check service health
    log "Checking service health..."
    
    services=("postgres-mail" "redis-mail" "postfix" "dovecot" "rspamd" "clamav" "nginx-mail")
    
    for service in "${services[@]}"; do
        if docker-compose -f "$PROJECT_ROOT/docker-compose.mail.yml" ps "$service" | grep -q "Up"; then
            log "$service: ✓ Running"
        else
            error "$service: ✗ Not running"
        fi
    done
}

# Run acceptance tests
run_acceptance_tests() {
    log "Running acceptance tests..."
    
    # Test SMTP connectivity
    log "Testing SMTP connectivity..."
    if timeout 5 bash -c "</dev/tcp/localhost/25"; then
        log "SMTP port 25: ✓ Open"
    else
        warn "SMTP port 25: ✗ Not accessible"
    fi
    
    if timeout 5 bash -c "</dev/tcp/localhost/587"; then
        log "SMTP port 587 (Submission): ✓ Open"
    else
        warn "SMTP port 587: ✗ Not accessible"
    fi
    
    # Test IMAP connectivity
    log "Testing IMAP connectivity..."
    if timeout 5 bash -c "</dev/tcp/localhost/993"; then
        log "IMAP port 993: ✓ Open"
    else
        warn "IMAP port 993: ✗ Not accessible"
    fi
    
    # Test JMAP connectivity
    log "Testing JMAP connectivity..."
    if timeout 5 bash -c "</dev/tcp/localhost/8080"; then
        log "JMAP port 8080: ✓ Open"
    else
        warn "JMAP port 8080: ✗ Not accessible"
    fi
    
    # Test Rspamd web interface
    log "Testing Rspamd web interface..."
    if timeout 5 bash -c "</dev/tcp/localhost/11334"; then
        log "Rspamd web interface: ✓ Accessible"
    else
        warn "Rspamd web interface: ✗ Not accessible"
    fi
}

# Main execution
main() {
    echo -e "${BLUE}"
    echo "========================================"
    echo "CEERION Mail Transport Setup"
    echo "========================================"
    echo -e "${NC}"
    
    check_prerequisites
    generate_ssl_certs
    generate_dkim_keys
    setup_environment
    init_databases
    start_services
    run_acceptance_tests
    show_dns_records
    
    echo ""
    log "🎉 CEERION Mail Transport setup completed!"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo "1. Configure DNS records (shown above)"
    echo "2. Update SSL certificates with real ones"
    echo "3. Configure AWS credentials for backups"
    echo "4. Test email sending and receiving"
    echo "5. Monitor logs: docker-compose -f docker-compose.mail.yml logs -f"
    echo ""
    echo -e "${YELLOW}Important URLs:${NC}"
    echo "- Rspamd Web UI: http://localhost:11334"
    echo "- JMAP API: http://localhost:8080"
    echo "- MTA-STS Policy: https://mta-sts.ceerion.com/.well-known/mta-sts.txt"
    echo ""
    echo -e "${YELLOW}Security Note:${NC}"
    echo "This setup uses self-signed certificates. For production,"
    echo "replace with certificates from a trusted CA."
}

# Execute main function
main "$@"
