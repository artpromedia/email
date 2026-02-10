-- Add missing columns expected by transactional-api code

-- Add organization_id column (code expects this)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS organization_id UUID;
-- Copy domain_id to organization_id if needed
UPDATE api_keys SET organization_id = domain_id WHERE organization_id IS NULL;

-- Add is_active column (code expects this)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
-- Set is_active based on revoked_at
UPDATE api_keys SET is_active = (revoked_at IS NULL) WHERE is_active IS NULL;

-- Add updated_at column
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Verify the fix
SELECT id, key_prefix, name, organization_id, is_active, domain_id FROM api_keys;
