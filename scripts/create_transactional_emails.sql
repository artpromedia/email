-- Create transactional_emails table
CREATE TABLE IF NOT EXISTS transactional_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
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
    template_id UUID,
    ip_pool VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    track_opens BOOLEAN NOT NULL DEFAULT true,
    track_clicks BOOLEAN NOT NULL DEFAULT true,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trans_emails_org ON transactional_emails(organization_id);
CREATE INDEX IF NOT EXISTS idx_trans_emails_message_id ON transactional_emails(message_id);
CREATE INDEX IF NOT EXISTS idx_trans_emails_status ON transactional_emails(status);
CREATE INDEX IF NOT EXISTS idx_trans_emails_scheduled ON transactional_emails(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_trans_emails_created ON transactional_emails(organization_id, created_at DESC);
