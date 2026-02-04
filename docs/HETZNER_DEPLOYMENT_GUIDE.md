# OONRUMAIL - Hetzner Deployment Guide

**Last Updated:** February 4, 2026
**Target Budget:** ~$80-100/month

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Hetzner Account Setup](#2-hetzner-account-setup)
3. [Server Provisioning](#3-server-provisioning)
4. [Initial Server Setup](#4-initial-server-setup)
5. [Install Docker & Dependencies](#5-install-docker--dependencies)
6. [Configure Firewall](#6-configure-firewall)
7. [Setup DNS with Cloudflare](#7-setup-dns-with-cloudflare)
8. [SSL Certificates](#8-ssl-certificates)
9. [PostgreSQL Setup](#9-postgresql-setup)
10. [Deploy OONRUMAIL](#10-deploy-oonrumail)
11. [Configure Email DNS Records](#11-configure-email-dns-records)
12. [Verify Deployment](#12-verify-deployment)
13. [Monitoring & Maintenance](#13-monitoring--maintenance)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

### Required Before Starting

- [ ] Domain name (e.g., `oonrumail.com` or your custom domain)
- [ ] Hetzner account with payment method
- [ ] Cloudflare account (free tier is fine)
- [ ] SSH key pair generated on your local machine
- [ ] Basic knowledge of Linux command line

### Generate SSH Key (if you don't have one)

```powershell
# On Windows PowerShell
ssh-keygen -t ed25519 -C "your-email@example.com"

# Your public key will be at: C:\Users\YourName\.ssh\id_ed25519.pub
Get-Content ~/.ssh/id_ed25519.pub
```

---

## 2. Hetzner Account Setup

### 2.1 Create Account

1. Go to [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Click "Register" and create an account
3. Verify your email
4. Add payment method (credit card or PayPal)
5. You may need to verify identity (takes 1-24 hours)

### 2.2 Create a Project

1. Log into [Hetzner Cloud Console](https://console.hetzner.cloud)
2. Click "New Project"
3. Name it: `oonrumail-production`
4. Click "Add Project"

### 2.3 Add Your SSH Key

1. In your project, go to **Security** → **SSH Keys**
2. Click "Add SSH Key"
3. Paste your public key from `~/.ssh/id_ed25519.pub`
4. Name it: `my-deployment-key`

---

## 3. Server Provisioning

### 3.1 Recommended Server Setup

| Server | Type | Specs | Purpose | Cost |
|--------|------|-------|---------|------|
| **Main App** | CPX41 | 8 vCPU, 16GB RAM, 240GB SSD | All services | €28/mo |
| **Floating IP** | IPv4 | Static IP | Mail server identity | €4/mo |

**Total: ~€32/month (~$35 USD)**

### 3.2 Create Main Server

1. In Hetzner Console, click **Servers** → **Add Server**

2. Configure:
   ```
   Location:        Nuremberg (nbg1) or Falkenstein (fsn1)
   Image:           Ubuntu 24.04
   Type:            CPX41 (8 vCPU, 16GB RAM, 240GB SSD)
   Networking:      Public IPv4 ✓, Public IPv6 ✓
   SSH Keys:        Select your key
   Volumes:         None (we'll add later if needed)
   Firewalls:       Skip (we'll configure later)
   Backups:         Enable (€5.60/mo) - RECOMMENDED
   Name:            oonrumail-main
   ```

3. Click **Create & Buy Now**

4. Note the **IP address** once created

### 3.3 Create Floating IP (Critical for Email!)

1. Go to **Networking** → **Floating IPs**
2. Click **Add Floating IP**
3. Configure:
   ```
   Location:     Same as your server (nbg1 or fsn1)
   Protocol:     IPv4
   Description:  oonrumail-mail-ip
   ```
4. Click **Add Floating IP**
5. **Assign to server**: Click the floating IP → **Assign** → Select `oonrumail-main`
6. **Note this IP** - This will be your mail server's identity

### 3.4 Configure Reverse DNS (PTR Record)

**Critical for email deliverability!**

1. Click on your **Floating IP**
2. Click **Edit Reverse DNS**
3. Set: `mail.yourdomain.com` (replace with your actual domain)
4. Save

---

## 4. Initial Server Setup

### 4.1 Connect to Server

```bash
ssh root@YOUR_SERVER_IP
```

### 4.2 Update System

```bash
# Update packages
apt update && apt upgrade -y

# Install essential tools
apt install -y \
  curl \
  wget \
  git \
  vim \
  htop \
  ncdu \
  unzip \
  fail2ban \
  ufw \
  certbot \
  net-tools \
  dnsutils
```

### 4.3 Create Deploy User

```bash
# Create user
adduser deploy
usermod -aG sudo deploy

# Setup SSH for deploy user
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Test login (from another terminal)
# ssh deploy@YOUR_SERVER_IP
```

### 4.4 Configure Floating IP on Server

```bash
# Check your floating IP
ip addr show

# Create netplan config for floating IP
cat > /etc/netplan/60-floating-ip.yaml << 'EOF'
network:
  version: 2
  ethernets:
    eth0:
      addresses:
        - YOUR_FLOATING_IP/32
EOF

# Replace YOUR_FLOATING_IP with actual IP
nano /etc/netplan/60-floating-ip.yaml

# Apply
netplan apply

# Verify
ip addr show eth0
```

### 4.5 Set Hostname

```bash
hostnamectl set-hostname mail.yourdomain.com
echo "YOUR_FLOATING_IP mail.yourdomain.com mail" >> /etc/hosts
```

---

## 5. Install Docker & Dependencies

### 5.1 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add deploy user to docker group
usermod -aG docker deploy

# Enable Docker to start on boot
systemctl enable docker
systemctl start docker

# Verify
docker --version
docker compose version
```

### 5.2 Install Node.js (for build tools)

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Verify
node --version
pnpm --version
```

---

## 6. Configure Firewall

### 6.1 Setup UFW

```bash
# Reset UFW
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# SSH (important - don't lock yourself out!)
ufw allow 22/tcp

# HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# SMTP
ufw allow 25/tcp    # SMTP
ufw allow 465/tcp   # SMTPS
ufw allow 587/tcp   # Submission

# IMAP
ufw allow 143/tcp   # IMAP
ufw allow 993/tcp   # IMAPS

# Enable firewall
ufw enable

# Check status
ufw status verbose
```

### 6.2 Configure fail2ban

```bash
# Create jail config
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[postfix]
enabled = true
port = smtp,465,submission
filter = postfix
logpath = /var/log/mail.log
maxretry = 5
EOF

# Restart fail2ban
systemctl restart fail2ban
systemctl enable fail2ban
```

---

## 7. Setup DNS with Cloudflare

### 7.1 Add Domain to Cloudflare

1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Click "Add Site" → Enter your domain
3. Select **Free** plan
4. Cloudflare will scan existing DNS records
5. Update your domain's nameservers at your registrar to Cloudflare's

### 7.2 Configure DNS Records

Add these records in Cloudflare DNS:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| A | @ | YOUR_SERVER_IP | ✅ Proxied | Auto |
| A | www | YOUR_SERVER_IP | ✅ Proxied | Auto |
| A | mail | YOUR_FLOATING_IP | ❌ DNS only | Auto |
| A | smtp | YOUR_FLOATING_IP | ❌ DNS only | Auto |
| A | imap | YOUR_FLOATING_IP | ❌ DNS only | Auto |
| A | admin | YOUR_SERVER_IP | ✅ Proxied | Auto |
| A | api | YOUR_SERVER_IP | ✅ Proxied | Auto |
| CNAME | webmail | @ | ✅ Proxied | Auto |

**Important:** Mail-related records (mail, smtp, imap) MUST be "DNS only" (grey cloud), not proxied!

### 7.3 Cloudflare SSL Settings

1. Go to **SSL/TLS** → **Overview**
2. Set mode to **Full (strict)**
3. Go to **Edge Certificates**
4. Enable **Always Use HTTPS**
5. Enable **Automatic HTTPS Rewrites**

---

## 8. SSL Certificates

### 8.1 Install Certbot with Cloudflare Plugin

```bash
apt install -y certbot python3-certbot-dns-cloudflare
```

### 8.2 Create Cloudflare API Token

1. Go to Cloudflare → **My Profile** → **API Tokens**
2. Click **Create Token**
3. Use template: **Edit zone DNS**
4. Configure:
   - Zone Resources: Include → Specific zone → your domain
5. Create and copy the token

### 8.3 Configure Certbot

```bash
# Create credentials file
mkdir -p /root/.secrets
cat > /root/.secrets/cloudflare.ini << 'EOF'
dns_cloudflare_api_token = YOUR_CLOUDFLARE_API_TOKEN
EOF

chmod 600 /root/.secrets/cloudflare.ini
```

### 8.4 Obtain Certificates

```bash
# Get wildcard certificate
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d yourdomain.com \
  -d "*.yourdomain.com" \
  --email admin@yourdomain.com \
  --agree-tos \
  --non-interactive

# Verify
ls -la /etc/letsencrypt/live/yourdomain.com/
```

### 8.5 Setup Auto-Renewal

```bash
# Test renewal
certbot renew --dry-run

# Certbot auto-renewal is already configured via systemd timer
systemctl status certbot.timer
```

---

## 9. PostgreSQL Setup

### 9.1 Create Data Directory

```bash
mkdir -p /opt/oonrumail/data/postgres
mkdir -p /opt/oonrumail/data/redis
mkdir -p /opt/oonrumail/data/minio
mkdir -p /opt/oonrumail/backups
chown -R deploy:deploy /opt/oonrumail
```

### 9.2 Create Docker Network

```bash
docker network create oonrumail-network
```

### 9.3 Start PostgreSQL

```bash
# Create postgres container
docker run -d \
  --name oonrumail-postgres \
  --network oonrumail-network \
  --restart unless-stopped \
  -e POSTGRES_USER=oonrumail \
  -e POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD \
  -e POSTGRES_DB=oonrumail \
  -v /opt/oonrumail/data/postgres:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  postgres:16-alpine

# Wait for startup
sleep 10

# Verify
docker logs oonrumail-postgres
docker exec oonrumail-postgres pg_isready
```

### 9.4 Start Redis

```bash
docker run -d \
  --name oonrumail-redis \
  --network oonrumail-network \
  --restart unless-stopped \
  -v /opt/oonrumail/data/redis:/data \
  -p 127.0.0.1:6379:6379 \
  redis:7-alpine \
  redis-server --appendonly yes --requirepass YOUR_REDIS_PASSWORD

# Verify
docker logs oonrumail-redis
```

---

## 10. Deploy OONRUMAIL

### 10.1 Clone Repository

```bash
su - deploy
cd /opt/oonrumail

git clone https://github.com/artpromedia/email.git app
cd app
```

### 10.2 Create Production Environment File

```bash
cat > .env.production << 'EOF'
# ===========================================
# OONRUMAIL Production Configuration
# ===========================================

# Node Environment
NODE_ENV=production

# Domain Configuration
PRIMARY_DOMAIN=yourdomain.com
APP_URL=https://yourdomain.com
ADMIN_URL=https://admin.yourdomain.com
API_URL=https://api.yourdomain.com

# Database
DATABASE_URL=postgresql://oonrumail:YOUR_SECURE_PASSWORD@oonrumail-postgres:5432/oonrumail?sslmode=disable
POSTGRES_USER=oonrumail
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD
POSTGRES_DB=oonrumail

# Redis
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@oonrumail-redis:6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD

# JWT Secrets (generate with: openssl rand -base64 32)
JWT_SECRET=GENERATE_ME
JWT_REFRESH_SECRET=GENERATE_ME_TOO

# DKIM
DKIM_SELECTOR=mail
DKIM_PRIVATE_KEY_PATH=/etc/dkim/private.key

# SMTP Configuration
SMTP_HOST=0.0.0.0
SMTP_PORT=25
SMTP_SUBMISSION_PORT=587
SMTP_HOSTNAME=mail.yourdomain.com

# IMAP Configuration
IMAP_HOST=0.0.0.0
IMAP_PORT=143
IMAP_TLS_PORT=993

# Storage (MinIO/S3)
S3_ENDPOINT=http://oonrumail-minio:9000
S3_ACCESS_KEY=YOUR_MINIO_ACCESS_KEY
S3_SECRET_KEY=YOUR_MINIO_SECRET_KEY
S3_BUCKET=attachments
S3_REGION=us-east-1

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
EOF

# Generate secrets
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 32)"
```

### 10.3 Generate DKIM Keys

```bash
mkdir -p /opt/oonrumail/dkim

# Generate 2048-bit RSA key
openssl genrsa -out /opt/oonrumail/dkim/private.key 2048

# Extract public key
openssl rsa -in /opt/oonrumail/dkim/private.key -pubout -out /opt/oonrumail/dkim/public.key

# Generate DNS record format
echo "DKIM DNS Record (add to Cloudflare):"
echo "mail._domainkey.yourdomain.com TXT"
openssl rsa -in /opt/oonrumail/dkim/private.key -pubout -outform PEM 2>/dev/null | \
  grep -v "PUBLIC KEY" | tr -d '\n' | \
  awk '{print "v=DKIM1; k=rsa; p=" $0}'

# Set permissions
chmod 600 /opt/oonrumail/dkim/private.key
chown deploy:deploy /opt/oonrumail/dkim/*
```

### 10.4 Create Production Docker Compose

```bash
cat > /opt/oonrumail/app/docker-compose.prod.yml << 'EOF'
version: '3.8'

services:
  # =========================================
  # WEB APPLICATION
  # =========================================
  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    container_name: oonrumail-web
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    networks:
      - oonrumail-network
    depends_on:
      - auth
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.web.rule=Host(`${PRIMARY_DOMAIN}`) || Host(`www.${PRIMARY_DOMAIN}`) || Host(`webmail.${PRIMARY_DOMAIN}`)"
      - "traefik.http.routers.web.tls=true"
      - "traefik.http.services.web.loadbalancer.server.port=3000"

  # =========================================
  # ADMIN DASHBOARD
  # =========================================
  admin:
    build:
      context: ./apps/admin
      dockerfile: Dockerfile
    container_name: oonrumail-admin
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
    networks:
      - oonrumail-network
    depends_on:
      - auth
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.admin.rule=Host(`admin.${PRIMARY_DOMAIN}`)"
      - "traefik.http.routers.admin.tls=true"
      - "traefik.http.services.admin.loadbalancer.server.port=3001"

  # =========================================
  # AUTH SERVICE
  # =========================================
  auth:
    build:
      context: ./services/auth
      dockerfile: Dockerfile
    container_name: oonrumail-auth
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
    networks:
      - oonrumail-network

  # =========================================
  # SMTP SERVER
  # =========================================
  smtp-server:
    build:
      context: ./services/smtp-server
      dockerfile: Dockerfile
    container_name: oonrumail-smtp
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - SMTP_HOSTNAME=${SMTP_HOSTNAME}
      - DKIM_SELECTOR=${DKIM_SELECTOR}
      - DKIM_PRIVATE_KEY_PATH=/etc/dkim/private.key
    ports:
      - "25:25"
      - "587:587"
      - "465:465"
    volumes:
      - /opt/oonrumail/dkim:/etc/dkim:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    networks:
      - oonrumail-network

  # =========================================
  # IMAP SERVER
  # =========================================
  imap-server:
    build:
      context: ./services/imap-server
      dockerfile: Dockerfile
    container_name: oonrumail-imap
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    ports:
      - "143:143"
      - "993:993"
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
    networks:
      - oonrumail-network

  # =========================================
  # DOMAIN MANAGER
  # =========================================
  domain-manager:
    build:
      context: ./services/domain-manager
      dockerfile: Dockerfile
    container_name: oonrumail-domain-manager
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    networks:
      - oonrumail-network

  # =========================================
  # STORAGE SERVICE
  # =========================================
  storage:
    build:
      context: ./services/storage
      dockerfile: Dockerfile
    container_name: oonrumail-storage
    restart: unless-stopped
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - S3_ENDPOINT=${S3_ENDPOINT}
      - S3_ACCESS_KEY=${S3_ACCESS_KEY}
      - S3_SECRET_KEY=${S3_SECRET_KEY}
      - S3_BUCKET=${S3_BUCKET}
    networks:
      - oonrumail-network

  # =========================================
  # MINIO (S3 Storage)
  # =========================================
  minio:
    image: minio/minio:latest
    container_name: oonrumail-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=${S3_ACCESS_KEY}
      - MINIO_ROOT_PASSWORD=${S3_SECRET_KEY}
    volumes:
      - /opt/oonrumail/data/minio:/data
    networks:
      - oonrumail-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.minio-console.rule=Host(`storage.${PRIMARY_DOMAIN}`)"
      - "traefik.http.routers.minio-console.tls=true"
      - "traefik.http.services.minio-console.loadbalancer.server.port=9001"

  # =========================================
  # TRAEFIK (Reverse Proxy)
  # =========================================
  traefik:
    image: traefik:v3.0
    container_name: oonrumail-traefik
    restart: unless-stopped
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@${PRIMARY_DOMAIN}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /opt/oonrumail/traefik:/letsencrypt
      - /etc/letsencrypt:/etc/letsencrypt:ro
    networks:
      - oonrumail-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`traefik.${PRIMARY_DOMAIN}`)"
      - "traefik.http.routers.dashboard.tls=true"
      - "traefik.http.routers.dashboard.service=api@internal"
      - "traefik.http.routers.dashboard.middlewares=auth"
      - "traefik.http.middlewares.auth.basicauth.users=admin:$$apr1$$xyz..."

networks:
  oonrumail-network:
    external: true
EOF
```

### 10.5 Build and Deploy

```bash
cd /opt/oonrumail/app

# Copy env file
cp .env.production .env

# Build all images
docker compose -f docker-compose.prod.yml build

# Start services
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

---

## 11. Configure Email DNS Records

### 11.1 Add Email DNS Records in Cloudflare

| Type | Name | Content | TTL |
|------|------|---------|-----|
| MX | @ | mail.yourdomain.com | Auto |
| TXT | @ | `v=spf1 ip4:YOUR_FLOATING_IP mx ~all` | Auto |
| TXT | mail._domainkey | `v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY` | Auto |
| TXT | _dmarc | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com` | Auto |

### 11.2 Verify DNS Records

```bash
# Check MX record
dig MX yourdomain.com +short

# Check SPF
dig TXT yourdomain.com +short

# Check DKIM
dig TXT mail._domainkey.yourdomain.com +short

# Check DMARC
dig TXT _dmarc.yourdomain.com +short
```

---

## 12. Verify Deployment

### 12.1 Test Web Interface

```bash
# Test main site
curl -I https://yourdomain.com

# Test admin
curl -I https://admin.yourdomain.com
```

### 12.2 Test SMTP

```bash
# Test SMTP connection
openssl s_client -connect mail.yourdomain.com:587 -starttls smtp

# Test SMTPS
openssl s_client -connect mail.yourdomain.com:465
```

### 12.3 Test IMAP

```bash
# Test IMAPS
openssl s_client -connect mail.yourdomain.com:993
```

### 12.4 Test Email Deliverability

1. Go to [mail-tester.com](https://www.mail-tester.com)
2. Send a test email to the provided address
3. Check your score (aim for 9+/10)

### 12.5 Check IP Reputation

```bash
# Check if your IP is blacklisted
# Visit: https://mxtoolbox.com/blacklists.aspx
# Enter your floating IP
```

---

## 13. Monitoring & Maintenance

### 13.1 Setup Log Rotation

```bash
cat > /etc/logrotate.d/oonrumail << 'EOF'
/opt/oonrumail/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 deploy deploy
    sharedscripts
    postrotate
        docker kill -s HUP oonrumail-smtp oonrumail-imap 2>/dev/null || true
    endscript
}
EOF
```

### 13.2 Automated Backups

```bash
cat > /opt/oonrumail/scripts/backup.sh << 'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/opt/oonrumail/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup PostgreSQL
docker exec oonrumail-postgres pg_dump -U oonrumail oonrumail | gzip > "$BACKUP_DIR/postgres_$DATE.sql.gz"

# Backup DKIM keys
tar -czf "$BACKUP_DIR/dkim_$DATE.tar.gz" /opt/oonrumail/dkim/

# Keep only last 7 days
find "$BACKUP_DIR" -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /opt/oonrumail/scripts/backup.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/oonrumail/scripts/backup.sh >> /var/log/oonrumail-backup.log 2>&1") | crontab -
```

### 13.3 Health Check Script

```bash
cat > /opt/oonrumail/scripts/health-check.sh << 'EOF'
#!/bin/bash

echo "=== OONRUMAIL Health Check ==="
echo "Date: $(date)"
echo ""

# Check containers
echo "Container Status:"
docker ps --filter "name=oonrumail" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""

# Check disk space
echo "Disk Usage:"
df -h / /opt/oonrumail

echo ""

# Check memory
echo "Memory Usage:"
free -h

echo ""

# Check ports
echo "Port Status:"
netstat -tlnp | grep -E ':(25|587|465|143|993|80|443) '

echo ""

# Test SMTP
echo "SMTP Test:"
echo "QUIT" | timeout 5 openssl s_client -connect localhost:587 -starttls smtp 2>/dev/null | head -5

echo ""
echo "=== Health Check Complete ==="
EOF

chmod +x /opt/oonrumail/scripts/health-check.sh
```

### 13.4 Update Procedure

```bash
cat > /opt/oonrumail/scripts/update.sh << 'EOF'
#!/bin/bash
set -e

cd /opt/oonrumail/app

echo "=== OONRUMAIL Update ==="

# Pull latest code
git pull origin main

# Backup before update
/opt/oonrumail/scripts/backup.sh

# Rebuild and restart
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

echo "Update complete!"
EOF

chmod +x /opt/oonrumail/scripts/update.sh
```

---

## 14. Troubleshooting

### Common Issues

#### Email Not Sending

```bash
# Check SMTP logs
docker logs oonrumail-smtp --tail 100

# Check if port 25 is open
nc -zv mail.yourdomain.com 25

# Check PTR record
dig -x YOUR_FLOATING_IP
```

#### SSL Certificate Issues

```bash
# Renew certificates
certbot renew --force-renewal

# Restart services
docker compose -f docker-compose.prod.yml restart
```

#### Database Connection Issues

```bash
# Check PostgreSQL
docker logs oonrumail-postgres
docker exec oonrumail-postgres pg_isready

# Test connection
docker exec -it oonrumail-postgres psql -U oonrumail -d oonrumail -c "SELECT 1"
```

#### Container Won't Start

```bash
# Check logs
docker logs <container-name>

# Check resources
docker stats --no-stream

# Restart all
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### Useful Commands

```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f

# Restart specific service
docker compose -f docker-compose.prod.yml restart smtp-server

# Enter container shell
docker exec -it oonrumail-smtp /bin/sh

# Check network
docker network inspect oonrumail-network

# Cleanup unused resources
docker system prune -a
```

---

## Cost Summary

| Resource | Monthly Cost |
|----------|-------------|
| CPX41 Server (8 vCPU, 16GB) | €28 (~$31) |
| Floating IP | €4 (~$4) |
| Backups (20% of server) | €5.60 (~$6) |
| **Total** | **~€37.60 (~$42)** |

**You're well under your $150 budget with room to scale!**

---

## Next Steps

1. [ ] Complete initial deployment
2. [ ] Send test emails and verify deliverability
3. [ ] Configure your first domain
4. [ ] Create admin user
5. [ ] Setup monitoring alerts
6. [ ] Warm up IP (start with low volume)
7. [ ] Document any custom configurations

---

## Support

- **Hetzner Status**: [status.hetzner.com](https://status.hetzner.com)
- **Cloudflare Status**: [cloudflarestatus.com](https://www.cloudflarestatus.com)
- **Mail Testing**: [mail-tester.com](https://www.mail-tester.com)
- **Blacklist Check**: [mxtoolbox.com/blacklists.aspx](https://mxtoolbox.com/blacklists.aspx)

---

*Document created for OONRUMAIL deployment on Hetzner Cloud*
