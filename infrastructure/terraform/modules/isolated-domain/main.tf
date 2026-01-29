# Isolated Domain Module
# For enterprise customers requiring complete data isolation

variable "domain_name" {
  description = "Domain name"
  type        = string
}

variable "organization_id" {
  description = "Organization UUID"
  type        = string
}

variable "region" {
  description = "AWS region for isolated deployment"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_ids" {
  description = "Subnet IDs"
  type        = list(string)
}

variable "database_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.xlarge"
}

variable "storage_size_gb" {
  description = "Initial storage size in GB"
  type        = number
  default     = 100
}

variable "enable_encryption" {
  description = "Enable encryption at rest"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Backup retention period"
  type        = number
  default     = 30
}

# KMS Key for encryption
resource "aws_kms_key" "domain" {
  description             = "Encryption key for ${var.domain_name}"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name         = "${var.domain_name}-key"
    Domain       = var.domain_name
    Organization = var.organization_id
  }
}

resource "aws_kms_alias" "domain" {
  name          = "alias/${replace(var.domain_name, ".", "-")}"
  target_key_id = aws_kms_key.domain.key_id
}

# Dedicated RDS Instance
resource "aws_db_subnet_group" "domain" {
  name       = "${replace(var.domain_name, ".", "-")}-db-subnet"
  subnet_ids = var.subnet_ids

  tags = {
    Name         = "${var.domain_name} DB Subnet Group"
    Domain       = var.domain_name
    Organization = var.organization_id
  }
}

resource "aws_security_group" "domain_db" {
  name        = "${replace(var.domain_name, ".", "-")}-db-sg"
  description = "Security group for ${var.domain_name} database"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"] # VPC CIDR
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name         = "${var.domain_name} DB Security Group"
    Domain       = var.domain_name
    Organization = var.organization_id
  }
}

resource "aws_db_instance" "domain" {
  identifier     = "${replace(var.domain_name, ".", "-")}-db"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = var.database_instance_class

  allocated_storage     = var.storage_size_gb
  max_allocated_storage = var.storage_size_gb * 10
  storage_encrypted     = var.enable_encryption
  kms_key_id            = var.enable_encryption ? aws_kms_key.domain.arn : null

  db_name  = replace(var.domain_name, ".", "_")
  username = "admin"
  password = random_password.db_password.result

  db_subnet_group_name   = aws_db_subnet_group.domain.name
  vpc_security_group_ids = [aws_security_group.domain_db.id]

  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  multi_az = true

  tags = {
    Name         = "${var.domain_name} Database"
    Domain       = var.domain_name
    Organization = var.organization_id
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

# S3 Bucket for email storage
resource "aws_s3_bucket" "domain_storage" {
  bucket = "${replace(var.domain_name, ".", "-")}-email-storage"

  tags = {
    Name         = "${var.domain_name} Email Storage"
    Domain       = var.domain_name
    Organization = var.organization_id
  }
}

resource "aws_s3_bucket_versioning" "domain_storage" {
  bucket = aws_s3_bucket.domain_storage.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "domain_storage" {
  bucket = aws_s3_bucket.domain_storage.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.domain.arn
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "domain_storage" {
  bucket = aws_s3_bucket.domain_storage.id

  rule {
    id     = "transition-to-glacier"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    transition {
      days          = 180
      storage_class = "DEEP_ARCHIVE"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "domain_storage" {
  bucket = aws_s3_bucket.domain_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# IAM Role for domain services
resource "aws_iam_role" "domain_service" {
  name = "${replace(var.domain_name, ".", "-")}-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Domain       = var.domain_name
    Organization = var.organization_id
  }
}

resource "aws_iam_role_policy" "domain_storage_access" {
  name = "storage-access"
  role = aws_iam_role.domain_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.domain_storage.arn,
          "${aws_s3_bucket.domain_storage.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey"
        ]
        Resource = [aws_kms_key.domain.arn]
      }
    ]
  })
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "domain" {
  name              = "/aws/email/${var.domain_name}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.domain.arn

  tags = {
    Domain       = var.domain_name
    Organization = var.organization_id
  }
}

# Store credentials in Secrets Manager
resource "aws_secretsmanager_secret" "domain_db_credentials" {
  name        = "${replace(var.domain_name, ".", "-")}-db-credentials"
  description = "Database credentials for ${var.domain_name}"
  kms_key_id  = aws_kms_key.domain.arn

  tags = {
    Domain       = var.domain_name
    Organization = var.organization_id
  }
}

resource "aws_secretsmanager_secret_version" "domain_db_credentials" {
  secret_id = aws_secretsmanager_secret.domain_db_credentials.id
  secret_string = jsonencode({
    username = aws_db_instance.domain.username
    password = random_password.db_password.result
    endpoint = aws_db_instance.domain.endpoint
    database = aws_db_instance.domain.db_name
  })
}

# Outputs
output "database_endpoint" {
  value = aws_db_instance.domain.endpoint
}

output "storage_bucket" {
  value = aws_s3_bucket.domain_storage.bucket
}

output "kms_key_id" {
  value = aws_kms_key.domain.key_id
}

output "service_role_arn" {
  value = aws_iam_role.domain_service.arn
}

output "credentials_secret_arn" {
  value = aws_secretsmanager_secret.domain_db_credentials.arn
}
