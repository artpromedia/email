#!/usr/bin/env python3
"""End-to-end smoke test for OONRUMAIL platform."""
import json
import urllib.request
import urllib.error
import ssl

# Disable SSL verification for self-signed certs
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = "http://localhost"

def api(method, url, data=None, headers=None, timeout=10):
    """Make an HTTP request and return (status, body_dict)."""
    if headers is None:
        headers = {}
    if data is not None:
        data = json.dumps(data).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        body = resp.read().decode('utf-8')
        try:
            return resp.status, json.loads(body)
        except:
            return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except:
            return e.code, body
    except Exception as e:
        return 0, str(e)

def test(name, status, body, expected_status=None):
    ok = True
    if expected_status and status != expected_status:
        ok = False
    icon = "✅" if ok else "⚠️"
    print(f"\n{icon} {name}")
    print(f"   Status: {status}")
    if isinstance(body, dict):
        print(f"   Response: {json.dumps(body, indent=2)[:500]}")
    else:
        print(f"   Response: {str(body)[:300]}")
    return ok

print("=" * 60)
print("OONRUMAIL Platform End-to-End Smoke Test")
print("=" * 60)

# ---- 1. Register a user ----
print("\n--- AUTH SERVICE (port 8082) ---")
status, body = api("POST", f"{BASE}:8082/api/auth/register", {
    "email": "smoketest@oonrumail.com",
    "password": "SmokeTest12345!",
    "name": "Smoke Test User"
})
test("Register User", status, body)

token = None
user_id = None
if isinstance(body, dict):
    token = body.get("token") or body.get("access_token")
    user_id = body.get("user", {}).get("id") if isinstance(body.get("user"), dict) else body.get("user_id")

# ---- 2. Login ----
status, body = api("POST", f"{BASE}:8082/api/auth/login", {
    "email": "smoketest@oonrumail.com",
    "password": "SmokeTest12345!"
})
test("Login", status, body)

if isinstance(body, dict):
    token = body.get("token") or body.get("access_token") or token
    if isinstance(body.get("user"), dict):
        user_id = body["user"].get("id") or user_id

auth_header = {"Authorization": f"Bearer {token}"} if token else {}

# ---- 3. Get profile ----
if token:
    status, body = api("GET", f"{BASE}:8082/api/auth/me", headers=auth_header)
    test("Get Profile", status, body)

# ---- 4. Contacts Service ----
print("\n--- CONTACTS SERVICE (port 8083) ---")
status, body = api("GET", f"{BASE}:8083/health")
test("Health Check", status, body, 200)

if token:
    status, body = api("POST", f"{BASE}:8083/api/v1/contacts", {
        "first_name": "John",
        "last_name": "Doe",
        "email": "john@example.com"
    }, headers=auth_header)
    test("Create Contact", status, body)

# ---- 5. Calendar Service ----
print("\n--- CALENDAR SERVICE (port 8092) ---")
status, body = api("GET", f"{BASE}:8092/health")
test("Health Check", status, body, 200)

# ---- 6. Chat Service ----
print("\n--- CHAT SERVICE (port 8086) ---")
status, body = api("GET", f"{BASE}:8086/health")
test("Health Check", status, body, 200)

# ---- 7. Storage Service ----
print("\n--- STORAGE SERVICE (port 8085) ---")
status, body = api("GET", f"{BASE}:8085/health")
test("Health Check", status, body, 200)

# ---- 8. Domain Manager ----
print("\n--- DOMAIN MANAGER (port 8084) ---")
status, body = api("GET", f"{BASE}:8084/health")
test("Health Check", status, body, 200)

# ---- 9. AI Assistant ----
print("\n--- AI ASSISTANT (port 8090) ---")
status, body = api("GET", f"{BASE}:8090/health")
test("Health Check", status, body, 200)

# ---- 10. Transactional API ----
print("\n--- TRANSACTIONAL API (port 8095) ---")
status, body = api("GET", f"{BASE}:8095/health")
test("Health Check", status, body, 200)

# ---- 11. SMS Gateway ----
print("\n--- SMS GATEWAY (port 8087) ---")
status, body = api("GET", f"{BASE}:8087/health")
test("Health Check", status, body, 200)

# ---- 12. SMTP Test ----
print("\n--- SMTP SERVICE (port 25/587) ---")
import socket
try:
    s = socket.create_connection(("localhost", 587), timeout=5)
    banner = s.recv(1024).decode()
    s.close()
    test("SMTP Banner (587)", 200, banner, 200)
except Exception as e:
    test("SMTP Connect (587)", 0, str(e))

# ---- 13. IMAP Test ----
print("\n--- IMAP SERVICE (port 143/993) ---")
try:
    s = socket.create_connection(("localhost", 143), timeout=5)
    banner = s.recv(1024).decode()
    s.close()
    test("IMAP Banner (143)", 200, banner, 200)
except Exception as e:
    test("IMAP Connect (143)", 0, str(e))

# ---- 14. Send test email via SMTP ----
print("\n--- EMAIL SEND TEST ---")
import smtplib
from email.mime.text import MIMEText
try:
    msg = MIMEText("This is a smoke test email from OONRUMAIL platform.")
    msg["Subject"] = "OONRUMAIL Smoke Test"
    msg["From"] = "smoketest@oonrumail.com"
    msg["To"] = "testrecipient@oonrumail.com"

    smtp = smtplib.SMTP("localhost", 587, timeout=10)
    smtp.ehlo()
    # Don't STARTTLS for now, just test basic send
    smtp.sendmail("smoketest@oonrumail.com", ["testrecipient@oonrumail.com"], msg.as_string())
    smtp.quit()
    test("Send Email via SMTP", 200, "Email sent successfully!", 200)
except Exception as e:
    test("Send Email via SMTP", 0, str(e))

# ---- 15. Check Mailpit for received email ----
print("\n--- MAILPIT (port 8025) ---")
status, body = api("GET", f"{BASE}:8025/api/v1/messages")
if isinstance(body, dict):
    count = body.get("total", body.get("messages_count", 0))
    test(f"Mailpit Messages (total: {count})", status, body, 200)
else:
    test("Mailpit Messages", status, body)

# ---- Summary ----
print("\n" + "=" * 60)
print("Smoke test complete!")
if token:
    print(f"✅ Auth token obtained: {token[:30]}...")
else:
    print("⚠️  No auth token obtained - authenticated tests skipped")
print("=" * 60)
