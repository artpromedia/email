-- IP Pool Management Schema
-- Supports dedicated, shared, and high-volume IP pools for multi-domain email

-- IP Pools table
CREATE TABLE IF NOT EXISTS ip_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_name VARCHAR(100) NOT NULL UNIQUE,
    pool_type VARCHAR(50) NOT NULL, -- 'dedicated', 'shared', 'high-volume'
    description TEXT,
    ips TEXT[] NOT NULL, -- Array of IP addresses in the pool
    max_domains INTEGER, -- Maximum domains that can use this pool
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_pool_type CHECK (pool_type IN ('dedicated', 'shared', 'high-volume'))
);

-- Domain to IP Pool mapping
CREATE TABLE IF NOT EXISTS domain_ip_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    pool_id UUID NOT NULL REFERENCES ip_pools(id) ON DELETE RESTRICT,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID, -- User who assigned the pool
    is_primary BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 100, -- Lower number = higher priority
    
    UNIQUE(domain_id, pool_id)
);

-- IP warming schedule
CREATE TABLE IF NOT EXISTS ip_warming_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    pool_id UUID NOT NULL REFERENCES ip_pools(id) ON DELETE CASCADE,
    ip_address INET NOT NULL,
    start_date DATE NOT NULL,
    current_phase INTEGER DEFAULT 1,
    daily_limit INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed', 'paused'
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_warming_status CHECK (status IN ('active', 'completed', 'paused'))
);

-- IP warming phases configuration
CREATE TABLE IF NOT EXISTS ip_warming_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_number INTEGER NOT NULL,
    duration_days INTEGER NOT NULL,
    daily_limit INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- IP reputation tracking
CREATE TABLE IF NOT EXISTS ip_reputation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id UUID NOT NULL REFERENCES ip_pools(id) ON DELETE CASCADE,
    ip_address INET NOT NULL,
    reputation_score DECIMAL(5,2), -- 0-100 score
    provider VARCHAR(100), -- 'senderscore', 'talos', 'spamhaus', etc.
    last_checked_at TIMESTAMPTZ,
    blacklisted BOOLEAN DEFAULT false,
    blacklist_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(ip_address, provider)
);

-- IP usage statistics
CREATE TABLE IF NOT EXISTS ip_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id UUID NOT NULL REFERENCES ip_pools(id) ON DELETE CASCADE,
    domain_id UUID REFERENCES domains(id) ON DELETE CASCADE,
    ip_address INET NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    messages_sent INTEGER DEFAULT 0,
    messages_delivered INTEGER DEFAULT 0,
    messages_bounced INTEGER DEFAULT 0,
    messages_deferred INTEGER DEFAULT 0,
    spam_complaints INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(pool_id, domain_id, ip_address, date)
);

-- Indexes for performance
CREATE INDEX idx_domain_ip_pools_domain ON domain_ip_pools(domain_id);
CREATE INDEX idx_domain_ip_pools_pool ON domain_ip_pools(pool_id);
CREATE INDEX idx_ip_warming_schedules_domain ON ip_warming_schedules(domain_id);
CREATE INDEX idx_ip_warming_schedules_pool ON ip_warming_schedules(pool_id);
CREATE INDEX idx_ip_warming_schedules_status ON ip_warming_schedules(status);
CREATE INDEX idx_ip_reputation_ip ON ip_reputation(ip_address);
CREATE INDEX idx_ip_reputation_blacklisted ON ip_reputation(blacklisted);
CREATE INDEX idx_ip_usage_stats_date ON ip_usage_stats(date DESC);
CREATE INDEX idx_ip_usage_stats_pool_domain ON ip_usage_stats(pool_id, domain_id);

-- Insert default IP warming phases
INSERT INTO ip_warming_phases (phase_number, duration_days, daily_limit, description) VALUES
(1, 3, 100, 'Initial warm-up phase - very limited volume'),
(2, 4, 500, 'Early warm-up phase - low volume'),
(3, 7, 2000, 'Mid warm-up phase - moderate volume'),
(4, 7, 10000, 'Late warm-up phase - high volume'),
(5, 0, NULL, 'Full production - no limits')
ON CONFLICT DO NOTHING;

