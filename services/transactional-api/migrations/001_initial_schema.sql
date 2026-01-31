-- Transactional Email API Schema
-- Migration: 001_initial_schema.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- API Keys Table
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL,
    key_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash of the API key
    key_prefix VARCHAR(12) NOT NULL,  -- First 8 chars + "..." for identification
    name VARCHAR(100) NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT ARRAY['send'],
    rate_limit INTEGER NOT NULL DEFAULT 1000,  -- Requests per minute
    daily_limit INTEGER NOT NULL DEFAULT 100000,  -- Requests per day
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    created_by UUID NOT NULL,
    metadata JSONB DEFAULT '{}',
    CONSTRAINT api_keys_key_hash_unique UNIQUE (key_hash)
);

CREATE INDEX idx_api_keys_domain_id ON api_keys(domain_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_created_at ON api_keys(created_at);
CREATE INDEX idx_api_keys_revoked_at ON api_keys(revoked_at) WHERE revoked_at IS NULL;

-- ============================================
-- API Key Usage Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS api_key_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    request_count BIGINT NOT NULL DEFAULT 0,
    emails_sent BIGINT NOT NULL DEFAULT 0,
    emails_delivered BIGINT NOT NULL DEFAULT 0,
    emails_bounced BIGINT NOT NULL DEFAULT 0,
    last_request_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT api_key_usage_unique UNIQUE (key_id, date)
);

CREATE INDEX idx_api_key_usage_key_id ON api_key_usage(key_id);
CREATE INDEX idx_api_key_usage_date ON api_key_usage(date);

-- ============================================
-- Email Templates Table
-- ============================================
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    subject VARCHAR(998) NOT NULL,
    html_content TEXT,
    text_content TEXT,
    variables JSONB DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT true,
    category VARCHAR(100),
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}',
    thumbnail_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,
    CONSTRAINT email_templates_domain_name_unique UNIQUE (domain_id, name)
);

CREATE INDEX idx_email_templates_domain_id ON email_templates(domain_id);
CREATE INDEX idx_email_templates_name ON email_templates(name);
CREATE INDEX idx_email_templates_category ON email_templates(category);
CREATE INDEX idx_email_templates_active ON email_templates(active);
CREATE INDEX idx_email_templates_tags ON email_templates USING GIN(tags);
CREATE INDEX idx_email_templates_created_at ON email_templates(created_at);

-- ============================================
-- Template Versions (History)
-- ============================================
CREATE TABLE IF NOT EXISTS template_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    subject VARCHAR(998) NOT NULL,
    html_content TEXT,
    text_content TEXT,
    variables JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL,
    change_note VARCHAR(500),
    CONSTRAINT template_versions_unique UNIQUE (template_id, version)
);

CREATE INDEX idx_template_versions_template_id ON template_versions(template_id);
CREATE INDEX idx_template_versions_created_at ON template_versions(created_at);

-- ============================================
-- Webhooks Table
-- ============================================
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL,
    url VARCHAR(500) NOT NULL,
    events TEXT[] NOT NULL,
    secret VARCHAR(64),  -- For HMAC signature verification
    secret_prefix VARCHAR(12),
    active BOOLEAN NOT NULL DEFAULT true,
    description VARCHAR(500),
    headers JSONB DEFAULT '{}',
    retry_policy JSONB DEFAULT '{"max_retries": 5, "retry_interval": 30, "backoff_multiplier": 2, "max_interval": 3600}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_triggered_at TIMESTAMPTZ,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);

CREATE INDEX idx_webhooks_domain_id ON webhooks(domain_id);
CREATE INDEX idx_webhooks_active ON webhooks(active);
CREATE INDEX idx_webhooks_events ON webhooks USING GIN(events);

-- ============================================
-- Messages Table (Sent Emails)
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    message_id VARCHAR(255) NOT NULL,  -- External message ID
    from_address VARCHAR(255) NOT NULL,
    to_addresses TEXT[] NOT NULL,
    cc_addresses TEXT[] DEFAULT ARRAY[]::TEXT[],
    bcc_addresses TEXT[] DEFAULT ARRAY[]::TEXT[],
    reply_to VARCHAR(255),
    subject VARCHAR(998) NOT NULL,
    html_content TEXT,
    text_content TEXT,
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    categories TEXT[] DEFAULT ARRAY[]::TEXT[],
    custom_args JSONB DEFAULT '{}',
    headers JSONB DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    track_opens BOOLEAN NOT NULL DEFAULT true,
    track_clicks BOOLEAN NOT NULL DEFAULT true,
    scheduled_at TIMESTAMPTZ,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    bounced_at TIMESTAMPTZ,
    bounce_reason TEXT,
    smtp_response TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_domain_id ON messages(domain_id);
