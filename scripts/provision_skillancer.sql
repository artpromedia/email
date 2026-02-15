-- =============================================================
-- Skillancer White-Label Org — Full Provisioning Script
-- =============================================================
-- This script is IDEMPOTENT: safe to run multiple times.
-- It provisions the Skillancer organization, domain, admin user,
-- and default branding in one go.
--
-- Usage:
--   docker exec -i enterprise-email-postgres-1 psql -U oonrumail -d oonrumail -f -  < scripts/provision_skillancer.sql
--   OR on the server:
--   psql -U oonrumail -d oonrumail -f scripts/provision_skillancer.sql
-- =============================================================

BEGIN;

-- -----------------------------------------------
-- 1. CREATE ORGANIZATION (if not exists)
-- -----------------------------------------------
INSERT INTO organizations (
    id, name, slug, plan, subscription_tier, status, is_active,
    max_domains, max_users, created_at, updated_at
)
VALUES (
    gen_random_uuid(), 'Skillancer', 'skillancer', 'enterprise', 'enterprise',
    'active', true, 50, 500, NOW(), NOW()
)
ON CONFLICT (slug) DO UPDATE SET
    plan = EXCLUDED.plan,
    subscription_tier = EXCLUDED.subscription_tier,
    status = EXCLUDED.status,
    is_active = EXCLUDED.is_active,
    max_domains = EXCLUDED.max_domains,
    max_users = EXCLUDED.max_users,
    updated_at = NOW();

SELECT id, name, slug, plan, status FROM organizations WHERE slug = 'skillancer' \gset org_

-- -----------------------------------------------
-- 2. CREATE ORGANIZATION SETTINGS (if not exists)
-- -----------------------------------------------
INSERT INTO organization_settings (
    organization_id, require_mfa, session_duration, max_login_attempts,
    created_at, updated_at
)
VALUES (
    (SELECT id FROM organizations WHERE slug = 'skillancer'),
    false, '24 hours'::interval, 5, NOW(), NOW()
)
ON CONFLICT (organization_id) DO NOTHING;

-- -----------------------------------------------
-- 3. ENSURE skillancer.com DOMAIN EXISTS & IS VERIFIED
-- -----------------------------------------------
-- First try to insert; if it already exists, update it
INSERT INTO domains (
    id, organization_id, name, status, is_verified, is_active,
    verification_method, created_at, updated_at
)
VALUES (
    gen_random_uuid(),
    (SELECT id FROM organizations WHERE slug = 'skillancer'),
    'skillancer.com',
    'active', true, true,
    'dns_txt', NOW(), NOW()
)
ON CONFLICT (name) DO UPDATE SET
    organization_id = (SELECT id FROM organizations WHERE slug = 'skillancer'),
    status = 'active',
    is_verified = true,
    is_active = true,
    updated_at = NOW();

-- Sync domain_name column if it exists (trigger may handle this)
UPDATE domains SET domain_name = 'skillancer.com'
WHERE name = 'skillancer.com'
  AND (domain_name IS NULL OR domain_name != 'skillancer.com');

-- -----------------------------------------------
-- 4. CREATE DOMAIN SETTINGS (if not exists)
-- -----------------------------------------------
INSERT INTO domain_settings (
    domain_id, catch_all_enabled, auto_create_mailbox,
    created_at, updated_at
)
VALUES (
    (SELECT id FROM domains WHERE name = 'skillancer.com'),
    false, true, NOW(), NOW()
)
ON CONFLICT (domain_id) DO NOTHING;

-- -----------------------------------------------
-- 5. CREATE ADMIN USER (if not exists)
-- -----------------------------------------------
-- Password: Skillancer2025!@#  (bcrypt hash)
-- Generate with: htpasswd -nbBC 10 "" 'Skillancer2025!@#' | cut -d: -f2
DO $$
DECLARE
    v_org_id UUID;
    v_domain_id UUID;
    v_user_id UUID;
    v_email_id UUID;
    v_existing_user_id UUID;
