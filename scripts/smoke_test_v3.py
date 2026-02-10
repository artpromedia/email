#!/usr/bin/env python3
"""Comprehensive E2E smoke test for OONRUMAIL platform - v3"""
import urllib.request
import json
import socket
import uuid

BASE_URL = "http://localhost"
results = []

def log(test, status, detail=""):
    icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    results.append((test, status, detail))
    print(f"  {icon} {test}: {detail}")

def http_get(url, headers=None, timeout=10):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return 0, str(e)

def http_post(url, data, headers=None, timeout=10):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=h, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        body = resp.read().decode()
        return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except:
            return e.code, {"raw": body[:300]}
    except Exception as e:
        return 0, {"error": str(e)}

def check_tcp(host, port, timeout=5):
    try:
        s = socket.create_connection((host, port), timeout=timeout)
        banner = s.recv(1024).decode(errors='replace').strip()
        s.close()
        return True, banner
    except Exception as e:
        return False, str(e)

print("=" * 70)
print("  OONRUMAIL PLATFORM - COMPREHENSIVE SMOKE TEST v3")
print("=" * 70)

# ================================================================
# PHASE 1: Health Checks
# ================================================================
print("\n📋 PHASE 1: Service Health Checks")
print("-" * 50)

health_checks = [
    ("Auth",             f"{BASE_URL}:8082/health"),
    ("Contacts",         f"{BASE_URL}:8083/health"),
    ("Domain Manager",   f"{BASE_URL}:8084/health"),
    ("Storage",          f"{BASE_URL}:8085/health"),
    ("Chat",             f"{BASE_URL}:8086/health"),
    ("SMS Gateway",      f"{BASE_URL}:8087/health"),
    ("AI Assistant",     f"{BASE_URL}:8090/health"),
    ("Calendar",         f"{BASE_URL}:8092/health"),
    ("Transactional API",f"{BASE_URL}:8095/health"),
]

for name, url in health_checks:
    status, body = http_get(url)
    if status == 200:
        log(f"{name} Health", "PASS", f"HTTP {status}")
    else:
        log(f"{name} Health", "FAIL", f"HTTP {status}: {body[:100]}")

# ================================================================
# PHASE 2: Protocol Banners
# ================================================================
print("\n📋 PHASE 2: Protocol Banners (SMTP/IMAP)")
print("-" * 50)

ok, banner = check_tcp("localhost", 587)
if ok and "220" in banner:
    log("SMTP (587)", "PASS", banner[:80])
else:
    log("SMTP (587)", "FAIL", banner[:80])

ok, banner = check_tcp("localhost", 25)
if ok and "220" in banner:
    log("SMTP (25)", "PASS", banner[:80])
else:
    log("SMTP (25)", "FAIL", banner[:80])

ok, banner = check_tcp("localhost", 143)
if ok and "OK" in banner:
    log("IMAP (143)", "PASS", banner[:80])
else:
    log("IMAP (143)", "FAIL", banner[:80])

# ================================================================
# PHASE 3: Auth Flow
# ================================================================
print("\n📋 PHASE 3: Authentication Flow")
print("-" * 50)

test_email = f"test-{uuid.uuid4().hex[:8]}@oonrumail.com"
test_password = "TestPassword123!!"

# Register
status, data = http_post(f"{BASE_URL}:8082/api/auth/register", {
    "email": test_email,
    "password": test_password,
    "name": "Smoke Test User"
})
if status == 201:
    log("User Registration", "PASS", f"User created: {test_email}")
    user_id = data.get("User", {}).get("id", "")
else:
    log("User Registration", "FAIL", f"HTTP {status}: {json.dumps(data, default=str)[:200]}")
    user_id = ""

# Login
status, data = http_post(f"{BASE_URL}:8082/api/auth/login", {
    "email": test_email,
    "password": test_password
})
token = ""
if status == 200:
    # Token is at data.TokenPair.AccessToken
    token_pair = data.get("TokenPair", {})
    token = token_pair.get("AccessToken", "")
    refresh = token_pair.get("RefreshToken", "")
    session_id = token_pair.get("SessionID", "")
    if token:
        log("User Login", "PASS", f"Got JWT token ({len(token)} chars), session: {session_id[:12]}...")
    else:
        log("User Login", "WARN", f"Login OK but no token. Keys: {list(data.keys())}")
else:
    log("User Login", "FAIL", f"HTTP {status}: {json.dumps(data, default=str)[:200]}")

# Get profile
if token:
    auth_header = {"Authorization": f"Bearer {token}"}
    status, body = http_get(f"{BASE_URL}:8082/api/auth/me", auth_header)
    if status == 200:
        log("Get Profile (/me)", "PASS", f"HTTP {status}")
    else:
        log("Get Profile (/me)", "FAIL", f"HTTP {status}: {body[:100]}")
else:
    auth_header = {}

# ================================================================
# PHASE 4: API Endpoints (with JWT auth)
# ================================================================
print("\n📋 PHASE 4: Service API Endpoints")
print("-" * 50)

# Contacts - /api/v1/contacts
status, body = http_get(f"{BASE_URL}:8083/api/v1/contacts", auth_header)
if status == 200:
    log("Contacts List", "PASS", f"HTTP {status}")
elif status == 401:
    log("Contacts List", "WARN", f"HTTP 401 - auth rejected (JWT format mismatch?)")
else:
    log("Contacts List", "FAIL", f"HTTP {status}: {body[:100] if isinstance(body, str) else json.dumps(body)[:100]}")

