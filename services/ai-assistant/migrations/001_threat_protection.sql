-- Threat Protection Database Schema
-- Migration: 001_threat_protection.sql

-- ============================================================
-- SENDER REPUTATION TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS sender_reputation (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL,
    domain          VARCHAR(255) NOT NULL,
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Email counters
    total_emails    BIGINT DEFAULT 0,
    spam_count      BIGINT DEFAULT 0,
    phishing_count  BIGINT DEFAULT 0,
    ham_count       BIGINT DEFAULT 0,
    bounce_count    BIGINT DEFAULT 0,

    -- User feedback counters
    user_spam_reports    INT DEFAULT 0,
    user_safe_reports    INT DEFAULT 0,
    user_phish_reports   INT DEFAULT 0,

    -- Engagement metrics
    open_count      BIGINT DEFAULT 0,
    click_count     BIGINT DEFAULT 0,
    reply_count     BIGINT DEFAULT 0,

    -- Calculated scores
    reputation_score    DECIMAL(5,4) DEFAULT 0.5000,
    trust_level         VARCHAR(20) DEFAULT 'neutral' CHECK (trust_level IN ('vip', 'trusted', 'neutral', 'suspicious', 'blocked')),
    risk_level          VARCHAR(20) DEFAULT 'unknown' CHECK (risk_level IN ('low', 'medium', 'high', 'critical', 'unknown')),

    -- Score history (JSON array of recent scores)
    score_history       JSONB DEFAULT '[]'::jsonb,

    -- Timestamps
    first_seen      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_updated    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Unique constraint per sender per org
    UNIQUE(email, org_id)
);

-- Indexes for sender_reputation
CREATE INDEX idx_sender_reputation_email ON sender_reputation(email);
CREATE INDEX idx_sender_reputation_domain ON sender_reputation(domain);
CREATE INDEX idx_sender_reputation_org_id ON sender_reputation(org_id);
CREATE INDEX idx_sender_reputation_trust_level ON sender_reputation(trust_level);
CREATE INDEX idx_sender_reputation_risk_level ON sender_reputation(risk_level);
CREATE INDEX idx_sender_reputation_score ON sender_reputation(reputation_score);
CREATE INDEX idx_sender_reputation_last_seen ON sender_reputation(last_seen DESC);

-- ============================================================
-- DOMAIN REPUTATION TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS domain_reputation (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain          VARCHAR(255) NOT NULL,
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Aggregated stats
    total_senders   INT DEFAULT 0,
    total_emails    BIGINT DEFAULT 0,
    spam_count      BIGINT DEFAULT 0,
    phishing_count  BIGINT DEFAULT 0,
    ham_count       BIGINT DEFAULT 0,

    -- Calculated scores
    reputation_score    DECIMAL(5,4) DEFAULT 0.5000,
    spam_rate           DECIMAL(5,4) DEFAULT 0.0000,
    phish_rate          DECIMAL(5,4) DEFAULT 0.0000,

    -- Domain info
    has_spf         BOOLEAN DEFAULT FALSE,
    has_dkim        BOOLEAN DEFAULT FALSE,
    has_dmarc       BOOLEAN DEFAULT FALSE,

    -- Timestamps
    first_seen      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_updated    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(domain, org_id)
);

CREATE INDEX idx_domain_reputation_domain ON domain_reputation(domain);
CREATE INDEX idx_domain_reputation_org_id ON domain_reputation(org_id);
CREATE INDEX idx_domain_reputation_score ON domain_reputation(reputation_score);

