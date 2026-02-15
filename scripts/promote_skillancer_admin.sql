-- Promote admin@skillancer.com to admin/owner
UPDATE users
SET role = 'admin',
    organization_role = 'owner',
    email_verified = true,
    updated_at = NOW()
WHERE id = 'd16f72a0-63c0-4afa-accc-7c86ecc6b41a'
RETURNING id, email, display_name, role, organization_role, email_verified;

-- Set the organization owner
UPDATE organizations
SET owner_id = 'd16f72a0-63c0-4afa-accc-7c86ecc6b41a',
    updated_at = NOW()
WHERE slug = 'skillancer'
RETURNING id, name, owner_id, plan, status;

-- Also verify the email address record
UPDATE user_email_addresses
SET is_verified = true
WHERE user_id = 'd16f72a0-63c0-4afa-accc-7c86ecc6b41a';

-- Final verification
SELECT u.display_name, u.role, u.organization_role, u.email_verified,
       o.name as org_name, o.plan, o.subscription_tier,
       d.name as domain, d.is_verified as domain_verified
FROM users u
JOIN organizations o ON o.id = u.organization_id
JOIN domains d ON d.organization_id = o.id
WHERE u.id = 'd16f72a0-63c0-4afa-accc-7c86ecc6b41a';