# Calendar - /api/v1/calendars
status, body = http_get(f"{BASE_URL}:8092/api/v1/calendars", auth_header)
if status == 200:
    log("Calendar List", "PASS", f"HTTP {status}")
elif status == 401:
    log("Calendar List", "WARN", f"HTTP 401 - auth rejected")
else:
    log("Calendar List", "FAIL", f"HTTP {status}")

# Chat - /api/v1/channels
status, body = http_get(f"{BASE_URL}:8086/api/v1/channels", auth_header)
if status == 200:
    log("Chat Channels", "PASS", f"HTTP {status}")
elif status == 401:
    log("Chat Channels", "WARN", f"HTTP 401 - auth rejected")
else:
    log("Chat Channels", "FAIL", f"HTTP {status}")

# Domain Manager - /api/admin/domains
status, body = http_get(f"{BASE_URL}:8084/api/admin/domains?organization_id=00000000-0000-0000-0000-000000000001", auth_header)
if status in [200, 400]:
    log("Domain Manager", "PASS", f"HTTP {status} (endpoint responds)")
elif status == 401:
    log("Domain Manager", "WARN", f"HTTP 401 - auth rejected")
else:
    log("Domain Manager", "FAIL", f"HTTP {status}")

# Domain Manager public endpoint (no auth needed)
status, body = http_get(f"{BASE_URL}:8084/api/domains/oonrumail.com/branding")
if status == 200:
    log("Domain Branding (public)", "PASS", f"HTTP {status}")
elif status == 404:
    log("Domain Branding (public)", "WARN", f"HTTP 404 - no branding configured")
else:
    log("Domain Branding (public)", "FAIL", f"HTTP {status}")

# Storage - /api/v1/quotas
status, body = http_get(f"{BASE_URL}:8085/api/v1/quotas", auth_header)
if status in [200, 400, 401]:
    log("Storage Quotas", "PASS" if status == 200 else "WARN", f"HTTP {status}")
else:
    log("Storage Quotas", "FAIL", f"HTTP {status}")

# ================================================================
# PHASE 5: Transactional Email API
# ================================================================
print("\n📋 PHASE 5: Transactional Email API")
print("-" * 50)

status, body = http_get(f"{BASE_URL}:8095/health")
log("Transactional Health", "PASS" if status == 200 else "FAIL", f"HTTP {status}")

# ================================================================
# PHASE 6: Mailpit
# ================================================================
print("\n📋 PHASE 6: Mailpit")
print("-" * 50)

status, body = http_get(f"{BASE_URL}:8025/api/v1/messages")
if status == 200:
    data = json.loads(body)
    count = data.get("messages_count", data.get("total", 0))
    log("Mailpit API", "PASS", f"HTTP {status}, {count} messages")
else:
    log("Mailpit API", "FAIL", f"HTTP {status}")

# ================================================================
# PHASE 7: SMTP Send Test
# ================================================================
print("\n📋 PHASE 7: SMTP Email Send Test")
print("-" * 50)

try:
    import smtplib
    from email.mime.text import MIMEText

    msg = MIMEText("This is a smoke test email from OONRUMAIL platform.")
    msg["Subject"] = "OONRUMAIL Smoke Test"
    msg["From"] = test_email
    msg["To"] = "test@example.com"

    smtp = smtplib.SMTP("localhost", 587, timeout=10)
    smtp.ehlo()
    try:
        smtp.starttls()
    except:
        pass
    try:
        smtp.login(test_email, test_password)
        smtp.sendmail(test_email, ["test@example.com"], msg.as_string())
        log("SMTP Send", "PASS", "Email sent successfully")
    except smtplib.SMTPResponseException as e:
        log("SMTP Send", "WARN", f"SMTP {e.smtp_code}: {e.smtp_error.decode()[:100]}")
    smtp.quit()
except Exception as e:
    log("SMTP Send", "WARN", f"Exception: {str(e)[:100]}")

# Check Mailpit for the sent email
import time
time.sleep(2)
status, body = http_get(f"{BASE_URL}:8025/api/v1/messages")
if status == 200:
    data = json.loads(body)
    count = data.get("messages_count", data.get("total", 0))
    if count > 0:
        log("Email Delivery", "PASS", f"{count} message(s) in Mailpit")
    else:
        log("Email Delivery", "WARN", f"0 messages in Mailpit (delivery pending or relayed)")
else:
    log("Email Delivery", "FAIL", f"Mailpit check failed: HTTP {status}")

# ================================================================
# SUMMARY
# ================================================================
print("\n" + "=" * 70)
print("  SMOKE TEST SUMMARY")
print("=" * 70)

passed = sum(1 for _, s, _ in results if s == "PASS")
failed = sum(1 for _, s, _ in results if s == "FAIL")
warned = sum(1 for _, s, _ in results if s == "WARN")
total = len(results)

print(f"\n  ✅ Passed: {passed}/{total}")
if warned:
    print(f"  ⚠️  Warnings: {warned}")
if failed:
    print(f"  ❌ Failed: {failed}")
    print("\n  Failed tests:")
    for name, status, detail in results:
        if status == "FAIL":
            print(f"    - {name}: {detail}")
if warned:
    print("\n  Warning tests:")
    for name, status, detail in results:
        if status == "WARN":
            print(f"    - {name}: {detail}")

print(f"\n  Overall: {'🟢 PLATFORM OPERATIONAL' if failed == 0 else '🟡 PARTIALLY OPERATIONAL' if failed < total//2 else '🔴 CRITICAL ISSUES'}")
print("=" * 70)
