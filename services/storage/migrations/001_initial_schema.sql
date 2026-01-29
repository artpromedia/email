-- Multi-Domain Storage Service Schema
-- PostgreSQL Database Migrations

-- Quotas table with hierarchical structure
CREATE TABLE IF NOT EXISTS quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id VARCHAR(255) NOT NULL,
    domain_id VARCHAR(255),
    user_id VARCHAR(255),
    mailbox_id VARCHAR(255),
    
    -- Limits
    soft_limit BIGINT NOT NULL DEFAULT 0,
    hard_limit BIGINT NOT NULL DEFAULT 0,
    max_objects BIGINT NOT NULL DEFAULT 0,
    
    -- Current usage
    used_bytes BIGINT NOT NULL DEFAULT 0,
    object_count BIGINT NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Unique constraint for quota lookup
    CONSTRAINT unique_quota UNIQUE (org_id, domain_id, user_id, mailbox_id)
);

-- Index for hierarchical quota lookups
CREATE INDEX idx_quotas_org ON quotas(org_id);
CREATE INDEX idx_quotas_domain ON quotas(org_id, domain_id);
CREATE INDEX idx_quotas_user ON quotas(org_id, domain_id, user_id);

-- Quota reservations for atomic operations
CREATE TABLE IF NOT EXISTS quota_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id VARCHAR(255) NOT NULL,
    domain_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    mailbox_id VARCHAR(255) NOT NULL,
    
    reserved_bytes BIGINT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reservations_expiry ON quota_reservations(expires_at);

-- Retention policies table
CREATE TABLE IF NOT EXISTS retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    
    -- Retention settings
    retention_days INTEGER NOT NULL DEFAULT 365,
    deleted_item_days INTEGER NOT NULL DEFAULT 30,
    archive_after_days INTEGER NOT NULL DEFAULT 90,
    archive_tier VARCHAR(50) DEFAULT 'STANDARD_IA',
    
    -- Compliance settings
    compliance_mode BOOLEAN NOT NULL DEFAULT FALSE,
    min_retention_days INTEGER NOT NULL DEFAULT 0,
    immutable BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Application settings
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    auto_apply BOOLEAN NOT NULL DEFAULT TRUE,
    apply_to_existing BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_retention_domain ON retention_policies(domain_id);
CREATE INDEX idx_retention_enabled ON retention_policies(enabled) WHERE deleted_at IS NULL;

-- Legal holds table
CREATE TABLE IF NOT EXISTS legal_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    case_id VARCHAR(255),
    
    -- Custodians (users under hold)
    custodians TEXT[], -- Array of user IDs
    
    -- Search query for affected messages
    query TEXT,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    
    -- Audit trail
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    released_by VARCHAR(255),
    released_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_legal_holds_domain ON legal_holds(domain_id);
CREATE INDEX idx_legal_holds_status ON legal_holds(status);
CREATE INDEX idx_legal_holds_custodians ON legal_holds USING GIN(custodians);

-- Messages held under legal hold
CREATE TABLE IF NOT EXISTS legal_hold_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hold_id UUID NOT NULL REFERENCES legal_holds(id) ON DELETE CASCADE,
    message_id VARCHAR(255) NOT NULL,
    storage_key TEXT NOT NULL,
    held_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_hold_message UNIQUE (hold_id, message_id)
);

CREATE INDEX idx_hold_messages_hold ON legal_hold_messages(hold_id);
CREATE INDEX idx_hold_messages_message ON legal_hold_messages(message_id);

-- Export jobs table
CREATE TABLE IF NOT EXISTS export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id VARCHAR(255) NOT NULL,
    
    -- Export configuration
    format VARCHAR(20) NOT NULL, -- mbox, pst, eml, json
    user_ids TEXT[],
    mailbox_ids TEXT[],
    query TEXT,
    
    -- Options
    compress BOOLEAN NOT NULL DEFAULT TRUE,
    encrypt BOOLEAN NOT NULL DEFAULT FALSE,
    public_key TEXT,
    
    -- Progress
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    total_items INTEGER NOT NULL DEFAULT 0,
    processed_items INTEGER NOT NULL DEFAULT 0,
    
    -- Result
    output_key TEXT,
    output_size BIGINT,
    checksum VARCHAR(64),
    error TEXT,
    
    -- Audit
    requested_by VARCHAR(255) NOT NULL,
    reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_export_domain ON export_jobs(domain_id);
CREATE INDEX idx_export_status ON export_jobs(status);
CREATE INDEX idx_export_created ON export_jobs(created_at DESC);

