-- ============================================================
-- Auth Service Database Migration
-- Creates all tables required by the auth service
-- Handles existing domains/mailboxes table modifications
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ORGANIZATIONS table
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    owner_id UUID, -- FK added after users table exists
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    logo_url TEXT,
    settings JSONB NOT NULL DEFAULT '{}',
    subscription_tier VARCHAR(50) NOT NULL DEFAULT 'free',
    max_domains INTEGER NOT NULL DEFAULT 1,
    max_users INTEGER NOT NULL DEFAULT 5,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

-- ============================================================
-- 2. ORGANIZATION_SETTINGS table
-- ============================================================
CREATE TABLE IF NOT EXISTS organization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    require_mfa BOOLEAN NOT NULL DEFAULT false,
    session_duration INTEGER NOT NULL DEFAULT 1440,
    max_login_attempts INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. USERS table
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    email VARCHAR(320),
    display_name VARCHAR(255) NOT NULL,
    password_hash TEXT,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    organization_role VARCHAR(50) NOT NULL DEFAULT 'member',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    locale VARCHAR(10) NOT NULL DEFAULT 'en',
    avatar_url TEXT,
    mfa_enabled BOOLEAN NOT NULL DEFAULT false,
    mfa_secret TEXT,
    mfa_backup_codes TEXT,
    password_changed_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    last_login_ip VARCHAR(45),
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    email_verification_token VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id);

-- Now add the FK from organizations.owner_id -> users.id
ALTER TABLE organizations
    ADD CONSTRAINT fk_organizations_owner
    FOREIGN KEY (owner_id) REFERENCES users(id)
    ON DELETE SET NULL;

-- ============================================================
-- 4. ORGANIZATION_MEMBERS table
-- ============================================================
CREATE TABLE IF NOT EXISTS organization_members (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

-- ============================================================
-- 5. ALTER existing DOMAINS table
--    - Rename 'name' column to 'domain_name'
--    - Add missing columns: is_default, is_verified, verification_status, verification_method, is_active
-- ============================================================

-- Rename name -> domain_name (auth service expects domain_name)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'domains' AND column_name = 'name'
    ) THEN
        -- Drop the unique constraint on 'name' first
        ALTER TABLE domains DROP CONSTRAINT IF EXISTS domains_name_key;
        -- Drop the index on 'name'
        DROP INDEX IF EXISTS idx_domains_name;
        -- Rename the column
        ALTER TABLE domains RENAME COLUMN name TO domain_name;
        -- Recreate unique constraint and index with new name
        ALTER TABLE domains ADD CONSTRAINT domains_domain_name_key UNIQUE (domain_name);
        CREATE INDEX IF NOT EXISTS idx_domains_domain_name ON domains(domain_name);
    END IF;
END
$$;

-- Add missing columns needed by auth service
ALTER TABLE domains ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) NOT NULL DEFAULT 'pending';
ALTER TABLE domains ADD COLUMN IF NOT EXISTS verification_method VARCHAR(50) DEFAULT 'dns_txt';
ALTER TABLE domains ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- 6. DOMAIN_SETTINGS table
-- ============================================================
CREATE TABLE IF NOT EXISTS domain_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL UNIQUE REFERENCES domains(id) ON DELETE CASCADE,
    catch_all_enabled BOOLEAN NOT NULL DEFAULT false,
    auto_create_mailbox BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. USER_EMAIL_ADDRESSES table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_email_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    email_address VARCHAR(320) NOT NULL UNIQUE,
    local_part VARCHAR(64) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verification_token VARCHAR(255),
    verification_token_expires_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_email_addresses_user_id ON user_email_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_email_addresses_domain_id ON user_email_addresses(domain_id);
CREATE INDEX IF NOT EXISTS idx_user_email_addresses_email ON user_email_addresses(email_address);

-- ============================================================
-- 8. ALTER existing MAILBOXES table
--    Add columns that auth service expects but domain-manager didn't create
-- ============================================================
ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS email_address_id UUID;
ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS domain_email VARCHAR(320);
ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS settings JSONB;
ALTER TABLE mailboxes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Rename storage_used_bytes -> used_bytes if it exists (auth expects used_bytes)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'mailboxes' AND column_name = 'storage_used_bytes'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'mailboxes' AND column_name = 'used_bytes'
    ) THEN
        ALTER TABLE mailboxes RENAME COLUMN storage_used_bytes TO used_bytes;
    END IF;
END
$$;

-- Backfill domain_email from existing email column
UPDATE mailboxes SET domain_email = email WHERE domain_email IS NULL AND email IS NOT NULL;

-- ============================================================
-- 9. USER_DOMAIN_PERMISSIONS table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_domain_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    can_send_as BOOLEAN NOT NULL DEFAULT false,
    can_manage BOOLEAN NOT NULL DEFAULT false,
    can_view_analytics BOOLEAN NOT NULL DEFAULT false,
    can_manage_users BOOLEAN NOT NULL DEFAULT false,
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, domain_id)
);

-- ============================================================
-- 10. USER_SESSIONS table
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    user_agent TEXT,
    ip_address VARCHAR(45),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- ============================================================
-- 11. PASSWORD_RESET_TOKENS table
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- ============================================================
-- 12. DOMAIN_SSO_CONFIGS table
-- ============================================================
CREATE TABLE IF NOT EXISTS domain_sso_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL UNIQUE REFERENCES domains(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    enforce_sso BOOLEAN NOT NULL DEFAULT false,
    auto_provision_users BOOLEAN NOT NULL DEFAULT false,
    default_role VARCHAR(50) NOT NULL DEFAULT 'member',
    saml_config JSONB,
    oidc_config JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 13. SSO_IDENTITIES table
-- ============================================================
CREATE TABLE IF NOT EXISTS sso_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    email VARCHAR(320) NOT NULL,
    raw_attributes JSONB,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sso_identities_user_id ON sso_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_sso_identities_provider ON sso_identities(provider, provider_user_id);

-- ============================================================
-- 14. LOGIN_ATTEMPTS table
-- ============================================================
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email VARCHAR(320) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    method VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at ON login_attempts(created_at);

-- ============================================================
-- 15. AUDIT_LOGS table
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================
-- UPDATE TRIGGERS for tables with updated_at
-- ============================================================

-- Ensure the update_updated_at_column function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for new tables (domains/mailboxes already have them)
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'organizations', 'organization_settings', 'users',
        'domain_settings', 'domain_sso_configs', 'sso_identities'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'update_' || tbl || '_updated_at'
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
                tbl, tbl
            );
        END IF;
    END LOOP;
END
$$;

-- ============================================================
-- SEED: Create default organization and domain for oonrumail.com
-- ============================================================

-- Insert a default organization (if none exists)
INSERT INTO organizations (id, name, slug, plan, status, subscription_tier, max_domains, max_users, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'OONRUMAIL',
    'oonrumail',
    'enterprise',
    'active',
    'enterprise',
    100,
    10000,
    true
)
ON CONFLICT (slug) DO NOTHING;

-- Update existing oonrumail.com domain to link to default org (if it exists)
UPDATE domains
SET organization_id = '00000000-0000-0000-0000-000000000001',
    is_verified = true,
    verification_status = 'verified',
    is_active = true
WHERE domain_name = 'oonrumail.com';

-- Insert default organization settings
INSERT INTO organization_settings (organization_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (organization_id) DO NOTHING;

COMMIT;

-- Verify
SELECT 'Tables created:' AS info;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
