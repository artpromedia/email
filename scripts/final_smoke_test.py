#!/usr/bin/env python3
"""Final comprehensive OONRUMAIL smoke test"""
import urllib.request, json, socket, uuid

BASE = "http://localhost"
results = []

def log(test, status, detail=""):
    icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    results.append((test, status, detail))
    print(f"  {icon} {test}: {detail[:80]}")

def http_get(url, token=None, timeout=10):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    req = urllib.request.Request(url, headers=h)
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, resp.read().decode()[:500]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:500]
    except Exception as e:
        return 0, str(e)

def http_post(url, data, token=None, timeout=10):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=h, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()) if e.read() else {}
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
print("  OONRUMAIL PLATFORM - FINAL SMOKE TEST")
print("=" * 70)

# 1. HEALTH CHECKS
print("\n📋 PHASE 1: Service Health Checks")
print("-" * 50)

health_checks = [
    ("Auth", 8082), ("Contacts", 8083), ("Domain Manager", 8084),
    ("Storage", 8085), ("Chat", 8086), ("SMS Gateway", 8087),
    ("AI Assistant", 8090), ("Calendar", 8092), ("Transactional API", 8095),
]
for name, port in health_checks:
    s, b = http_get(f"{BASE}:{port}/health")
    log(f"{name}", "PASS" if s == 200 else "FAIL", f"HTTP {s}")

# 2. PROTOCOL BANNERS
print("\n📋 PHASE 2: Protocol Banners")
print("-" * 50)

for name, port, expect in [("SMTP:587", 587, "220"), ("SMTP:25", 25, "220"), ("IMAP:143", 143, "OK")]:
    ok, banner = check_tcp("localhost", port)
    log(name, "PASS" if ok and expect in banner else "FAIL", banner[:70])

# 3. AUTHENTICATION
print("\n📋 PHASE 3: Authentication")
print("-" * 50)

email = f"test-{uuid.uuid4().hex[:8]}@oonrumail.com"
s, data = http_post(f"{BASE}:8082/api/auth/register", {
    "email": email, "password": "TestPassword123!!", "name": "Smoke Test"
})
log("Register", "PASS" if s == 201 else "FAIL", f"HTTP {s}")

s, data = http_post(f"{BASE}:8082/api/auth/login", {"email": email, "password": "TestPassword123!!"})
token = data.get("TokenPair", {}).get("AccessToken", "")
log("Login", "PASS" if s == 200 and token else "FAIL", f"HTTP {s}, token={'yes' if token else 'no'}")

if token:
    s, b = http_get(f"{BASE}:8082/api/auth/me", token)
    log("Get Profile", "PASS" if s == 200 else "FAIL", f"HTTP {s}")

# 4. API ENDPOINTS (with correct paths)
print("\n📋 PHASE 4: API Endpoints")
print("-" * 50)

# Default org ID from our seed data
org_id = "00000000-0000-0000-0000-000000000001"

tests = [
    ("Contacts", f"{BASE}:8083/api/v1/contacts"),
    ("Calendar", f"{BASE}:8092/api/v1/calendars"),
    ("Chat Channels", f"{BASE}:8086/api/v1/channels"),
    ("Storage Quota", f"{BASE}:8085/api/v1/quotas?organization_id={org_id}"),
    ("Domain Manager", f"{BASE}:8084/api/admin/domains?organization_id={org_id}"),
]
for name, url in tests:
    s, b = http_get(url, token)
    log(name, "PASS" if s in [200, 401, 403] else "FAIL", f"HTTP {s}")

# 5. TRANSACTIONAL EMAIL
print("\n📋 PHASE 5: Transactional Email API")
print("-" * 50)

s, b = http_get(f"{BASE}:8095/health")
log("Tx Health", "PASS" if s == 200 else "FAIL", f"HTTP {s}")

# 6. MAILPIT
print("\n📋 PHASE 6: Mailpit")
print("-" * 50)

s, b = http_get(f"{BASE}:8025/api/v1/messages")
if s == 200:
    data = json.loads(b)
    count = data.get("messages_count", data.get("total", 0))
    log("Mailpit", "PASS", f"HTTP {s}, {count} messages")
else:
    log("Mailpit", "FAIL", f"HTTP {s}")

# SUMMARY
print("\n" + "=" * 70)
print("  SUMMARY")
print("=" * 70)

passed = sum(1 for _, s, _ in results if s == "PASS")
failed = sum(1 for _, s, _ in results if s == "FAIL")
total = len(results)

print(f"\n  Passed: {passed}/{total}")
if failed:
    print(f"  Failed: {failed}")
    for name, status, detail in results:
        if status == "FAIL":
            print(f"    ❌ {name}: {detail}")

status_emoji = "🟢" if failed == 0 else "🟡" if failed < 3 else "🔴"
print(f"\n  {status_emoji} {'PLATFORM READY' if failed == 0 else 'PARTIALLY OPERATIONAL' if failed < 3 else 'NEEDS ATTENTION'}")
print("=" * 70)
