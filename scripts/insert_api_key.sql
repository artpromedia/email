INSERT INTO api_keys (id, domain_id, key_hash, key_prefix, name, scopes, rate_limit, daily_limit, created_by)
VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000002',
    '633c6591018ca01c932e0b549cda17dbb9f34e2a6366a23d96227559baa628db',
    'sk_live_5OLZ',
    'admin-key',
    ARRAY['send', 'read', 'manage'],
    10000,
    1000000,
    '00000000-0000-0000-0000-000000000001'
);