CREATE INDEX idx_messages_api_key_id ON messages(api_key_id);
CREATE INDEX idx_messages_message_id ON messages(message_id);
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_from_address ON messages(from_address);
CREATE INDEX idx_messages_categories ON messages USING GIN(categories);
CREATE INDEX idx_messages_queued_at ON messages(queued_at);
CREATE INDEX idx_messages_sent_at ON messages(sent_at);
CREATE INDEX idx_messages_scheduled_at ON messages(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Partial indexes for common queries
CREATE INDEX idx_messages_pending ON messages(queued_at) WHERE status = 'queued';
CREATE INDEX idx_messages_scheduled ON messages(scheduled_at) WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;

-- ============================================
-- Email Events Table
-- ============================================
CREATE TABLE IF NOT EXISTS email_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    smtp_response TEXT,
    bounce_type VARCHAR(20),
    bounce_code VARCHAR(50),
    user_agent TEXT,
    ip_address INET,
    url TEXT,
    geo JSONB,
    device JSONB,
    webhook_sent BOOLEAN NOT NULL DEFAULT false,
    webhook_sent_at TIMESTAMPTZ,
    categories TEXT[] DEFAULT ARRAY[]::TEXT[],
    custom_args JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_events_message_id ON email_events(message_id);
CREATE INDEX idx_email_events_domain_id ON email_events(domain_id);
CREATE INDEX idx_email_events_event_type ON email_events(event_type);
CREATE INDEX idx_email_events_recipient ON email_events(recipient);
CREATE INDEX idx_email_events_timestamp ON email_events(timestamp);
CREATE INDEX idx_email_events_webhook_sent ON email_events(webhook_sent) WHERE webhook_sent = false;
CREATE INDEX idx_email_events_categories ON email_events USING GIN(categories);

-- Composite indexes for analytics queries
CREATE INDEX idx_email_events_domain_type_time ON email_events(domain_id, event_type, timestamp);
CREATE INDEX idx_email_events_domain_time ON email_events(domain_id, timestamp);

-- ============================================
-- Webhook Deliveries Table
-- ============================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES email_events(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    url VARCHAR(500) NOT NULL,
    request_body TEXT,
    response_code INTEGER,
    response_body TEXT,
    success BOOLEAN NOT NULL DEFAULT false,
    error TEXT,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_event_id ON webhook_deliveries(event_id);
CREATE INDEX idx_webhook_deliveries_success ON webhook_deliveries(success);
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);

-- ============================================
-- Suppressions Table
-- ============================================
CREATE TABLE IF NOT EXISTS suppressions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    reason VARCHAR(50) NOT NULL,  -- bounce, unsubscribe, spam_complaint, manual, invalid
    bounce_class VARCHAR(20),  -- hard, soft, block
    description TEXT,
    original_error TEXT,
    source VARCHAR(50) DEFAULT 'api',  -- api, webhook, smtp
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_by UUID,
    CONSTRAINT suppressions_domain_email_unique UNIQUE (domain_id, email)
);

CREATE INDEX idx_suppressions_domain_id ON suppressions(domain_id);
CREATE INDEX idx_suppressions_email ON suppressions(email);
CREATE INDEX idx_suppressions_reason ON suppressions(reason);
CREATE INDEX idx_suppressions_created_at ON suppressions(created_at);
CREATE INDEX idx_suppressions_expires_at ON suppressions(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================
-- Unsubscribe Groups Table
-- ============================================
CREATE TABLE IF NOT EXISTS unsubscribe_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unsubscribe_groups_domain_name_unique UNIQUE (domain_id, name)
);

CREATE INDEX idx_unsubscribe_groups_domain_id ON unsubscribe_groups(domain_id);

-- ============================================
-- Group Suppressions Table
-- ============================================
CREATE TABLE IF NOT EXISTS group_suppressions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES unsubscribe_groups(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT group_suppressions_unique UNIQUE (group_id, email)
);

CREATE INDEX idx_group_suppressions_group_id ON group_suppressions(group_id);
CREATE INDEX idx_group_suppressions_email ON group_suppressions(email);

