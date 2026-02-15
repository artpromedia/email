-- Migration: Add bounce tracking table
-- Tracks delivery failures for analytics, reputation management, and compliance

CREATE TABLE IF NOT EXISTS bounces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_message_id VARCHAR(255),
    bounce_type VARCHAR(20) NOT NULL,        -- hard, soft, policy, network
    category VARCHAR(30) NOT NULL DEFAULT 'unknown', -- address_failure, mailbox_full, spam_rejection, etc.
    recipient_email VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255),
    domain_id UUID REFERENCES domains(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    smtp_code INTEGER,
    enhanced_status VARCHAR(10),              -- RFC 3463 enhanced status code (e.g., "5.1.1")
    diagnostic_message TEXT,
    remote_mta VARCHAR(255),
    is_permanent BOOLEAN NOT NULL DEFAULT true,
    recommended_action VARCHAR(50),           -- remove_address, retry_later, notify_admin, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_bounces_recipient ON bounces(recipient_email);
CREATE INDEX idx_bounces_sender ON bounces(sender_email) WHERE sender_email IS NOT NULL;
CREATE INDEX idx_bounces_domain ON bounces(domain_id) WHERE domain_id IS NOT NULL;
CREATE INDEX idx_bounces_organization ON bounces(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_bounces_type ON bounces(bounce_type);
CREATE INDEX idx_bounces_category ON bounces(category);
CREATE INDEX idx_bounces_created ON bounces(created_at);
CREATE INDEX idx_bounces_original_msg ON bounces(original_message_id) WHERE original_message_id IS NOT NULL;

-- Composite index for bounce rate queries per domain
CREATE INDEX idx_bounces_domain_time ON bounces(domain_id, created_at DESC);

-- Composite index for recipient bounce history (for suppression list logic)
CREATE INDEX idx_bounces_recipient_perm ON bounces(recipient_email, created_at DESC) WHERE is_permanent = true;

-- View for bounce rate aggregation per domain (last 24 hours)
CREATE OR REPLACE VIEW bounce_rates_24h AS
SELECT
    domain_id,
    COUNT(*) AS total_bounces,
    COUNT(*) FILTER (WHERE bounce_type = 'hard') AS hard_bounces,
    COUNT(*) FILTER (WHERE bounce_type = 'soft') AS soft_bounces,
    COUNT(*) FILTER (WHERE bounce_type = 'policy') AS policy_bounces,
    COUNT(*) FILTER (WHERE category = 'address_failure') AS address_failures,
    COUNT(*) FILTER (WHERE category = 'spam_rejection') AS spam_rejections,
    MIN(created_at) AS first_bounce,
    MAX(created_at) AS last_bounce
FROM bounces
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY domain_id;

-- Comment on table
COMMENT ON TABLE bounces IS 'Tracks email delivery failures (bounces) for analytics, reputation management, and RFC 3461-3464 compliance';
COMMENT ON COLUMN bounces.bounce_type IS 'Type: hard (permanent), soft (temporary), policy (content/sender rejection), network (connectivity)';
COMMENT ON COLUMN bounces.category IS 'Detailed category: address_failure, mailbox_full, content_rejection, spam_rejection, network_failure, auth_failure, rate_limit, server_error, unknown';
COMMENT ON COLUMN bounces.enhanced_status IS 'RFC 3463 enhanced status code (e.g., 5.1.1 = bad destination mailbox)';
COMMENT ON COLUMN bounces.recommended_action IS 'Suggested action: remove_address, retry_later, notify_admin, check_reputation, check_config, notify_sender';
