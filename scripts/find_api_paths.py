#!/usr/bin/env python3
"""Get token structure and test authenticated API calls"""
import urllib.request, json, sys

def post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def get(url, token=None):
    h = {}
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=h)
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        return resp.status, resp.read().decode()[:500]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:500]
    except Exception as e:
        return 0, str(e)

# 1. Login
print("=== LOGIN ===")
status, data = post("http://localhost:8082/api/auth/login", {
    "email": "admin@oonrumail.com",
    "password": "SecurePassword123!"
})
print(f"Status: {status}")
print(f"Keys: {list(data.keys())}")

# Extract token
tp = data.get("TokenPair", {})
print(f"TokenPair keys: {list(tp.keys()) if isinstance(tp, dict) else tp}")
token = tp.get("access_token", tp.get("AccessToken", ""))
if not token:
    # Try all string values in TokenPair
    for k, v in (tp.items() if isinstance(tp, dict) else []):
        if isinstance(v, str) and len(v) > 20:
            print(f"  TokenPair.{k} = {v[:60]}...")
            if not token:
                token = v

if not token:
    print("No token found, dumping full response:")
    print(json.dumps(data, indent=2, default=str)[:2000])
    sys.exit(1)

print(f"Token: {token[:50]}...")

# 2. Test /me
print("\n=== GET /me ===")
s, b = get("http://localhost:8082/api/auth/me", token)
print(f"Status: {s}, Body: {b[:200]}")

# 3. Find correct API paths for each service
print("\n=== DISCOVERING API PATHS ===")
services = {
    "Contacts:8083": ["/api/contacts", "/api/v1/contacts", "/contacts", "/health"],
    "Calendar:8092": ["/api/calendars", "/api/v1/calendars", "/calendars", "/api/calendar"],
    "Chat:8086":     ["/api/rooms", "/api/v1/rooms", "/rooms", "/api/chat/rooms"],
    "Storage:8085":  ["/api/files", "/api/v1/files", "/files", "/api/storage/files"],
    "DomainMgr:8084":["/api/domains", "/api/v1/domains", "/domains"],
}

for svc, paths in services.items():
    name, port = svc.split(":")
    print(f"\n{name} (:{port}):")
    for path in paths:
        s, b = get(f"http://localhost:{port}{path}", token)
        marker = "✅" if s in [200, 401, 403] else "  "
        print(f"  {marker} {path} -> {s} {b[:100]}")
