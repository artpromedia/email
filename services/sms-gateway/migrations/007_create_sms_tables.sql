-- SMS Gateway Database Schema
-- Migration: 007_create_sms_tables.sql

-- SMS Messages Table
CREATE TABLE IF NOT EXISTS sms_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    provider VARCHAR(50) NOT NULL,
    provider_id VARCHAR(255),
    from_number VARCHAR(50),
    to_number VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'transactional',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    segment_count INTEGER DEFAULT 1,
    cost DECIMAL(10, 6) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    error_code VARCHAR(50),
    error_message TEXT,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Indexes for messages
CREATE INDEX idx_sms_messages_organization ON sms_messages(organization_id);
CREATE INDEX idx_sms_messages_user ON sms_messages(user_id);
CREATE INDEX idx_sms_messages_provider ON sms_messages(provider);
CREATE INDEX idx_sms_messages_provider_id ON sms_messages(provider, provider_id);
CREATE INDEX idx_sms_messages_to_number ON sms_messages(to_number);
CREATE INDEX idx_sms_messages_status ON sms_messages(status);
CREATE INDEX idx_sms_messages_created ON sms_messages(created_at DESC);
CREATE INDEX idx_sms_messages_message_type ON sms_messages(message_type);

-- OTP Table
CREATE TABLE IF NOT EXISTS sms_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(50) NOT NULL,
    code VARCHAR(20) NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    message_id UUID REFERENCES sms_messages(id),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- Indexes for OTPs
CREATE INDEX idx_sms_otps_phone ON sms_otps(phone_number);
CREATE INDEX idx_sms_otps_phone_purpose ON sms_otps(phone_number, purpose);
CREATE INDEX idx_sms_otps_user ON sms_otps(user_id);
CREATE INDEX idx_sms_otps_expires ON sms_otps(expires_at);
CREATE INDEX idx_sms_otps_active ON sms_otps(phone_number, purpose, verified, cancelled, expires_at)
    WHERE verified = FALSE AND cancelled = FALSE;

-- Templates Table
CREATE TABLE IF NOT EXISTS sms_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'transactional',
    purpose VARCHAR(50),
    content TEXT NOT NULL,
    variables TEXT[] DEFAULT '{}',
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(organization_id, name)
);

-- Indexes for templates
CREATE INDEX idx_sms_templates_organization ON sms_templates(organization_id);
CREATE INDEX idx_sms_templates_type ON sms_templates(type);
CREATE INDEX idx_sms_templates_purpose ON sms_templates(purpose);
CREATE INDEX idx_sms_templates_active ON sms_templates(organization_id, is_active) WHERE is_active = TRUE;

-- API Keys Table
CREATE TABLE IF NOT EXISTS sms_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    prefix VARCHAR(12) NOT NULL UNIQUE,
    scopes TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    rate_limit_per_minute INTEGER DEFAULT 30,
    rate_limit_per_hour INTEGER DEFAULT 500,
    rate_limit_per_day INTEGER DEFAULT 5000,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Indexes for API keys
CREATE INDEX idx_sms_api_keys_organization ON sms_api_keys(organization_id);
CREATE INDEX idx_sms_api_keys_prefix ON sms_api_keys(prefix) WHERE is_active = TRUE;

-- Delivery Reports Table (for tracking webhook callbacks)
CREATE TABLE IF NOT EXISTS sms_delivery_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES sms_messages(id),
    provider VARCHAR(50) NOT NULL,
    provider_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    status_code VARCHAR(50),
    error_code VARCHAR(50),
    error_message TEXT,
    raw_payload JSONB,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for delivery reports
CREATE INDEX idx_sms_delivery_reports_message ON sms_delivery_reports(message_id);
CREATE INDEX idx_sms_delivery_reports_provider ON sms_delivery_reports(provider, provider_id);

-- Provider Settings Table
CREATE TABLE IF NOT EXISTS sms_provider_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    provider VARCHAR(50) NOT NULL,
    is_enabled BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 10,
    settings JSONB NOT NULL DEFAULT '{}',
    from_numbers TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, provider)
);

-- Analytics/Usage Table (for billing and reporting)
CREATE TABLE IF NOT EXISTS sms_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    provider VARCHAR(50) NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_segments INTEGER DEFAULT 0,
    total_cost DECIMAL(12, 6) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, period_start, period_end, provider, message_type)
);

-- Index for usage
CREATE INDEX idx_sms_usage_organization ON sms_usage(organization_id);
CREATE INDEX idx_sms_usage_period ON sms_usage(period_start, period_end);

-- Phone Number Verification Table (for sender ID verification)
CREATE TABLE IF NOT EXISTS sms_verified_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    phone_number VARCHAR(50) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(20),
    verification_expires_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, phone_number)
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_sms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sms_messages_updated_at
    BEFORE UPDATE ON sms_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_sms_updated_at();

CREATE TRIGGER trigger_sms_templates_updated_at
    BEFORE UPDATE ON sms_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_sms_updated_at();

CREATE TRIGGER trigger_sms_provider_settings_updated_at
    BEFORE UPDATE ON sms_provider_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_sms_updated_at();

-- Comments
COMMENT ON TABLE sms_messages IS 'Stores all SMS messages sent through the gateway';
COMMENT ON TABLE sms_otps IS 'Stores OTP verification requests';
COMMENT ON TABLE sms_templates IS 'Message templates for transactional and OTP messages';
COMMENT ON TABLE sms_api_keys IS 'API keys for authenticating SMS gateway requests';
COMMENT ON TABLE sms_delivery_reports IS 'Stores delivery status webhooks from providers';
COMMENT ON TABLE sms_provider_settings IS 'Per-organization SMS provider configurations';
COMMENT ON TABLE sms_usage IS 'Aggregated usage statistics for billing';
COMMENT ON TABLE sms_verified_numbers IS 'Phone numbers verified for use as sender IDs';