BEGIN
    SELECT id INTO v_org_id FROM organizations WHERE slug = 'skillancer';
    SELECT id INTO v_domain_id FROM domains WHERE name = 'skillancer.com';

    -- Check if user already exists
    SELECT id INTO v_existing_user_id FROM users WHERE email = 'admin@skillancer.com';

    IF v_existing_user_id IS NOT NULL THEN
        -- User exists — just make sure they are admin/owner
        UPDATE users SET
            role = 'admin',
            organization_role = 'owner',
            organization_id = v_org_id,
            email_verified = true,
            status = 'active',
            updated_at = NOW()
        WHERE id = v_existing_user_id;

        UPDATE organizations SET owner_id = v_existing_user_id, updated_at = NOW()
        WHERE id = v_org_id;

        UPDATE user_email_addresses SET is_verified = true
        WHERE user_id = v_existing_user_id;

        RAISE NOTICE 'User admin@skillancer.com already exists (%), promoted to admin/owner', v_existing_user_id;
    ELSE
        -- Create new user
        v_user_id := gen_random_uuid();

        INSERT INTO users (
            id, organization_id, email, display_name,
            password_hash, role, organization_role,
            status, email_verified,
            created_at, updated_at
        ) VALUES (
            v_user_id, v_org_id, 'admin@skillancer.com', 'Skillancer Admin',
            -- bcrypt hash of 'Skillancer2025!@#' (cost 10)
            '$2a$10$rGz3Y0T7DkZJqZpF4Nj4KexmYOZqIVq1vQhF2eFQz9fZnQX5V3o3C',
            'admin', 'owner',
            'active', true,
            NOW(), NOW()
        );

        -- Create email address
        v_email_id := gen_random_uuid();
        INSERT INTO user_email_addresses (
            id, user_id, domain_id, email_address, local_part,
            is_primary, is_verified, created_at, updated_at
        ) VALUES (
            v_email_id, v_user_id, v_domain_id, 'admin@skillancer.com', 'admin',
            true, true, NOW(), NOW()
        );

        -- Create mailbox
        INSERT INTO mailboxes (
            id, user_id, email_address_id, domain_email,
            quota_bytes, used_bytes, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_user_id, v_email_id, 'admin@skillancer.com',
            5368709120, 0, NOW(), NOW()  -- 5GB quota
        );

        -- Set org owner
        UPDATE organizations SET owner_id = v_user_id, updated_at = NOW()
        WHERE id = v_org_id;

        -- Add to org members
        INSERT INTO organization_members (
            organization_id, user_id, role, created_at
        ) VALUES (
            v_org_id, v_user_id, 'owner', NOW()
        ) ON CONFLICT DO NOTHING;

        -- Grant full domain permissions
        INSERT INTO user_domain_permissions (
            user_id, domain_id, can_send_as, can_manage,
            can_view_analytics, can_manage_users, created_at
        ) VALUES (
            v_user_id, v_domain_id, true, true, true, true, NOW()
        ) ON CONFLICT DO NOTHING;

        RAISE NOTICE 'Created admin@skillancer.com with id %', v_user_id;
    END IF;
END $$;

-- -----------------------------------------------
-- 6. SET DEFAULT BRANDING (if not exists)
-- -----------------------------------------------
INSERT INTO domain_branding (
    domain_id, logo_url, favicon_url, primary_color,
    created_at, updated_at
)
VALUES (
    (SELECT id FROM domains WHERE name = 'skillancer.com'),
    '/logos/default-logo.svg',
    '/favicon.ico',
    '#6366F1',
    NOW(), NOW()
)
ON CONFLICT (domain_id) DO NOTHING;

-- -----------------------------------------------
-- 7. VERIFICATION — Show what was provisioned
-- -----------------------------------------------
SELECT '--- Organization ---' AS section;
SELECT id, name, slug, plan, status, is_active, owner_id
FROM organizations WHERE slug = 'skillancer';

SELECT '--- Domain ---' AS section;
SELECT id, name, organization_id, status, is_verified, is_active
FROM domains WHERE name = 'skillancer.com';

SELECT '--- Admin User ---' AS section;
SELECT u.id, u.email, u.display_name, u.role, u.organization_role, u.email_verified, u.status
FROM users u WHERE u.email = 'admin@skillancer.com';

SELECT '--- Email Addresses ---' AS section;
SELECT ea.email_address, ea.is_primary, ea.is_verified
FROM user_email_addresses ea
JOIN users u ON u.id = ea.user_id
WHERE u.email = 'admin@skillancer.com';

SELECT '--- Branding ---' AS section;
SELECT db.logo_url, db.favicon_url, db.primary_color
FROM domain_branding db
JOIN domains d ON d.id = db.domain_id
WHERE d.name = 'skillancer.com';

COMMIT;

-- =============================================================
-- IMPORTANT: The password hash above is a PLACEHOLDER.
-- After running this script, register via API to set a proper hash:
--
--   curl -X POST https://api.skillancer.com/api/auth/register \
--     -H "Content-Type: application/json" \
--     -d '{"email":"admin@skillancer.com","password":"Skillancer2025!@#","name":"Skillancer Admin"}'
--
-- Or update the hash column directly:
--   UPDATE users SET password_hash = crypt('Skillancer2025!@#', gen_salt('bf', 10))
--   WHERE email = 'admin@skillancer.com';
-- =============================================================