-- ============================================================
-- USER FEEDBACK TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS user_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id        UUID NOT NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Feedback type
    feedback_type   VARCHAR(30) NOT NULL CHECK (feedback_type IN ('spam', 'not_spam', 'phishing', 'safe')),

    -- Sender info (for quick lookup)
    sender_email    VARCHAR(255) NOT NULL,
    sender_domain   VARCHAR(255) NOT NULL,

    -- Original verdict (what we classified it as)
    original_verdict VARCHAR(20),
    original_score   DECIMAL(5,4),

    -- For phishing reports
    phishing_details JSONB,

    -- Processing status
    processed       BOOLEAN DEFAULT FALSE,
    processed_at    TIMESTAMP WITH TIME ZONE,

    -- Used in training
    training_batch_id UUID,

    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Prevent duplicate feedback for same email/user
    UNIQUE(email_id, user_id, feedback_type)
);

-- Indexes for user_feedback
CREATE INDEX idx_user_feedback_org_id ON user_feedback(org_id);
CREATE INDEX idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX idx_user_feedback_type ON user_feedback(feedback_type);
CREATE INDEX idx_user_feedback_sender ON user_feedback(sender_email);
CREATE INDEX idx_user_feedback_processed ON user_feedback(processed) WHERE processed = FALSE;
CREATE INDEX idx_user_feedback_created_at ON user_feedback(created_at DESC);
CREATE INDEX idx_user_feedback_training ON user_feedback(training_batch_id) WHERE training_batch_id IS NOT NULL;

-- ============================================================
-- TRAINING BATCHES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS training_batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Batch stats
    sample_count    INT DEFAULT 0,
    spam_count      INT DEFAULT 0,
    ham_count       INT DEFAULT 0,
    phish_count     INT DEFAULT 0,

    -- Processing
    status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    processed_at    TIMESTAMP WITH TIME ZONE,
    error_message   TEXT,

    -- Output
    model_version   VARCHAR(50),

    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_training_batches_org_id ON training_batches(org_id);
CREATE INDEX idx_training_batches_status ON training_batches(status);
CREATE INDEX idx_training_batches_created_at ON training_batches(created_at DESC);

-- ============================================================
-- TRAINING SAMPLES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS training_samples (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID NOT NULL REFERENCES training_batches(id) ON DELETE CASCADE,
    feedback_id     UUID NOT NULL REFERENCES user_feedback(id) ON DELETE CASCADE,

    -- Sample data
    label           VARCHAR(20) NOT NULL CHECK (label IN ('spam', 'ham', 'phish')),

    -- Email content (anonymized)
    subject_hash    VARCHAR(64),
    body_hash       VARCHAR(64),

    -- Features
    features        JSONB,

    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_training_samples_batch_id ON training_samples(batch_id);

-- ============================================================
-- THREAT LOGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS threat_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id        UUID NOT NULL,
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Detection info
    threat_type     VARCHAR(20) NOT NULL CHECK (threat_type IN ('spam', 'phishing', 'malware', 'suspicious')),
    severity        VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    -- Verdict details
    verdict         VARCHAR(20) NOT NULL,
    score           DECIMAL(5,4) NOT NULL,
    confidence      DECIMAL(5,4),

    -- Detection layers that flagged
    layers_triggered VARCHAR(100)[], -- e.g., ['quick', 'rules', 'ml']

    -- Detailed factors
    factors         JSONB,

    -- Sender info
    sender_email    VARCHAR(255) NOT NULL,
    sender_ip       INET,

    -- Action taken
    action_taken    VARCHAR(30) NOT NULL CHECK (action_taken IN ('delivered', 'quarantined', 'spam_folder', 'blocked', 'deleted')),

    -- Email summary (for admin review)
    subject         VARCHAR(500),

    -- Processing time
    processing_ms   INT,

    -- Timestamps
    detected_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for threat_logs
CREATE INDEX idx_threat_logs_org_id ON threat_logs(org_id);
CREATE INDEX idx_threat_logs_threat_type ON threat_logs(threat_type);
CREATE INDEX idx_threat_logs_severity ON threat_logs(severity);
CREATE INDEX idx_threat_logs_sender ON threat_logs(sender_email);
CREATE INDEX idx_threat_logs_detected_at ON threat_logs(detected_at DESC);
CREATE INDEX idx_threat_logs_email_id ON threat_logs(email_id);

-- Partial index for high-severity threats
CREATE INDEX idx_threat_logs_high_severity ON threat_logs(detected_at DESC)
    WHERE severity IN ('high', 'critical');

-- ============================================================
-- ORG SPAM SETTINGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS org_spam_settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Spam threshold (affects sensitivity)
    threshold       VARCHAR(10) DEFAULT 'medium' CHECK (threshold IN ('low', 'medium', 'high')),

    -- Action on spam detection
    quarantine_action VARCHAR(20) DEFAULT 'spam_folder' CHECK (quarantine_action IN ('quarantine', 'spam_folder', 'delete', 'tag')),

    -- Block/Allow lists (stored as arrays)
    block_list      VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],
    allow_list      VARCHAR(255)[] DEFAULT ARRAY[]::VARCHAR(255)[],

    -- Feature toggles
    enable_llm_analysis BOOLEAN DEFAULT TRUE,
    enable_ml_analysis  BOOLEAN DEFAULT TRUE,
    enable_url_scanning BOOLEAN DEFAULT TRUE,
    enable_attachment_scanning BOOLEAN DEFAULT TRUE,

    -- Notifications
    notify_admin_on_threat BOOLEAN DEFAULT TRUE,
    notify_user_on_quarantine BOOLEAN DEFAULT TRUE,

    -- Quarantine settings
    quarantine_retention_days INT DEFAULT 30,
    auto_release_trusted BOOLEAN DEFAULT FALSE,

    -- Rate limiting
    max_emails_per_sender_per_hour INT DEFAULT 100,

    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    UNIQUE(org_id)
);