-- ============================================
-- Click Tracking Table
-- ============================================
CREATE TABLE IF NOT EXISTS tracked_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    original_url TEXT NOT NULL,
    tracking_url VARCHAR(500) NOT NULL,
    link_index INTEGER NOT NULL,
    click_count INTEGER NOT NULL DEFAULT 0,
    unique_click_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tracked_links_message_id ON tracked_links(message_id);
CREATE INDEX idx_tracked_links_tracking_url ON tracked_links(tracking_url);

-- ============================================
-- Aggregated Stats Table (for faster analytics)
-- ============================================
CREATE TABLE IF NOT EXISTS daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL,
    date DATE NOT NULL,
    category VARCHAR(100),
    sent BIGINT NOT NULL DEFAULT 0,
    delivered BIGINT NOT NULL DEFAULT 0,
    bounced BIGINT NOT NULL DEFAULT 0,
    hard_bounced BIGINT NOT NULL DEFAULT 0,
    soft_bounced BIGINT NOT NULL DEFAULT 0,
    opened BIGINT NOT NULL DEFAULT 0,
    unique_opened BIGINT NOT NULL DEFAULT 0,
    clicked BIGINT NOT NULL DEFAULT 0,
    unique_clicked BIGINT NOT NULL DEFAULT 0,
    spam_reports BIGINT NOT NULL DEFAULT 0,
    unsubscribed BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT daily_stats_unique UNIQUE (domain_id, date, category)
);

CREATE INDEX idx_daily_stats_domain_id ON daily_stats(domain_id);
CREATE INDEX idx_daily_stats_date ON daily_stats(date);
CREATE INDEX idx_daily_stats_category ON daily_stats(category);
CREATE INDEX idx_daily_stats_domain_date ON daily_stats(domain_id, date);

-- ============================================
-- Functions and Triggers
-- ============================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_unsubscribe_groups_updated_at
    BEFORE UPDATE ON unsubscribe_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_key_usage_updated_at
    BEFORE UPDATE ON api_key_usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_stats_updated_at
    BEFORE UPDATE ON daily_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to increment daily stats
CREATE OR REPLACE FUNCTION increment_daily_stat(
    p_domain_id UUID,
    p_date DATE,
    p_category VARCHAR(100),
    p_stat VARCHAR(50)
)
RETURNS VOID AS $$
DECLARE
    update_query TEXT;
BEGIN
    -- Build the update query dynamically
    update_query := format(
        'INSERT INTO daily_stats (domain_id, date, category, %I)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (domain_id, date, category)
         DO UPDATE SET %I = daily_stats.%I + 1',
        p_stat, p_stat, p_stat
    );

    EXECUTE update_query USING p_domain_id, p_date, p_category;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Views
-- ============================================

-- View for active API keys with usage summary
CREATE OR REPLACE VIEW active_api_keys_summary AS
SELECT
    ak.id,
    ak.domain_id,
    ak.key_prefix,
    ak.name,
    ak.scopes,
    ak.rate_limit,
    ak.daily_limit,
    ak.last_used_at,
    ak.created_at,
    COALESCE(u.total_requests, 0) as total_requests_30d,
    COALESCE(u.total_emails, 0) as total_emails_30d
FROM api_keys ak
LEFT JOIN (
    SELECT
        key_id,
        SUM(request_count) as total_requests,
        SUM(emails_sent) as total_emails
    FROM api_key_usage
    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY key_id
) u ON ak.id = u.key_id
WHERE ak.revoked_at IS NULL
  AND (ak.expires_at IS NULL OR ak.expires_at > NOW());

-- View for suppression counts by domain
CREATE OR REPLACE VIEW suppression_counts AS
SELECT
    domain_id,
    reason,
    COUNT(*) as count
FROM suppressions
GROUP BY domain_id, reason;

-- ============================================
-- Seed Data - Default Templates
-- ============================================

-- Note: These should be inserted per-domain when a domain is created
-- This is a reference for the template structure

COMMENT ON TABLE api_keys IS 'API keys for authenticating transactional email requests';
COMMENT ON TABLE email_templates IS 'Email templates with variable substitution support';
COMMENT ON TABLE webhooks IS 'Webhook configurations for delivery event notifications';
COMMENT ON TABLE messages IS 'Sent email messages and their metadata';
COMMENT ON TABLE email_events IS 'Email delivery and engagement events';
COMMENT ON TABLE suppressions IS 'Suppressed email addresses (bounces, unsubscribes, spam)';
COMMENT ON TABLE daily_stats IS 'Pre-aggregated daily statistics for fast analytics queries';
