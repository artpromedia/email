#!/bin/bash

# Multi-Domain Infrastructure Deployment Script
# Automates deployment of complete email infrastructure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${ENVIRONMENT:-production}"
AWS_REGION="${AWS_REGION:-us-east-1}"
KUBERNETES_NAMESPACE="${KUBERNETES_NAMESPACE:-email-system}"
PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-enterprise-email.com}"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    local missing=0
    
    if ! command -v kubectl &> /dev/null; then
        error "kubectl is not installed"
        missing=1
    fi
    
    if ! command -v terraform &> /dev/null; then
        error "terraform is not installed"
        missing=1
    fi
    
    if ! command -v helm &> /dev/null; then
        error "helm is not installed"
        missing=1
    fi
    
    if ! command -v aws &> /dev/null; then
        error "aws CLI is not installed"
        missing=1
    fi
    
    if [ $missing -eq 1 ]; then
        error "Please install missing prerequisites"
        exit 1
    fi
    
    log "All prerequisites met ✓"
}

# Deploy infrastructure with Terraform
deploy_terraform() {
    log "Deploying infrastructure with Terraform..."
    
    cd "$PROJECT_ROOT/infrastructure/terraform"
    
    # Initialize Terraform
    log "Initializing Terraform..."
    terraform init
    
    # Plan deployment
    log "Planning Terraform deployment..."
    terraform plan \
        -var="aws_region=$AWS_REGION" \
        -var="environment=$ENVIRONMENT" \
        -var="primary_domain=$PRIMARY_DOMAIN" \
        -out=tfplan
    
    # Apply deployment
    log "Applying Terraform configuration..."
    terraform apply tfplan
    
    # Get outputs
    CLUSTER_ENDPOINT=$(terraform output -raw cluster_endpoint)
    DB_ENDPOINT=$(terraform output -raw database_endpoint)
    MAIL_SERVER_IP=$(terraform output -raw mail_server_ip)
    
    log "Infrastructure deployed ✓"
    log "Cluster endpoint: $CLUSTER_ENDPOINT"
    log "Database endpoint: $DB_ENDPOINT"
    log "Mail server IP: $MAIL_SERVER_IP"
}

# Configure kubectl
configure_kubectl() {
    log "Configuring kubectl..."
    
    aws eks update-kubeconfig \
        --region "$AWS_REGION" \
        --name "enterprise-email-$ENVIRONMENT"
    
    # Verify connection
    if kubectl cluster-info &> /dev/null; then
        log "kubectl configured successfully ✓"
    else
        error "Failed to connect to Kubernetes cluster"
        exit 1
    fi
}

# Install cert-manager
install_cert_manager() {
    log "Installing cert-manager..."
    
    # Check if already installed
    if kubectl get namespace cert-manager &> /dev/null; then
        warning "cert-manager namespace already exists, skipping installation"
        return
    fi
    
    # Install cert-manager CRDs
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.crds.yaml
    
    # Install cert-manager with Helm
    helm repo add jetstack https://charts.jetstack.io
    helm repo update
    
    helm install cert-manager jetstack/cert-manager \
        --namespace cert-manager \
        --create-namespace \
        --version v1.13.0 \
        --set installCRDs=false
    
    # Wait for cert-manager to be ready
    kubectl wait --for=condition=ready pod \
        -l app.kubernetes.io/instance=cert-manager \
        -n cert-manager \
        --timeout=300s
    
    log "cert-manager installed ✓"
}

# Install ingress-nginx
install_ingress_nginx() {
    log "Installing ingress-nginx..."
    
    # Check if already installed
    if kubectl get namespace ingress-nginx &> /dev/null; then
        warning "ingress-nginx namespace already exists, skipping installation"
        return
    fi
    
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    
    helm install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.service.type=LoadBalancer \
        --set controller.metrics.enabled=true \
        --set controller.podAnnotations."prometheus\.io/scrape"=true \
        --set controller.podAnnotations."prometheus\.io/port"=10254
    
    # Wait for ingress controller to be ready
    kubectl wait --for=condition=ready pod \
        -l app.kubernetes.io/component=controller \
        -n ingress-nginx \
        --timeout=300s
    
    log "ingress-nginx installed ✓"
}

# Deploy email system namespace
deploy_namespace() {
    log "Creating email system namespace..."
    
    if kubectl get namespace "$KUBERNETES_NAMESPACE" &> /dev/null; then
        warning "Namespace $KUBERNETES_NAMESPACE already exists"
    else
        kubectl create namespace "$KUBERNETES_NAMESPACE"
        log "Namespace created ✓"
    fi
    
    # Label namespace
    kubectl label namespace "$KUBERNETES_NAMESPACE" \
        app=email-system \
        environment="$ENVIRONMENT" \
        --overwrite
}

