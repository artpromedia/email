-- Domain Manager Database Migrations
-- Version: 001
-- Description: Initial schema for domain management

-- Domains table
CREATE TABLE IF NOT EXISTS domains (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_verification',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token VARCHAR(255) NOT NULL,
    mx_verified BOOLEAN NOT NULL DEFAULT FALSE,
    spf_verified BOOLEAN NOT NULL DEFAULT FALSE,
    dkim_verified BOOLEAN NOT NULL DEFAULT FALSE,
    dmarc_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE,
    last_dns_check TIMESTAMP WITH TIME ZONE
);

-- Create indexes for domains
CREATE INDEX IF NOT EXISTS idx_domains_organization_id ON domains(organization_id);
CREATE INDEX IF NOT EXISTS idx_domains_name ON domains(name);
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
CREATE INDEX IF NOT EXISTS idx_domains_last_dns_check ON domains(last_dns_check);

-- DKIM keys table
CREATE TABLE IF NOT EXISTS dkim_keys (
    id UUID PRIMARY KEY,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    selector VARCHAR(63) NOT NULL,
    algorithm VARCHAR(20) NOT NULL DEFAULT 'rsa-sha256',
    key_size INTEGER NOT NULL DEFAULT 2048,
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    rotated_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(domain_id, selector)
);

-- Create indexes for DKIM keys
CREATE INDEX IF NOT EXISTS idx_dkim_keys_domain_id ON dkim_keys(domain_id);
CREATE INDEX IF NOT EXISTS idx_dkim_keys_is_active ON dkim_keys(is_active);

-- Domain branding table
CREATE TABLE IF NOT EXISTS domain_branding (
    id UUID PRIMARY KEY,
    domain_id UUID NOT NULL UNIQUE REFERENCES domains(id) ON DELETE CASCADE,
    logo_url VARCHAR(500),
    favicon_url VARCHAR(500),
    primary_color VARCHAR(20),
    login_background_url VARCHAR(500),
    email_header_html TEXT,
    email_footer_html TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for branding
CREATE INDEX IF NOT EXISTS idx_domain_branding_domain_id ON domain_branding(domain_id);

-- Domain policies table
CREATE TABLE IF NOT EXISTS domain_policies (
    id UUID PRIMARY KEY,
    domain_id UUID NOT NULL UNIQUE REFERENCES domains(id) ON DELETE CASCADE,
    max_message_size_bytes BIGINT NOT NULL DEFAULT 26214400,  -- 25MB
    max_recipients_per_message INTEGER NOT NULL DEFAULT 100,
    max_messages_per_day_per_user INTEGER NOT NULL DEFAULT 1000,
    require_tls_outbound BOOLEAN NOT NULL DEFAULT FALSE,
    allowed_recipient_domains JSONB,
    blocked_recipient_domains JSONB,
    auto_bcc_address VARCHAR(255),
    default_signature_enforced BOOLEAN NOT NULL DEFAULT FALSE,
    attachment_policy JSONB,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for policies
CREATE INDEX IF NOT EXISTS idx_domain_policies_domain_id ON domain_policies(domain_id);

-- Domain catch-all configuration table
CREATE TABLE IF NOT EXISTS domain_catch_all (
    id UUID PRIMARY KEY,
    domain_id UUID NOT NULL UNIQUE REFERENCES domains(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    action VARCHAR(20) NOT NULL DEFAULT 'reject',  -- deliver, forward, reject
    deliver_to VARCHAR(255),  -- mailbox to deliver to
    forward_to VARCHAR(255),  -- address to forward to
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for catch-all
CREATE INDEX IF NOT EXISTS idx_domain_catch_all_domain_id ON domain_catch_all(domain_id);

-- Mailboxes table (reference for statistics)
CREATE TABLE IF NOT EXISTS mailboxes (
    id UUID PRIMARY KEY,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    quota_bytes BIGINT NOT NULL DEFAULT 5368709120,  -- 5GB
    storage_used_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for mailboxes
CREATE INDEX IF NOT EXISTS idx_mailboxes_domain_id ON mailboxes(domain_id);
CREATE INDEX IF NOT EXISTS idx_mailboxes_user_id ON mailboxes(user_id);
CREATE INDEX IF NOT EXISTS idx_mailboxes_email ON mailboxes(email);

-- Aliases table (reference for statistics)
CREATE TABLE IF NOT EXISTS aliases (
    id UUID PRIMARY KEY,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    alias_address VARCHAR(255) NOT NULL UNIQUE,
    destination_address VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for aliases
CREATE INDEX IF NOT EXISTS idx_aliases_domain_id ON aliases(domain_id);
CREATE INDEX IF NOT EXISTS idx_aliases_alias_address ON aliases(alias_address);

-- Message queue table (reference for statistics)
CREATE TABLE IF NOT EXISTS message_queue (
    id UUID PRIMARY KEY,
    domain_id UUID NOT NULL,
    sender VARCHAR(255) NOT NULL,
    recipients JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, processing, delivered, failed
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- Create indexes for message queue
CREATE INDEX IF NOT EXISTS idx_message_queue_domain_id ON message_queue(domain_id);
CREATE INDEX IF NOT EXISTS idx_message_queue_status ON message_queue(status);
CREATE INDEX IF NOT EXISTS idx_message_queue_created_at ON message_queue(created_at);

-- DNS monitoring alerts table
CREATE TABLE IF NOT EXISTS dns_monitor_alerts (
    id VARCHAR(30) PRIMARY KEY,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    domain_name VARCHAR(255) NOT NULL,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for alerts
CREATE INDEX IF NOT EXISTS idx_dns_monitor_alerts_domain_id ON dns_monitor_alerts(domain_id);
CREATE INDEX IF NOT EXISTS idx_dns_monitor_alerts_detected_at ON dns_monitor_alerts(detected_at);
CREATE INDEX IF NOT EXISTS idx_dns_monitor_alerts_resolved_at ON dns_monitor_alerts(resolved_at) WHERE resolved_at IS NULL;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_domains_updated_at BEFORE UPDATE ON domains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domain_branding_updated_at BEFORE UPDATE ON domain_branding
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domain_policies_updated_at BEFORE UPDATE ON domain_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domain_catch_all_updated_at BEFORE UPDATE ON domain_catch_all
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mailboxes_updated_at BEFORE UPDATE ON mailboxes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
