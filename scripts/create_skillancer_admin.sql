-- Step 1: Create Skillancer organization with enterprise plan
INSERT INTO organizations (id, name, slug, plan, subscription_tier, status, is_active, max_domains, max_users, created_at, updated_at)
VALUES (gen_random_uuid(), 'Skillancer', 'skillancer', 'enterprise', 'enterprise', 'active', true, 50, 500, NOW(), NOW())
RETURNING id, name, plan, status;

-- Step 2: Move skillancer.com domain to the new org & verify it
UPDATE domains
SET organization_id = (SELECT id FROM organizations WHERE slug = 'skillancer'),
    is_verified = true,
    is_active = true,
    status = 'active',
    updated_at = NOW()
WHERE name = 'skillancer.com'
RETURNING id, name, organization_id, is_verified, status;

-- Step 3: Verify the setup
SELECT o.name as org, o.plan, d.name as domain, d.is_verified, d.status
FROM organizations o
JOIN domains d ON d.organization_id = o.id
WHERE o.slug = 'skillancer';
