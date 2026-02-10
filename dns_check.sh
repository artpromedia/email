#!/bin/bash
RESP=$(curl -s http://localhost:8082/api/auth/login -H 'Content-Type: application/json' -d @/tmp/login_body.json)
TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['TokenPair']['AccessToken'])")
echo "TOKEN: ${TOKEN:0:20}..."
echo "DNS Response:"
curl -sv -X POST http://localhost:8083/api/admin/domains/00000000-0000-0000-0000-000000000002/check-dns -H "Authorization: Bearer $TOKEN" -H 'X-Org-ID: 00000000-0000-0000-0000-000000000001' 2>&1
echo ""
