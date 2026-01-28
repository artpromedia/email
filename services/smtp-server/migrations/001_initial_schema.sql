-- Database schema for SMTP server
-- Domains table
CREATE TABLE IF NOT EXISTS domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    is_primary BOOLEAN NOT NULL DEFAULT false,
    mx_verified BOOLEAN NOT NULL DEFAULT false,
    spf_verified BOOLEAN NOT NULL DEFAULT false,
    dkim_verified BOOLEAN NOT NULL DEFAULT false,
    dmarc_verified BOOLEAN NOT NULL DEFAULT false,
    catch_all_enabled BOOLEAN NOT NULL DEFAULT false,
    catch_all_address VARCHAR(255),
    max_message_size BIGINT NOT NULL DEFAULT 26214400,
    require_tls BOOLEAN NOT NULL DEFAULT true,
    allow_external_relay BOOLEAN NOT NULL DEFAULT true,
    rate_limit_per_hour INTEGER NOT NULL DEFAULT 1000,
    rate_limit_per_day INTEGER NOT NULL DEFAULT 10000,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_primary_per_org UNIQUE (organization_id, is_primary) WHERE is_primary = true
);

CREATE INDEX idx_domains_organization ON domains(organization_id);
CREATE INDEX idx_domains_name ON domains(name);
CREATE INDEX idx_domains_status ON domains(status);

-- DKIM keys table
CREATE TABLE IF NOT EXISTS dkim_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    selector VARCHAR(63) NOT NULL,
    private_key TEXT NOT NULL,
    public_key TEXT NOT NULL,
    algorithm VARCHAR(20) NOT NULL DEFAULT 'rsa-sha256',
    key_size INTEGER NOT NULL DEFAULT 2048,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    rotated_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_selector_per_domain UNIQUE (domain_id, selector)
);

CREATE INDEX idx_dkim_keys_domain ON dkim_keys(domain_id);
CREATE INDEX idx_dkim_keys_active ON dkim_keys(domain_id, is_active) WHERE is_active = true;

-- Mailboxes table
CREATE TABLE IF NOT EXISTS mailboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    local_part VARCHAR(64) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    storage_quota_bytes BIGINT NOT NULL DEFAULT 10737418240, -- 10GB
    storage_used_bytes BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
    auto_reply_subject VARCHAR(255),
    auto_reply_body TEXT,
    auto_reply_start TIMESTAMP WITH TIME ZONE,
    auto_reply_end TIMESTAMP WITH TIME ZONE,
    forward_enabled BOOLEAN NOT NULL DEFAULT false,
    forward_address VARCHAR(255),
    forward_keep_copy BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_localpart_per_domain UNIQUE (domain_id, local_part)
);

CREATE INDEX idx_mailboxes_user ON mailboxes(user_id);
CREATE INDEX idx_mailboxes_domain ON mailboxes(domain_id);
CREATE INDEX idx_mailboxes_email ON mailboxes(email);

-- Aliases table
CREATE TABLE IF NOT EXISTS aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    source_email VARCHAR(255) NOT NULL,
    target_email VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aliases_source ON aliases(source_email);
CREATE INDEX idx_aliases_target ON aliases(target_email);
CREATE INDEX idx_aliases_domain ON aliases(domain_id);

-- Distribution lists table
CREATE TABLE IF NOT EXISTS distribution_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    members_only BOOLEAN NOT NULL DEFAULT false,
    moderated BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_distribution_lists_email ON distribution_lists(email);
CREATE INDEX idx_distribution_lists_domain ON distribution_lists(domain_id);

-- Distribution list members
CREATE TABLE IF NOT EXISTS distribution_list_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES distribution_lists(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_member_per_list UNIQUE (list_id, email)
);

CREATE INDEX idx_distribution_list_members_list ON distribution_list_members(list_id);

-- Distribution list moderators
CREATE TABLE IF NOT EXISTS distribution_list_moderators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES distribution_lists(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_moderator_per_list UNIQUE (list_id, email)
);

-- Routing rules table
CREATE TABLE IF NOT EXISTS routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Conditions
    condition_sender_pattern VARCHAR(255),
    condition_recipient_pattern VARCHAR(255),
    condition_subject_pattern VARCHAR(255),
    condition_header_name VARCHAR(255),
    condition_header_pattern VARCHAR(255),
    condition_size_min BIGINT,
    condition_size_max BIGINT,
    condition_has_attachment BOOLEAN,
    -- Actions
    action_type VARCHAR(50) NOT NULL,
    action_target VARCHAR(255),
    action_rewrite_from VARCHAR(255),
    action_rewrite_to VARCHAR(255),
    action_add_header_name VARCHAR(255),
    action_add_header_value TEXT,
    action_reject_message VARCHAR(500),
    action_quarantine_reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_routing_rules_domain ON routing_rules(domain_id);
CREATE INDEX idx_routing_rules_priority ON routing_rules(domain_id, priority);

-- User domain permissions
CREATE TABLE IF NOT EXISTS user_domain_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    can_send BOOLEAN NOT NULL DEFAULT true,
    can_send_as BOOLEAN NOT NULL DEFAULT false,
    allowed_send_as_addresses TEXT[],
    daily_send_limit INTEGER NOT NULL DEFAULT 500,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_domain_permission UNIQUE (user_id, domain_id)
);

CREATE INDEX idx_user_domain_permissions_user ON user_domain_permissions(user_id);
CREATE INDEX idx_user_domain_permissions_domain ON user_domain_permissions(domain_id);

-- Message queue table
CREATE TABLE IF NOT EXISTS message_queue (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    domain_id UUID NOT NULL,
    from_address VARCHAR(255) NOT NULL,
    recipients JSONB NOT NULL,
    subject VARCHAR(998),
    headers JSONB NOT NULL DEFAULT '{}',
    body_size BIGINT NOT NULL,
    raw_message_path VARCHAR(500) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 1,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_message_queue_status ON message_queue(status);
CREATE INDEX idx_message_queue_domain ON message_queue(domain_id);
CREATE INDEX idx_message_queue_pending ON message_queue(status, next_retry_at) 
    WHERE status = 'pending';
CREATE INDEX idx_message_queue_created ON message_queue(created_at);

-- Notification triggers for cache invalidation
CREATE OR REPLACE FUNCTION notify_domain_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('domain_changes', 
        TG_TABLE_NAME || ':' || TG_OP || ':' || COALESCE(NEW.id::text, OLD.id::text));
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER domain_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON domains
FOR EACH ROW EXECUTE FUNCTION notify_domain_change();

CREATE TRIGGER dkim_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON dkim_keys
FOR EACH ROW EXECUTE FUNCTION notify_domain_change();

CREATE TRIGGER mailbox_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON mailboxes
FOR EACH ROW EXECUTE FUNCTION notify_domain_change();

CREATE TRIGGER alias_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON aliases
FOR EACH ROW EXECUTE FUNCTION notify_domain_change();

CREATE TRIGGER routing_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON routing_rules
FOR EACH ROW EXECUTE FUNCTION notify_domain_change();

CREATE TRIGGER permission_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON user_domain_permissions
FOR EACH ROW EXECUTE FUNCTION notify_domain_change();
