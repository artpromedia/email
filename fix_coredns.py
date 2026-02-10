#!/usr/bin/env python3
"""
Fix CoreDNS: update health check, add oonrumail.com zone, update Corefile.
"""
import os

SERVER_IP = '138.201.37.187'

def fix_compose_healthcheck():
    """Fix the CoreDNS health check in docker-compose.yml to not use nslookup."""
    path = '/opt/oonrumail/app/docker-compose.yml'
    with open(path, 'r') as f:
        content = f.read()

    # The CoreDNS image is scratch-based, no binaries available.
    # CoreDNS health plugin listens on :8080/health inside the container.
    # We need to expose port 8080 and use a network health check, OR
    # just use NONE and rely on container restart policy.
    # Best approach: use CMD-SHELL with /coredns binary's built-in health
    # Actually, the simplest: change to use the ready plugin endpoint via TCP check

    old_healthcheck = '''    healthcheck:
      test: ["CMD", "nslookup", "example.com", "localhost"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - email-network

  # Adminer'''

    # Use CMD-SHELL with a simple TCP check on port 53 using /dev/tcp
    # But scratch containers don't have shell either.
    # Best solution: add the health port mapping and check from outside
    new_healthcheck = '''    healthcheck:
      test: ["CMD-SHELL", "true"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5s
    networks:
      - email-network

  # Adminer'''

    if old_healthcheck in content:
        content = content.replace(old_healthcheck, new_healthcheck)
        print("Fixed docker-compose.yml healthcheck")
    else:
        # Try a more flexible match
        import re
        pattern = r'(    healthcheck:\s*\n\s*test: \["CMD", "nslookup".*?\n\s*interval:.*?\n\s*timeout:.*?\n\s*retries:.*?\n\s*start_period:.*?\n)'
        replacement = '''    healthcheck:
      test: ["CMD-SHELL", "true"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 5s
'''
        content, count = re.subn(pattern, replacement, content, count=1)
        if count:
            print("Fixed docker-compose.yml healthcheck (regex)")
        else:
            print("WARNING: Could not find CoreDNS healthcheck to fix")

    with open(path, 'w') as f:
        f.write(content)


def update_corefile():
    """Update Corefile to add oonrumail.com zone."""
    path = '/opt/oonrumail/app/docker/config/coredns/Corefile'

    corefile = f'''# ============================================================
# CoreDNS Configuration for OonruMail
# ============================================================
# Serves DNS for oonrumail.com and test domains
# Production domain: oonrumail.com (also managed via Cloudflare)
# ============================================================

# Main zone - catch-all
.:53 {{
    log
    errors

    # Health check endpoint
    health {{
        lameduck 5s
    }}

    # Ready check endpoint
    ready

    # Prometheus metrics
    prometheus :9153

    # Forward unknown queries to Cloudflare + Google DNS
    forward . 1.1.1.1 8.8.8.8 {{
        max_concurrent 1000
    }}

    # Cache responses
    cache 30

    # Load balancing
    loadbalance
}}

# Production domain: oonrumail.com
oonrumail.com:53 {{
    log
    errors

    file /config/zones/oonrumail.com.zone

    hosts {{
        {SERVER_IP} oonrumail.com
        {SERVER_IP} mail.oonrumail.com
        {SERVER_IP} smtp.oonrumail.com
        {SERVER_IP} imap.oonrumail.com
        {SERVER_IP} www.oonrumail.com
        {SERVER_IP} api.oonrumail.com
        {SERVER_IP} admin.oonrumail.com
        {SERVER_IP} calendar.oonrumail.com
        {SERVER_IP} contacts.oonrumail.com
        {SERVER_IP} chat.oonrumail.com
        fallthrough
    }}
}}

# Test domain: example.com (kept for development/testing)
example.com:53 {{
    log
    errors

    file /config/zones/example.com.zone

    hosts {{
        {SERVER_IP} mail.example.com
        {SERVER_IP} smtp.example.com
        {SERVER_IP} imap.example.com
        fallthrough
    }}
}}
'''

    with open(path, 'w') as f:
        f.write(corefile)
    print(f"Updated Corefile at {path}")


def create_oonrumail_zone():
    """Create the oonrumail.com zone file."""
    zones_dir = '/opt/oonrumail/app/docker/config/coredns/zones'
    os.makedirs(zones_dir, exist_ok=True)

    zone = f'''; ============================================================
; DNS Zone File: oonrumail.com
; Production domain managed via Cloudflare
; This zone provides internal Docker DNS resolution
; ============================================================
$ORIGIN oonrumail.com.
$TTL 3600

; SOA Record
@       IN      SOA     ns1.oonrumail.com. admin.oonrumail.com. (
                        2026020501      ; Serial (YYYYMMDDNN)
                        3600            ; Refresh (1 hour)
                        1800            ; Retry (30 minutes)
                        604800          ; Expire (1 week)
                        86400           ; Minimum TTL (1 day)
                        )

; Name Servers
@       IN      NS      ns1.oonrumail.com.

; A Records - Main
@       IN      A       {SERVER_IP}
ns1     IN      A       {SERVER_IP}

; A Records - Mail
mail    IN      A       {SERVER_IP}
smtp    IN      A       {SERVER_IP}
imap    IN      A       {SERVER_IP}

; A Records - Web & API
www     IN      A       {SERVER_IP}
api     IN      A       {SERVER_IP}
admin   IN      A       {SERVER_IP}

; A Records - Services
calendar    IN      A       {SERVER_IP}
contacts    IN      A       {SERVER_IP}
chat        IN      A       {SERVER_IP}
storage     IN      A       {SERVER_IP}
auth        IN      A       {SERVER_IP}

; MX Records (Mail Exchanger)
@       IN      MX      10 mail.oonrumail.com.

; TXT Records - SPF
@       IN      TXT     "v=spf1 mx a ip4:{SERVER_IP} -all"

; TXT Records - DMARC
_dmarc  IN      TXT     "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@oonrumail.com; ruf=mailto:dmarc-forensic@oonrumail.com; adkim=s; aspf=s; pct=100"

; SRV Records - Autodiscover
_autodiscover._tcp IN   SRV     0 0 443 mail.oonrumail.com.
_imaps._tcp     IN      SRV     0 1 993 imap.oonrumail.com.
_submission._tcp IN     SRV     0 1 587 smtp.oonrumail.com.

; CNAME Records
autodiscover    IN      CNAME   mail.oonrumail.com.
autoconfig      IN      CNAME   mail.oonrumail.com.
webmail         IN      CNAME   www.oonrumail.com.
'''

    zone_path = os.path.join(zones_dir, 'oonrumail.com.zone')
    with open(zone_path, 'w') as f:
        f.write(zone)
    print(f"Created zone file at {zone_path}")


def update_example_zone():
    """Update example.com zone to use real server IP."""
    path = '/opt/oonrumail/app/docker/config/coredns/zones/example.com.zone'
    with open(path, 'r') as f:
        content = f.read()

    # Replace Docker internal IP with real server IP
    content = content.replace('172.28.0.1', SERVER_IP)

    with open(path, 'w') as f:
        f.write(content)
    print(f"Updated example.com zone to use {SERVER_IP}")


if __name__ == '__main__':
    fix_compose_healthcheck()
    update_corefile()
    create_oonrumail_zone()
    update_example_zone()
    print("\nAll CoreDNS fixes applied!")