-- Create default IP pools
INSERT INTO ip_pools (pool_name, pool_type, description, ips, max_domains) VALUES
('shared-pool-1', 'shared', 'Default shared IP pool for standard customers', ARRAY['10.0.1.20', '10.0.1.21', '10.0.1.22'], 100),
('high-volume-pool-1', 'high-volume', 'High volume pool for bulk senders', ARRAY['10.0.1.30', '10.0.1.31', '10.0.1.32', '10.0.1.33'], 20)
ON CONFLICT (pool_name) DO NOTHING;

-- Function to get next IP from pool (round-robin)
CREATE OR REPLACE FUNCTION get_next_ip_from_pool(p_pool_id UUID, p_domain_id UUID)
RETURNS INET AS $$
DECLARE
    v_ips TEXT[];
    v_ip INET;
    v_last_used_index INTEGER;
    v_next_index INTEGER;
BEGIN
    -- Get the IP array from the pool
    SELECT ips INTO v_ips
    FROM ip_pools
    WHERE id = p_pool_id AND active = true;
    
    IF v_ips IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Get the last used IP index for this domain
    SELECT COALESCE(
        (SELECT array_position(v_ips, ip_address::TEXT)
         FROM ip_usage_stats
         WHERE pool_id = p_pool_id AND domain_id = p_domain_id
         ORDER BY created_at DESC
         LIMIT 1),
        0
    ) INTO v_last_used_index;
    
    -- Get next IP (round-robin)
    v_next_index := (v_last_used_index % array_length(v_ips, 1)) + 1;
    v_ip := v_ips[v_next_index]::INET;
    
    RETURN v_ip;
END;
$$ LANGUAGE plpgsql;

-- Function to check if IP warming is required
CREATE OR REPLACE FUNCTION check_ip_warming_required(p_domain_id UUID, p_pool_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_warming_active BOOLEAN;
    v_domain_age_days INTEGER;
BEGIN
    -- Check if there's an active warming schedule
    SELECT EXISTS(
        SELECT 1 FROM ip_warming_schedules
        WHERE domain_id = p_domain_id
        AND pool_id = p_pool_id
        AND status = 'active'
    ) INTO v_warming_active;
    
    IF v_warming_active THEN
        RETURN TRUE;
    END IF;
    
    -- Check domain age
    SELECT EXTRACT(DAY FROM NOW() - created_at)
    INTO v_domain_age_days
    FROM domains
    WHERE id = p_domain_id;
    
    -- Require warming for domains less than 30 days old
    RETURN v_domain_age_days < 30;
END;
$$ LANGUAGE plpgsql;

-- Function to get daily sending limit for a domain
CREATE OR REPLACE FUNCTION get_daily_sending_limit(p_domain_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_limit INTEGER;
    v_warming_limit INTEGER;
    v_domain_limit INTEGER;
BEGIN
    -- Check if domain is in warming phase
    SELECT iws.daily_limit
    INTO v_warming_limit
    FROM ip_warming_schedules iws
    WHERE iws.domain_id = p_domain_id
    AND iws.status = 'active'
    ORDER BY iws.created_at DESC
    LIMIT 1;
    
    -- Get domain's configured limit
    SELECT daily_send_limit
    INTO v_domain_limit
    FROM domains
    WHERE id = p_domain_id;
    
    -- Return the lower of warming limit or domain limit
    IF v_warming_limit IS NOT NULL THEN
        v_limit := LEAST(v_warming_limit, COALESCE(v_domain_limit, v_warming_limit));
    ELSE
        v_limit := v_domain_limit;
    END IF;
    
    RETURN v_limit;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ip_pools_updated_at BEFORE UPDATE ON ip_pools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ip_warming_schedules_updated_at BEFORE UPDATE ON ip_warming_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ip_reputation_updated_at BEFORE UPDATE ON ip_reputation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ip_usage_stats_updated_at BEFORE UPDATE ON ip_usage_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE ip_pools IS 'IP address pools for email sending';
COMMENT ON TABLE domain_ip_pools IS 'Mapping of domains to IP pools';
COMMENT ON TABLE ip_warming_schedules IS 'IP warming schedules for new domains/IPs';
COMMENT ON TABLE ip_warming_phases IS 'Configuration for IP warming phases';
COMMENT ON TABLE ip_reputation IS 'IP reputation tracking from various providers';
COMMENT ON TABLE ip_usage_stats IS 'Daily statistics for IP usage per domain';
