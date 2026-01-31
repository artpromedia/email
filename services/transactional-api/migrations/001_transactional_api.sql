-- Transactional Email API Database Schema
-- Migration: 001_transactional_api.sql

-- API Keys for authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_prefix VARCHAR(12) NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    rate_limit INTEGER NOT NULL DEFAULT 1000,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

-- Transactional emails
CREATE TABLE IF NOT EXISTS transactional_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    message_id VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    to_emails TEXT[] NOT NULL,
    cc_emails TEXT[] DEFAULT '{}',
    bcc_emails TEXT[] DEFAULT '{}',
    subject TEXT NOT NULL,
    text_body TEXT,
    html_body TEXT,
    headers JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    ip_pool VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    track_opens BOOLEAN NOT NULL DEFAULT true,
    track_clicks BOOLEAN NOT NULL DEFAULT true,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trans_emails_org ON transactional_emails(organization_id);
CREATE INDEX idx_trans_emails_message_id ON transactional_emails(message_id);
CREATE INDEX idx_trans_emails_status ON transactional_emails(status);
CREATE INDEX idx_trans_emails_scheduled ON transactional_emails(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_trans_emails_created ON transactional_emails(organization_id, created_at DESC);

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    subject TEXT NOT NULL,
    text_body TEXT,
    html_body TEXT,
    variables TEXT[] DEFAULT '{}',
    active_version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE INDEX idx_templates_org ON email_templates(organization_id);
CREATE INDEX idx_templates_name ON email_templates(organization_id, name);

-- Template versions (for history/rollback)
CREATE TABLE IF NOT EXISTS email_template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    subject TEXT NOT NULL,
    text_body TEXT,
    html_body TEXT,
    variables TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID,
    UNIQUE(template_id, version)
);

CREATE INDEX idx_template_versions ON email_template_versions(template_id, version DESC);

-- Webhooks
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    secret VARCHAR(64) NOT NULL,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_triggered TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_org ON webhooks(organization_id);
CREATE INDEX idx_webhooks_events ON webhooks USING GIN(events);
CREATE INDEX idx_webhooks_active ON webhooks(organization_id, is_active) WHERE is_active = true;

-- Email events (delivery, open, click, bounce, etc.)
CREATE TABLE IF NOT EXISTS email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL,
    event_type VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    user_agent TEXT,
    ip_address INET,
    url TEXT,
    bounce_type VARCHAR(20),
    bounce_reason TEXT
);

CREATE INDEX idx_events_org ON email_events(organization_id);
CREATE INDEX idx_events_message ON email_events(message_id);
CREATE INDEX idx_events_type ON email_events(organization_id, event_type);
CREATE INDEX idx_events_timestamp ON email_events(organization_id, timestamp DESC);
CREATE INDEX idx_events_recipient ON email_events(organization_id, recipient);

-- Partition email_events by month for performance (optional - for high volume)
-- CREATE TABLE email_events_y2026m01 PARTITION OF email_events
--     FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Suppressions (bounces, unsubscribes, spam reports)
CREATE TABLE IF NOT EXISTS suppressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL, -- bounce, unsubscribe, spam_report, manual
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, email, type)
);

CREATE INDEX idx_suppressions_org ON suppressions(organization_id);
CREATE INDEX idx_suppressions_email ON suppressions(organization_id, email);
CREATE INDEX idx_suppressions_type ON suppressions(organization_id, type);

-- Tracking pixel/click tracking links
CREATE TABLE IF NOT EXISTS tracking_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL,
    original_url TEXT NOT NULL,
    tracking_url TEXT NOT NULL,
    click_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tracking_message ON tracking_links(message_id);
CREATE INDEX idx_tracking_url ON tracking_links(tracking_url);

-- Update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactional_emails_updated_at BEFORE UPDATE ON transactional_emails
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
