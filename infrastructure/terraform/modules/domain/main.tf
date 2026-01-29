# Domain Module
# Creates DNS records and SSL certificates for a customer domain

variable "domain_name" {
  description = "Domain name"
  type        = string
}

variable "mail_server_ip" {
  description = "Mail server IP address"
  type        = string
}

variable "zone_id" {
  description = "Route53 hosted zone ID (if using Route53)"
  type        = string
  default     = ""
}

variable "is_primary" {
  description = "Is this the primary mail domain"
  type        = bool
  default     = false
}

variable "enable_dkim" {
  description = "Enable DKIM records"
  type        = bool
  default     = true
}

variable "enable_dmarc" {
  description = "Enable DMARC records"
  type        = bool
  default     = true
}

variable "enable_spf" {
  description = "Enable SPF records"
  type        = bool
  default     = true
}

variable "dkim_selector" {
  description = "DKIM selector"
  type        = string
  default     = "default"
}

variable "dkim_public_key" {
  description = "DKIM public key"
  type        = string
  default     = ""
}

variable "custom_mx_records" {
  description = "Custom MX records (if not using default)"
  type = list(object({
    priority = number
    value    = string
  }))
  default = []
}

# Data source for existing zone (if customer manages their own DNS)
data "aws_route53_zone" "domain" {
  count   = var.zone_id != "" ? 1 : 0
  zone_id = var.zone_id
}

# MX Records
resource "aws_route53_record" "mx" {
  count   = var.zone_id != "" ? 1 : 0
  zone_id = var.zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 3600

  records = length(var.custom_mx_records) > 0 ? [
    for mx in var.custom_mx_records : "${mx.priority} ${mx.value}"
  ] : [
    "10 mail.enterprise-email.com"
  ]
}

# A Record for mail subdomain (if custom)
resource "aws_route53_record" "mail" {
  count   = var.zone_id != "" && !var.is_primary ? 1 : 0
  zone_id = var.zone_id
  name    = "mail.${var.domain_name}"
  type    = "CNAME"
  ttl     = 3600
  records = ["mail.enterprise-email.com"]
}

# SPF Record
resource "aws_route53_record" "spf" {
  count   = var.zone_id != "" && var.enable_spf ? 1 : 0
  zone_id = var.zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 3600

  records = [
    "v=spf1 include:spf.enterprise-email.com ~all"
  ]
}

# DKIM Record
resource "aws_route53_record" "dkim" {
  count   = var.zone_id != "" && var.enable_dkim && var.dkim_public_key != "" ? 1 : 0
  zone_id = var.zone_id
  name    = "${var.dkim_selector}._domainkey.${var.domain_name}"
  type    = "TXT"
  ttl     = 3600

  records = [
    "v=DKIM1; k=rsa; p=${var.dkim_public_key}"
  ]
}

# DMARC Record
resource "aws_route53_record" "dmarc" {
  count   = var.zone_id != "" && var.enable_dmarc ? 1 : 0
  zone_id = var.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 3600

  records = [
    "v=DMARC1; p=quarantine; rua=mailto:dmarc@enterprise-email.com; ruf=mailto:dmarc@enterprise-email.com; fo=1"
  ]
}

# Domain Verification Record (for ownership verification)
resource "aws_route53_record" "verification" {
  count   = var.zone_id != "" ? 1 : 0
  zone_id = var.zone_id
  name    = "_mail-verification.${var.domain_name}"
  type    = "TXT"
  ttl     = 300

  records = [
    "mail-verification=${md5(var.domain_name)}"
  ]
}

# Webmail CNAME
resource "aws_route53_record" "webmail" {
  count   = var.zone_id != "" && !var.is_primary ? 1 : 0
  zone_id = var.zone_id
  name    = "webmail.${var.domain_name}"
  type    = "CNAME"
  ttl     = 3600
  records = ["webmail.enterprise-email.com"]
}

# Outputs
output "mx_records" {
  value = var.zone_id != "" ? aws_route53_record.mx[0].records : []
}

output "verification_token" {
  value = md5(var.domain_name)
}

output "nameservers" {
  value = var.zone_id != "" ? data.aws_route53_zone.domain[0].name_servers : []
}
