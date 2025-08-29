-- CEERION Mail Database Schema
-- PostgreSQL initialization script for mail transport infrastructure

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Virtual domains table
CREATE TABLE IF NOT EXISTS virtual_domains (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) NOT NULL UNIQUE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Virtual users table (mailboxes)
CREATE TABLE IF NOT EXISTS virtual_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    domain_id INTEGER REFERENCES virtual_domains(id) ON DELETE CASCADE,
    maildir VARCHAR(255) NOT NULL,
    quota BIGINT DEFAULT 5368709120, -- 5GB in bytes
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    CONSTRAINT email_domain_check CHECK (email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
);

-- Virtual aliases table
CREATE TABLE IF NOT EXISTS virtual_aliases (
    id SERIAL PRIMARY KEY,
    source VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    domain_id INTEGER REFERENCES virtual_domains(id) ON DELETE CASCADE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Mail messages table (metadata)
CREATE TABLE IF NOT EXISTS mail_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER REFERENCES virtual_users(id) ON DELETE CASCADE,
    message_id VARCHAR(255) NOT NULL,
    thread_id UUID,
    subject TEXT,
    sender VARCHAR(255),
    recipients TEXT[], -- JSON array of recipients
    cc TEXT[],
    bcc TEXT[],
    date_sent TIMESTAMP WITH TIME ZONE,
    date_received TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    size BIGINT,
    flags TEXT[], -- IMAP flags: \Seen, \Answered, \Flagged, \Deleted, \Draft
    labels TEXT[], -- Custom labels
    folder VARCHAR(255) DEFAULT 'INBOX',
    spam_score REAL DEFAULT 0.0,
    virus_scan_result VARCHAR(50) DEFAULT 'clean',
    dkim_valid BOOLEAN DEFAULT false,
    spf_result VARCHAR(20),
    dmarc_result VARCHAR(20),
    attachment_count INTEGER DEFAULT 0,
    has_attachments BOOLEAN DEFAULT false,
    body_text TEXT,
    body_html TEXT,
    headers JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Mail attachments table
CREATE TABLE IF NOT EXISTS mail_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES mail_messages(id) ON DELETE CASCADE,
    filename VARCHAR(255),
    content_type VARCHAR(255),
    size BIGINT,
    content_id VARCHAR(255),
    disposition VARCHAR(50), -- attachment, inline
    storage_path VARCHAR(500), -- Path to encrypted file in object store
    checksum VARCHAR(64), -- SHA-256 checksum
    encrypted BOOLEAN DEFAULT true,
    encryption_key_id VARCHAR(255), -- KMS key ID used for encryption
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Mail folders table (IMAP folders)
CREATE TABLE IF NOT EXISTS mail_folders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES virtual_users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_id INTEGER REFERENCES mail_folders(id) ON DELETE CASCADE,
    special_use VARCHAR(50), -- \Drafts, \Sent, \Trash, \Junk, \Archive
    subscribed BOOLEAN DEFAULT true,
    message_count INTEGER DEFAULT 0,
    unseen_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- DKIM signatures table
CREATE TABLE IF NOT EXISTS dkim_signatures (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) NOT NULL,
    selector VARCHAR(255) NOT NULL,
    private_key TEXT NOT NULL,
    public_key TEXT NOT NULL,
    algorithm VARCHAR(20) DEFAULT 'rsa-sha256',
    key_size INTEGER DEFAULT 2048,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(domain, selector)
);

-- DMARC reports table
CREATE TABLE IF NOT EXISTS dmarc_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain VARCHAR(255) NOT NULL,
    reporter VARCHAR(255) NOT NULL,
    report_id VARCHAR(255) NOT NULL,
    date_range_begin TIMESTAMP WITH TIME ZONE,
    date_range_end TIMESTAMP WITH TIME ZONE,
    policy_domain VARCHAR(255),
    policy_adkim VARCHAR(10), -- alignment mode
    policy_aspf VARCHAR(10), -- alignment mode
    policy_p VARCHAR(20), -- policy
    policy_sp VARCHAR(20), -- subdomain policy
    policy_pct INTEGER, -- percentage
    records JSONB, -- Individual record details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- TLS-RPT reports table
CREATE TABLE IF NOT EXISTS tls_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain VARCHAR(255) NOT NULL,
    reporter VARCHAR(255) NOT NULL,
    report_id VARCHAR(255) NOT NULL,
    date_range_begin TIMESTAMP WITH TIME ZONE,
    date_range_end TIMESTAMP WITH TIME ZONE,
    policy_strings TEXT[],
    summary JSONB,
    failure_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Mail delivery queue table
