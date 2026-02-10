#!/usr/bin/env python3
"""Comprehensive E2E smoke test for OONRUMAIL platform"""
import urllib.request
import json
import socket
import time
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
        return e.code, json.loads(body) if body else {}
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
print("  OONRUMAIL PLATFORM - COMPREHENSIVE SMOKE TEST")
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
    log("User Registration", "FAIL", f"HTTP {status}: {json.dumps(data)[:200]}")
    user_id = ""

# Login
status, data = http_post(f"{BASE_URL}:8082/api/auth/login", {
    "email": test_email,
    "password": test_password
})
token = ""
if status == 200:
    # Try to find token in response
    token = data.get("token", data.get("access_token", ""))
    if not token:
        # Check nested structures
        for key in data:
            if isinstance(data[key], str) and len(data[key]) > 50:
                token = data[key]
                break
    if token:
        log("User Login", "PASS", f"Got token: {token[:30]}...")
    else:
        log("User Login", "WARN", f"Login OK but no obvious token. Keys: {list(data.keys())}")
        # Dump full response for debugging
        print(f"    Full response: {json.dumps(data, default=str)[:500]}")
else:
    log("User Login", "FAIL", f"HTTP {status}: {json.dumps(data)[:200]}")

# Get profile (if we have a token)
if token:
    auth_header = {"Authorization": f"Bearer {token}"}
    status, body = http_get(f"{BASE_URL}:8082/api/auth/me", auth_header)
    if status == 200:
        log("Get Profile (/me)", "PASS", f"HTTP {status}")
    else:
        log("Get Profile (/me)", "FAIL", f"HTTP {status}: {body[:100]}")

# ================================================================
# PHASE 4: API Endpoints (with auth if available)
# ================================================================
print("\n📋 PHASE 4: API Endpoint Tests")
print("-" * 50)

auth_header = {"Authorization": f"Bearer {token}"} if token else {}

# Contacts - list
status, body = http_get(f"{BASE_URL}:8083/api/contacts", auth_header)
log("Contacts List", "PASS" if status in [200, 401] else "FAIL", f"HTTP {status}")

# Calendar - list
status, body = http_get(f"{BASE_URL}:8092/api/calendars", auth_header)
log("Calendar List", "PASS" if status in [200, 401] else "FAIL", f"HTTP {status}")

# Chat - rooms
status, body = http_get(f"{BASE_URL}:8086/api/rooms", auth_header)
log("Chat Rooms", "PASS" if status in [200, 401] else "FAIL", f"HTTP {status}")

# Storage - files
status, body = http_get(f"{BASE_URL}:8085/api/files", auth_header)
log("Storage Files", "PASS" if status in [200, 401] else "FAIL", f"HTTP {status}")

# Domain Manager - domains
status, body = http_get(f"{BASE_URL}:8084/api/domains", auth_header)
log("Domain Manager", "PASS" if status in [200, 401] else "FAIL", f"HTTP {status}")

# ================================================================
# PHASE 5: Transactional Email API
# ================================================================
print("\n📋 PHASE 5: Transactional Email API")
print("-" * 50)

status, body = http_get(f"{BASE_URL}:8095/health")
log("Transactional Health", "PASS" if status == 200 else "FAIL", f"HTTP {status}")

# ================================================================
# PHASE 6: Mailpit (development mail catcher)
# ================================================================
print("\n📋 PHASE 6: Mailpit")
print("-" * 50)

status, body = http_get(f"{BASE_URL}:8025/api/v1/messages")
if status == 200:
    data = json.loads(body)
    count = data.get("messages_count", data.get("total", len(data.get("messages", []))))
    log("Mailpit API", "PASS", f"HTTP {status}, {count} messages")
else:
    log("Mailpit API", "FAIL", f"HTTP {status}: {body[:100]}")

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

print(f"\n  Overall: {'🟢 PLATFORM OPERATIONAL' if failed == 0 else '🟡 PARTIALLY OPERATIONAL' if failed < total//2 else '🔴 CRITICAL ISSUES'}")
print("=" * 70)
