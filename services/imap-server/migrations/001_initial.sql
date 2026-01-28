-- IMAP Server Database Migrations
-- Supports multi-domain mailbox access and shared mailboxes

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations table (multi-tenant)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Domains table
CREATE TABLE IF NOT EXISTS domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL UNIQUE,
    mx_verified BOOLEAN DEFAULT FALSE,
    dkim_verified BOOLEAN DEFAULT FALSE,
    spf_verified BOOLEAN DEFAULT FALSE,
    dmarc_verified BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_domains_organization ON domains(organization_id);
CREATE INDEX idx_domains_name ON domains(name);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    organization_role VARCHAR(50) DEFAULT 'member',
    status VARCHAR(50) DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_organization ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

-- Mailboxes table (email accounts)
CREATE TABLE IF NOT EXISTS mailboxes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    local_part VARCHAR(255) NOT NULL,
    email_address VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    is_primary BOOLEAN DEFAULT FALSE,
    namespace_mode VARCHAR(50) DEFAULT 'domain_separated',
    status VARCHAR(50) DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(domain_id, local_part)
);

CREATE INDEX idx_mailboxes_user ON mailboxes(user_id);
CREATE INDEX idx_mailboxes_domain ON mailboxes(domain_id);
CREATE INDEX idx_mailboxes_email ON mailboxes(email_address);

-- Folders table
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    full_path VARCHAR(1024) NOT NULL,
    delimiter VARCHAR(1) DEFAULT '/',
    uid_validity BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    uid_next BIGINT NOT NULL DEFAULT 1,
    highest_modseq BIGINT NOT NULL DEFAULT 1,
    message_count INTEGER DEFAULT 0,
    recent_count INTEGER DEFAULT 0,
    unseen_count INTEGER DEFAULT 0,
    first_unseen INTEGER DEFAULT 0,
    subscribed BOOLEAN DEFAULT TRUE,
    selectable BOOLEAN DEFAULT TRUE,
    special_use VARCHAR(50),
    attributes JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(mailbox_id, full_path)
);

CREATE INDEX idx_folders_mailbox ON folders(mailbox_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_folders_special_use ON folders(special_use);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    uid BIGINT NOT NULL,
    sequence_number INTEGER NOT NULL,
    message_id VARCHAR(512),
    in_reply_to VARCHAR(512),
    "references" TEXT,
    subject TEXT,
    "from" TEXT,
    "to" TEXT,
    cc TEXT,
    bcc TEXT,
    reply_to TEXT,
    date TIMESTAMPTZ,
    size BIGINT NOT NULL DEFAULT 0,
    flags JSONB DEFAULT '[]',
    internal_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    modseq BIGINT NOT NULL DEFAULT 1,
    body_structure JSONB,
    envelope JSONB,
    headers JSONB,
    storage_path VARCHAR(1024),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(folder_id, uid)
);

CREATE INDEX idx_messages_mailbox ON messages(mailbox_id);
CREATE INDEX idx_messages_folder ON messages(folder_id);
CREATE INDEX idx_messages_uid ON messages(folder_id, uid);
CREATE INDEX idx_messages_modseq ON messages(folder_id, modseq);
CREATE INDEX idx_messages_date ON messages(date);
CREATE INDEX idx_messages_message_id ON messages(message_id);
CREATE INDEX idx_messages_deleted ON messages(deleted_at) WHERE deleted_at IS NOT NULL;

-- Full-text search index for messages
CREATE INDEX idx_messages_subject_fts ON messages USING gin(to_tsvector('english', subject));
CREATE INDEX idx_messages_from_fts ON messages USING gin(to_tsvector('english', "from"));

-- Shared mailbox access table
CREATE TABLE IF NOT EXISTS shared_mailbox_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permissions JSONB NOT NULL DEFAULT '["read"]',
    display_name VARCHAR(255),
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(mailbox_id, user_id)
);

CREATE INDEX idx_shared_access_mailbox ON shared_mailbox_access(mailbox_id);
CREATE INDEX idx_shared_access_user ON shared_mailbox_access(user_id);

-- Quotas table
CREATE TABLE IF NOT EXISTS quotas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE UNIQUE,
    storage_limit BIGINT NOT NULL DEFAULT 1073741824, -- 1GB default
    storage_used BIGINT NOT NULL DEFAULT 0,
    message_limit BIGINT DEFAULT 0, -- 0 = unlimited
    message_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotas_mailbox ON quotas(mailbox_id);

-- IMAP sessions table
CREATE TABLE IF NOT EXISTS imap_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id VARCHAR(255) NOT NULL,
    client_ip INET,
    client_port INTEGER,
    tls_version VARCHAR(50),
    authenticated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    selected_mailbox_id UUID REFERENCES mailboxes(id),
    selected_folder_id UUID REFERENCES folders(id),
    capabilities JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON imap_sessions(user_id);
CREATE INDEX idx_sessions_last_activity ON imap_sessions(last_activity);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    mailbox_id UUID REFERENCES mailboxes(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    client_ip INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_mailbox ON audit_logs(mailbox_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- Subscriptions table (for IMAP SUBSCRIBE)
CREATE TABLE IF NOT EXISTS folder_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    subscribed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, folder_id)
);

CREATE INDEX idx_subscriptions_user ON folder_subscriptions(user_id);