CREATE TABLE IF NOT EXISTS mail_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender VARCHAR(255) NOT NULL,
    recipients TEXT[] NOT NULL,
    subject TEXT,
    message_data TEXT NOT NULL,
    priority INTEGER DEFAULT 5, -- 1=highest, 9=lowest
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'queued', -- queued, sending, sent, failed, deferred
    last_attempt TIMESTAMP WITH TIME ZONE,
    next_attempt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- IP address or user email
    type VARCHAR(50) NOT NULL, -- 'ip' or 'user'
    action VARCHAR(50) NOT NULL, -- 'smtp', 'imap', 'submit'
    count INTEGER DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    UNIQUE(identifier, type, action, window_start)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER REFERENCES virtual_users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_virtual_users_email ON virtual_users(email);
CREATE INDEX IF NOT EXISTS idx_virtual_users_domain ON virtual_users(domain_id);
CREATE INDEX IF NOT EXISTS idx_virtual_users_active ON virtual_users(active);

CREATE INDEX IF NOT EXISTS idx_mail_messages_user ON mail_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_date ON mail_messages(date_received);
CREATE INDEX IF NOT EXISTS idx_mail_messages_folder ON mail_messages(folder);
CREATE INDEX IF NOT EXISTS idx_mail_messages_flags ON mail_messages USING GIN(flags);
CREATE INDEX IF NOT EXISTS idx_mail_messages_labels ON mail_messages USING GIN(labels);
CREATE INDEX IF NOT EXISTS idx_mail_messages_thread ON mail_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_subject ON mail_messages USING GIN(to_tsvector('english', subject));

CREATE INDEX IF NOT EXISTS idx_mail_attachments_message ON mail_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_mail_attachments_content_type ON mail_attachments(content_type);

CREATE INDEX IF NOT EXISTS idx_mail_folders_user ON mail_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_mail_folders_parent ON mail_folders(parent_id);

CREATE INDEX IF NOT EXISTS idx_mail_queue_status ON mail_queue(status);
CREATE INDEX IF NOT EXISTS idx_mail_queue_next_attempt ON mail_queue(next_attempt);
CREATE INDEX IF NOT EXISTS idx_mail_queue_priority ON mail_queue(priority);

CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON rate_limits(identifier, type, action);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);

CREATE INDEX IF NOT EXISTS idx_dmarc_reports_domain ON dmarc_reports(domain);
CREATE INDEX IF NOT EXISTS idx_dmarc_reports_date ON dmarc_reports(date_range_begin);

CREATE INDEX IF NOT EXISTS idx_tls_reports_domain ON tls_reports(domain);
CREATE INDEX IF NOT EXISTS idx_tls_reports_date ON tls_reports(date_range_begin);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- Create full-text search index
CREATE INDEX IF NOT EXISTS idx_mail_messages_fts ON mail_messages USING GIN(
    to_tsvector('english', COALESCE(subject, '') || ' ' || COALESCE(body_text, ''))
);

-- Create triggers for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_virtual_domains_updated_at BEFORE UPDATE ON virtual_domains 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_virtual_users_updated_at BEFORE UPDATE ON virtual_users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_virtual_aliases_updated_at BEFORE UPDATE ON virtual_aliases 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mail_messages_updated_at BEFORE UPDATE ON mail_messages 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mail_folders_updated_at BEFORE UPDATE ON mail_folders 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default domain and test user
INSERT INTO virtual_domains (domain) VALUES ('ceerion.com') ON CONFLICT (domain) DO NOTHING;

-- Insert default DKIM key (placeholder - replace with actual keys)
INSERT INTO dkim_signatures (domain, selector, private_key, public_key) 
VALUES (
    'ceerion.com',
    'ceerion',
    '-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA... (placeholder - generate actual key)
-----END RSA PRIVATE KEY-----',
    'v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA... (placeholder)'
) ON CONFLICT (domain, selector) DO NOTHING;

-- Create default mail folders function
CREATE OR REPLACE FUNCTION create_default_folders(user_id_param INTEGER)
RETURNS VOID AS $$
BEGIN
    INSERT INTO mail_folders (user_id, name, special_use) VALUES
        (user_id_param, 'INBOX', NULL),
        (user_id_param, 'Sent', '\Sent'),
        (user_id_param, 'Drafts', '\Drafts'),
        (user_id_param, 'Trash', '\Trash'),
        (user_id_param, 'Junk', '\Junk')
    ON CONFLICT (user_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically create folders for new users
CREATE OR REPLACE FUNCTION create_user_folders()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM create_default_folders(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_folders_for_new_user 
    AFTER INSERT ON virtual_users 
    FOR EACH ROW EXECUTE FUNCTION create_user_folders();

-- Cleanup function for old data
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS VOID AS $$
BEGIN
    -- Clean up old rate limit entries
    DELETE FROM rate_limits WHERE expires_at < CURRENT_TIMESTAMP;
    
    -- Clean up old audit log entries (keep 1 year)
    DELETE FROM audit_log WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 year';
    
    -- Clean up old queue entries (failed for more than 30 days)
    DELETE FROM mail_queue 
    WHERE status = 'failed' 
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    -- Vacuum and analyze
    VACUUM ANALYZE;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ceerion;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ceerion;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ceerion;
