#!/usr/bin/env python3
"""Quick auth test after schema migration"""
import urllib.request
import json
import ssl

ctx = ssl._create_unverified_context()
base = "http://localhost:8082/api/auth"

def post(path, data):
    req = urllib.request.Request(
        f"{base}{path}",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        body = resp.read().decode()
        print(f"  Status: {resp.status}")
        print(f"  Body: {body[:500]}")
        return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  Status: {e.code}")
        print(f"  Error: {body[:500]}")
        return e.code, json.loads(body) if body else {}
    except Exception as e:
        print(f"  Exception: {e}")
        return 0, {}

print("=" * 60)
print("AUTH SERVICE QUICK TEST")
print("=" * 60)

# Test 1: Register
print("\n1. Register new user (admin@oonrumail.com)...")
status, data = post("/register", {
    "email": "admin@oonrumail.com",
    "password": "SecurePassword123!",
    "name": "Admin User"
})

# Test 2: Login
print("\n2. Login with new user...")
status, data = post("/login", {
    "email": "admin@oonrumail.com",
    "password": "SecurePassword123!"
})

if status == 200 and "token" in str(data):
    print("\n✅ AUTH IS WORKING!")
else:
    print(f"\n⚠️  Login returned {status}")

# Test 3: Try registering duplicate
print("\n3. Register duplicate (should fail)...")
status, data = post("/register", {
    "email": "admin@oonrumail.com",
    "password": "SecurePassword123!",
    "name": "Admin User"
})

print("\n" + "=" * 60)
print("DONE")
print("=" * 60)