-- Create default folders function
CREATE OR REPLACE FUNCTION create_default_folders()
RETURNS TRIGGER AS $$
BEGIN
    -- INBOX
    INSERT INTO folders (mailbox_id, name, full_path, special_use, attributes)
    VALUES (NEW.id, 'INBOX', 'INBOX', 'inbox', '["\\HasNoChildren"]');
    
    -- Drafts
    INSERT INTO folders (mailbox_id, name, full_path, special_use, attributes)
    VALUES (NEW.id, 'Drafts', 'Drafts', 'drafts', '["\\HasNoChildren", "\\Drafts"]');
    
    -- Sent
    INSERT INTO folders (mailbox_id, name, full_path, special_use, attributes)
    VALUES (NEW.id, 'Sent', 'Sent', 'sent', '["\\HasNoChildren", "\\Sent"]');
    
    -- Spam
    INSERT INTO folders (mailbox_id, name, full_path, special_use, attributes)
    VALUES (NEW.id, 'Spam', 'Spam', 'junk', '["\\HasNoChildren", "\\Junk"]');
    
    -- Trash
    INSERT INTO folders (mailbox_id, name, full_path, special_use, attributes)
    VALUES (NEW.id, 'Trash', 'Trash', 'trash', '["\\HasNoChildren", "\\Trash"]');
    
    -- Archive
    INSERT INTO folders (mailbox_id, name, full_path, special_use, attributes)
    VALUES (NEW.id, 'Archive', 'Archive', 'archive', '["\\HasNoChildren", "\\Archive"]');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_default_folders
    AFTER INSERT ON mailboxes
    FOR EACH ROW
    EXECUTE FUNCTION create_default_folders();

-- Update folder counts function
CREATE OR REPLACE FUNCTION update_folder_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE folders SET
            message_count = message_count + 1,
            uid_next = GREATEST(uid_next, NEW.uid + 1),
            highest_modseq = GREATEST(highest_modseq, NEW.modseq),
            recent_count = CASE 
                WHEN NEW.flags::jsonb ? '\Recent' THEN recent_count + 1 
                ELSE recent_count 
            END,
            unseen_count = CASE 
                WHEN NOT (NEW.flags::jsonb ? '\Seen') THEN unseen_count + 1 
                ELSE unseen_count 
            END,
            updated_at = NOW()
        WHERE id = NEW.folder_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE folders SET
            message_count = GREATEST(0, message_count - 1),
            recent_count = CASE 
                WHEN OLD.flags::jsonb ? '\Recent' THEN GREATEST(0, recent_count - 1) 
                ELSE recent_count 
            END,
            unseen_count = CASE 
                WHEN NOT (OLD.flags::jsonb ? '\Seen') THEN GREATEST(0, unseen_count - 1) 
                ELSE unseen_count 
            END,
            updated_at = NOW()
        WHERE id = OLD.folder_id;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_folder_counts
    AFTER INSERT OR DELETE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_folder_counts();

-- Update quota usage function
CREATE OR REPLACE FUNCTION update_quota_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE quotas SET
            storage_used = storage_used + NEW.size,
            message_count = message_count + 1,
            updated_at = NOW()
        WHERE mailbox_id = NEW.mailbox_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE quotas SET
            storage_used = GREATEST(0, storage_used - OLD.size),
            message_count = GREATEST(0, message_count - 1),
            updated_at = NOW()
        WHERE mailbox_id = OLD.mailbox_id;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_quota_usage
    AFTER INSERT OR DELETE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_quota_usage();

-- Create quota when mailbox is created
CREATE OR REPLACE FUNCTION create_default_quota()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO quotas (mailbox_id, storage_limit)
    VALUES (NEW.id, 1073741824); -- 1GB default
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_default_quota
    AFTER INSERT ON mailboxes
    FOR EACH ROW
    EXECUTE FUNCTION create_default_quota();

-- Helper function to get all mailboxes for a user
CREATE OR REPLACE FUNCTION get_user_mailboxes(p_user_id UUID)
RETURNS TABLE (
    mailbox_id UUID,
    email_address VARCHAR,
    domain_name VARCHAR,
    is_primary BOOLEAN,
    namespace_mode VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT m.id, m.email_address, d.name, m.is_primary, m.namespace_mode
    FROM mailboxes m
    JOIN domains d ON m.domain_id = d.id
    WHERE m.user_id = p_user_id AND m.status = 'active'
    ORDER BY m.is_primary DESC, m.created_at;
END;
$$ LANGUAGE sql;

-- Helper function to get shared mailboxes for a user
CREATE OR REPLACE FUNCTION get_shared_mailboxes(p_user_id UUID)
RETURNS TABLE (
    mailbox_id UUID,
    email_address VARCHAR,
    domain_name VARCHAR,
    permissions JSONB,
    display_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT m.id, m.email_address, d.name, s.permissions, s.display_name
    FROM shared_mailbox_access s
    JOIN mailboxes m ON s.mailbox_id = m.id
    JOIN domains d ON m.domain_id = d.id
    WHERE s.user_id = p_user_id 
      AND m.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
    ORDER BY s.display_name, m.email_address;
END;
$$ LANGUAGE sql;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO imap_service;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO imap_service;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO imap_service;