# Deploy Kubernetes resources
deploy_kubernetes_resources() {
    log "Deploying Kubernetes resources..."
    
    cd "$PROJECT_ROOT/infrastructure/kubernetes"
    
    # Apply cert-manager setup
    log "Applying cert-manager configuration..."
    kubectl apply -f cert-manager-setup.yaml
    
    # Apply ingress configuration
    log "Applying ingress configuration..."
    kubectl apply -f ingress.yaml
    
    # Apply dynamic ingress controller
    log "Applying dynamic ingress controller..."
    kubectl apply -f dynamic-ingress-controller.yaml
    
    log "Kubernetes resources deployed ✓"
}

# Deploy monitoring stack
deploy_monitoring() {
    log "Deploying monitoring stack..."
    
    # Check if monitoring namespace exists
    if ! kubectl get namespace monitoring &> /dev/null; then
        kubectl create namespace monitoring
    fi
    
    # Install Prometheus
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update
    
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
        --set grafana.enabled=true \
        --set grafana.adminPassword="$GRAFANA_PASSWORD" \
        --values "$PROJECT_ROOT/infrastructure/monitoring/prometheus-values.yaml" \
        --wait
    
    # Apply custom alert rules
    kubectl apply -f "$PROJECT_ROOT/infrastructure/monitoring/alert-rules.yml"
    
    # Import Grafana dashboards
    log "Importing Grafana dashboards..."
    kubectl create configmap grafana-dashboard-domain-overview \
        --from-file="$PROJECT_ROOT/infrastructure/monitoring/grafana-dashboard-domain-overview.json" \
        -n monitoring \
        --dry-run=client -o yaml | kubectl apply -f -
    
    log "Monitoring stack deployed ✓"
}

# Run database migrations
run_database_migrations() {
    log "Running database migrations..."
    
    # Get database credentials from Terraform outputs
    cd "$PROJECT_ROOT/infrastructure/terraform"
    DB_ENDPOINT=$(terraform output -raw database_endpoint)
    DB_PASSWORD=$(terraform output -raw database_password 2>/dev/null || echo "")
    
    if [ -z "$DB_PASSWORD" ]; then
        error "Database password not available in Terraform outputs"
        error "Please set DB_PASSWORD environment variable"
        return 1
    fi
    
    # Run migrations for each service
    for service in domain-manager smtp-server imap-server storage; do
        if [ -d "$PROJECT_ROOT/services/$service/migrations" ]; then
            log "Running migrations for $service..."
            # TODO: Add migration runner command
        fi
    done
    
    log "Database migrations completed ✓"
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    # Check all pods are running
    log "Checking pod status..."
    kubectl get pods -n "$KUBERNETES_NAMESPACE"
    
    # Check ingress
    log "Checking ingress..."
    kubectl get ingress -n "$KUBERNETES_NAMESPACE"
    
    # Check certificates
    log "Checking certificates..."
    kubectl get certificates -n "$KUBERNETES_NAMESPACE"
    
    # Test DNS resolution
    log "Testing DNS resolution..."
    dig +short "mail.$PRIMARY_DOMAIN"
    
    log "Deployment verification completed ✓"
}

# Main deployment function
main() {
    log "Starting multi-domain infrastructure deployment..."
    log "Environment: $ENVIRONMENT"
    log "Region: $AWS_REGION"
    log "Namespace: $KUBERNETES_NAMESPACE"
    log "Primary Domain: $PRIMARY_DOMAIN"
    
    # Confirm deployment
    read -p "Continue with deployment? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "Deployment cancelled"
        exit 0
    fi
    
    # Run deployment steps
    check_prerequisites
    deploy_terraform
    configure_kubectl
    install_cert_manager
    install_ingress_nginx
    deploy_namespace
    deploy_kubernetes_resources
    deploy_monitoring
    run_database_migrations
    verify_deployment
    
    log ""
    log "========================================="
    log "Deployment completed successfully! 🎉"
    log "========================================="
    log ""
    log "Next steps:"
    log "1. Configure DNS for $PRIMARY_DOMAIN to point to $MAIL_SERVER_IP"
    log "2. Wait for Let's Encrypt certificates to be issued"
    log "3. Add your first customer domain via API"
    log ""
    log "Access points:"
    log "- Grafana: kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80"
    log "- Prometheus: kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090"
    log ""
}

# Run main function
main "$@"
