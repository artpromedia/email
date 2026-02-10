#!/usr/bin/env python3
"""Generate an API key and insert into database"""
import hashlib
import secrets
import string

# Generate a secure API key
prefix = "sk_live_"
random_part = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
api_key = prefix + random_part
key_prefix = api_key[:12]

# Hash for storage
key_hash = hashlib.sha256(api_key.encode()).hexdigest()

print(f"API_KEY={api_key}")
print(f"KEY_PREFIX={key_prefix}")
print(f"KEY_HASH={key_hash}")
print()
print("SQL to insert:")
print(f"""
INSERT INTO api_keys (id, domain_id, key_hash, key_prefix, name, scopes, rate_limit, daily_limit, created_by)
VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000002',
    '{key_hash}',
    '{key_prefix}',
    'admin-key',
    ARRAY['send', 'read', 'manage'],
    10000,
    1000000,
    '00000000-0000-0000-0000-000000000001'
);
""")