CREATE INDEX idx_org_spam_settings_org_id ON org_spam_settings(org_id);

-- ============================================================
-- QUARANTINE TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS email_quarantine (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id        UUID NOT NULL,
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Quarantine reason
    reason          VARCHAR(30) NOT NULL CHECK (reason IN ('spam', 'phishing', 'malware', 'policy', 'manual')),

    -- Original detection info
    threat_log_id   UUID REFERENCES threat_logs(id),

    -- Sender info
    sender_email    VARCHAR(255) NOT NULL,
    subject         VARCHAR(500),

    -- Status
    status          VARCHAR(20) DEFAULT 'quarantined' CHECK (status IN ('quarantined', 'released', 'deleted')),

    -- Release info
    released_by     UUID REFERENCES users(id),
    released_at     TIMESTAMP WITH TIME ZONE,
    release_reason  TEXT,

    -- Expiry
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quarantine_org_id ON email_quarantine(org_id);
CREATE INDEX idx_quarantine_user_id ON email_quarantine(user_id);
CREATE INDEX idx_quarantine_status ON email_quarantine(status);
CREATE INDEX idx_quarantine_expires ON email_quarantine(expires_at) WHERE status = 'quarantined';
CREATE INDEX idx_quarantine_created_at ON email_quarantine(created_at DESC);

-- ============================================================
-- IP REPUTATION CACHE TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS ip_reputation_cache (
    ip_address      INET PRIMARY KEY,

    -- DNSBL results
    is_listed       BOOLEAN DEFAULT FALSE,
    listed_on       VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],

    -- Reputation score
    reputation_score DECIMAL(5,4) DEFAULT 0.5000,

    -- Timestamps
    checked_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_ip_reputation_expires ON ip_reputation_cache(expires_at);

-- ============================================================
-- THREAT STATS MATERIALIZED VIEW
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS threat_stats_daily AS
SELECT
    org_id,
    DATE(detected_at) as date,
    threat_type,
    severity,
    COUNT(*) as count,
    AVG(score) as avg_score,
    COUNT(DISTINCT sender_email) as unique_senders
FROM threat_logs
WHERE detected_at >= NOW() - INTERVAL '90 days'
GROUP BY org_id, DATE(detected_at), threat_type, severity;

CREATE UNIQUE INDEX idx_threat_stats_daily_pk ON threat_stats_daily(org_id, date, threat_type, severity);

-- ============================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================

-- Function to update sender reputation when feedback is submitted
CREATE OR REPLACE FUNCTION update_reputation_on_feedback()
RETURNS TRIGGER AS $$
BEGIN
    -- Update reputation counters based on feedback type
    IF NEW.feedback_type = 'spam' THEN
        UPDATE sender_reputation
        SET user_spam_reports = user_spam_reports + 1,
            last_updated = NOW()
        WHERE email = NEW.sender_email AND org_id = NEW.org_id;
    ELSIF NEW.feedback_type IN ('safe', 'not_spam') THEN
        UPDATE sender_reputation
        SET user_safe_reports = user_safe_reports + 1,
            last_updated = NOW()
        WHERE email = NEW.sender_email AND org_id = NEW.org_id;
    ELSIF NEW.feedback_type = 'phishing' THEN
        UPDATE sender_reputation
        SET user_phish_reports = user_phish_reports + 1,
            last_updated = NOW()
        WHERE email = NEW.sender_email AND org_id = NEW.org_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_reputation_on_feedback
AFTER INSERT ON user_feedback
FOR EACH ROW
EXECUTE FUNCTION update_reputation_on_feedback();

-- Function to update domain stats when sender reputation changes
CREATE OR REPLACE FUNCTION update_domain_on_sender_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Aggregate domain stats
    INSERT INTO domain_reputation (domain, org_id, total_senders, total_emails, spam_count, phishing_count, ham_count)
    SELECT
        NEW.domain,
        NEW.org_id,
        COUNT(DISTINCT email),
        SUM(total_emails),
        SUM(spam_count),
        SUM(phishing_count),
        SUM(ham_count)
    FROM sender_reputation
    WHERE domain = NEW.domain AND org_id = NEW.org_id
    ON CONFLICT (domain, org_id) DO UPDATE SET
        total_senders = EXCLUDED.total_senders,
        total_emails = EXCLUDED.total_emails,
        spam_count = EXCLUDED.spam_count,
        phishing_count = EXCLUDED.phishing_count,
        ham_count = EXCLUDED.ham_count,
        last_updated = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_domain_on_sender_change
AFTER INSERT OR UPDATE ON sender_reputation
FOR EACH ROW
EXECUTE FUNCTION update_domain_on_sender_change();

-- Function to refresh threat stats daily
CREATE OR REPLACE FUNCTION refresh_threat_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY threat_stats_daily;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- DEFAULT DATA
-- ============================================================

-- Insert default spam settings for existing orgs
INSERT INTO org_spam_settings (org_id)
SELECT id FROM organizations
WHERE id NOT IN (SELECT org_id FROM org_spam_settings)
ON CONFLICT DO NOTHING;

-- ============================================================
-- CLEANUP JOB (run periodically)
-- ============================================================

-- Clean up expired quarantine entries
CREATE OR REPLACE FUNCTION cleanup_expired_quarantine()
RETURNS void AS $$
BEGIN
    UPDATE email_quarantine
    SET status = 'deleted'
    WHERE status = 'quarantined' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Clean up old threat logs (keep 1 year)
CREATE OR REPLACE FUNCTION cleanup_old_threat_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM threat_logs
    WHERE detected_at < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- Clean up expired IP reputation cache
CREATE OR REPLACE FUNCTION cleanup_expired_ip_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM ip_reputation_cache
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE sender_reputation IS 'Tracks per-sender reputation scores and metrics for spam filtering';
COMMENT ON TABLE user_feedback IS 'Stores user feedback (spam/not-spam/phishing reports) for training';
COMMENT ON TABLE threat_logs IS 'Audit log of all detected threats and actions taken';
COMMENT ON TABLE org_spam_settings IS 'Organization-level spam filtering configuration';
COMMENT ON TABLE email_quarantine IS 'Holds quarantined emails pending admin review';
