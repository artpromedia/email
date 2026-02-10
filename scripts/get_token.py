#!/usr/bin/env python3
import urllib.request, json

req = urllib.request.Request('http://localhost:8082/api/auth/login',
    data=json.dumps({'email':'admin@oonrumail.com','password':'SecurePassword123!'}).encode(),
    headers={'Content-Type':'application/json'}, method='POST')
resp = urllib.request.urlopen(req)
data = json.loads(resp.read())
print(json.dumps(data, indent=2, default=str)[:3000])