-- Deletion jobs table
CREATE TABLE IF NOT EXISTS deletion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id VARCHAR(255) NOT NULL,
    
    -- Deletion scope
    type VARCHAR(50) NOT NULL, -- domain, user, mailbox, selective
    user_id VARCHAR(255),
    mailbox_id VARCHAR(255),
    message_ids TEXT[],
    
    -- Compliance
    reason TEXT NOT NULL,
    compliance_type VARCHAR(50) NOT NULL, -- gdpr, retention, legal, manual
    
    -- Approval workflow
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    
    -- Audit
    requested_by VARCHAR(255) NOT NULL,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Progress
    progress INTEGER NOT NULL DEFAULT 0,
    total_items INTEGER NOT NULL DEFAULT 0,
    deleted_items INTEGER NOT NULL DEFAULT 0,
    bytes_freed BIGINT NOT NULL DEFAULT 0,
    error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    scheduled_for TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_deletion_domain ON deletion_jobs(domain_id);
CREATE INDEX idx_deletion_status ON deletion_jobs(status);
CREATE INDEX idx_deletion_scheduled ON deletion_jobs(scheduled_for) WHERE status = 'approved';

-- Deletion audit log
CREATE TABLE IF NOT EXISTS deletion_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES deletion_jobs(id) ON DELETE CASCADE,
    
    action VARCHAR(100) NOT NULL,
    details JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deletion_audit_job ON deletion_audit_log(job_id);
CREATE INDEX idx_deletion_audit_created ON deletion_audit_log(created_at DESC);

-- Deduplicated attachments table
CREATE TABLE IF NOT EXISTS deduplicated_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id VARCHAR(255) NOT NULL,
    
    -- Deduplication key
    content_hash VARCHAR(64) NOT NULL, -- SHA-256 hash
    
    -- Storage reference
    storage_key TEXT NOT NULL,
    size BIGINT NOT NULL,
    content_type VARCHAR(255),
    
    -- Reference counting
    ref_count INTEGER NOT NULL DEFAULT 1,
    
    -- Timestamps
    first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Unique constraint for dedup lookup
    CONSTRAINT unique_content_hash UNIQUE (org_id, content_hash)
);

CREATE INDEX idx_dedup_org ON deduplicated_attachments(org_id);
CREATE INDEX idx_dedup_hash ON deduplicated_attachments(content_hash);
CREATE INDEX idx_dedup_orphans ON deduplicated_attachments(ref_count, updated_at) WHERE ref_count = 0;

-- Attachment references table
CREATE TABLE IF NOT EXISTS attachment_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dedup_id UUID NOT NULL REFERENCES deduplicated_attachments(id) ON DELETE CASCADE,
    
    -- Location
    org_id VARCHAR(255) NOT NULL,
    domain_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    mailbox_id VARCHAR(255) NOT NULL,
    message_id VARCHAR(255) NOT NULL,
    
    -- Attachment metadata
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(255),
    size BIGINT NOT NULL,
    content_id VARCHAR(255), -- For inline attachments
    is_inline BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ref_dedup ON attachment_references(dedup_id);
CREATE INDEX idx_ref_message ON attachment_references(message_id);
CREATE INDEX idx_ref_domain ON attachment_references(domain_id);
CREATE INDEX idx_ref_user ON attachment_references(user_id);

-- Message metadata table (for retention/search)
CREATE TABLE IF NOT EXISTS message_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- Location
    org_id VARCHAR(255) NOT NULL,
    domain_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    mailbox_id VARCHAR(255) NOT NULL,
    
    -- Storage
    storage_key TEXT NOT NULL,
    storage_tier VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
    size BIGINT NOT NULL,
    
    -- Message attributes
    subject TEXT,
    sender VARCHAR(255),
    recipients TEXT[],
    received_at TIMESTAMP WITH TIME ZONE,
    
    -- Flags
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Retention
    retention_policy_id UUID REFERENCES retention_policies(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    under_legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_domain ON message_metadata(domain_id);
CREATE INDEX idx_message_user ON message_metadata(user_id);
CREATE INDEX idx_message_mailbox ON message_metadata(mailbox_id);
CREATE INDEX idx_message_expires ON message_metadata(expires_at) WHERE expires_at IS NOT NULL AND NOT under_legal_hold;
CREATE INDEX idx_message_deleted ON message_metadata(deleted_at) WHERE is_deleted = TRUE;
CREATE INDEX idx_message_legal_hold ON message_metadata(under_legal_hold) WHERE under_legal_hold = TRUE;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_quotas_updated_at
    BEFORE UPDATE ON quotas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_retention_policies_updated_at
    BEFORE UPDATE ON retention_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_dedup_updated_at
    BEFORE UPDATE ON deduplicated_attachments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_message_metadata_updated_at
    BEFORE UPDATE ON message_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
