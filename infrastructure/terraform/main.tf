# Terraform Root Configuration
# Multi-Domain Email Infrastructure

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    bucket         = "oonrumail-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "oonrumail"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "kubernetes" {
  config_path = var.kubeconfig_path
}

provider "helm" {
  kubernetes {
    config_path = var.kubeconfig_path
  }
}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "kubeconfig_path" {
  description = "Path to kubeconfig file"
  type        = string
  default     = "~/.kube/config"
}

variable "primary_domain" {
  description = "Primary mail domain"
  type        = string
  default     = "oonrumail.com"
}

variable "admin_email" {
  description = "Admin email for Let's Encrypt"
  type        = string
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {}

# Main infrastructure
module "vpc" {
  source = "./modules/vpc"

  environment     = var.environment
  cidr_block      = "10.0.0.0/16"
  azs             = data.aws_availability_zones.available.names
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

module "eks" {
  source = "./modules/eks"

  cluster_name    = "oonrumail-${var.environment}"
  cluster_version = "1.28"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets
}

module "rds" {
  source = "./modules/rds"

  identifier          = "oonrumail-${var.environment}"
  engine_version      = "15.4"
  instance_class      = "db.r6g.xlarge"
  allocated_storage   = 100
  vpc_id              = module.vpc.vpc_id
  subnet_ids          = module.vpc.private_subnets
  multi_az            = true
}

module "primary_domain" {
  source = "./modules/domain"

  domain_name       = var.primary_domain
  mail_server_ip    = module.eks.load_balancer_ip
  zone_id           = aws_route53_zone.primary.zone_id
  is_primary        = true
  enable_dkim       = true
  enable_dmarc      = true
  enable_spf        = true
}

module "monitoring" {
  source = "./modules/monitoring"

  cluster_name = module.eks.cluster_name
  environment  = var.environment
}

# Route53 Primary Zone
resource "aws_route53_zone" "primary" {
  name = var.primary_domain

  tags = {
    Name = "Primary mail domain"
  }
}

# Outputs
output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "database_endpoint" {
  value = module.rds.endpoint
}

output "primary_nameservers" {
  value = aws_route53_zone.primary.name_servers
}

output "mail_server_ip" {
  value = module.eks.load_balancer_ip
}
