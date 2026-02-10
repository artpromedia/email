-- Insert oonrumail.com domain
INSERT INTO domains (id, organization_id, domain_name, display_name, status, is_primary, verification_token, is_verified, verification_status, is_active, mx_verified, spf_verified, dkim_verified, dmarc_verified)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'oonrumail.com',
    'OONRUMAIL',
    'active',
    true,
    'verified',
    true,
    'verified',
    true,
    true,
    true,
    false,
    false
)
ON CONFLICT DO NOTHING;

-- Verify
SELECT id, domain_name, organization_id, is_verified, status, is_active FROM domains;
SELECT id, name, slug, status FROM organizations;
