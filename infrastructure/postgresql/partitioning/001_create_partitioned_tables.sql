-- =============================================================================
-- PostgreSQL Table Partitioning Migration
-- Enterprise Email Platform
--
-- This migration converts large tables to partitioned tables for improved
-- performance and manageability at scale.
--
-- Tables partitioned:
-- - emails (by created_at, monthly partitions)
-- - audit_logs (by created_at, monthly partitions)
--
-- Run this migration during a maintenance window as it requires exclusive locks.
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: Create new partitioned emails table
-- =============================================================================

-- Create partitioned version of emails table
CREATE TABLE IF NOT EXISTS emails_partitioned (
    id uuid DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL,
    mailbox_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    message_id varchar(255) NOT NULL,
    in_reply_to varchar(255),
    references_header text,
    from_address varchar(255) NOT NULL,
    from_name varchar(255),
    from_domain varchar(255) NOT NULL,
    to_addresses jsonb NOT NULL,
    cc_addresses jsonb DEFAULT '[]',
    bcc_addresses jsonb DEFAULT '[]',
    reply_to_address varchar(255),
    subject text NOT NULL,
    snippet varchar(500),
    body_text text,
    body_html text,
    direction varchar(20) NOT NULL DEFAULT 'inbound',
    priority varchar(20) NOT NULL DEFAULT 'normal',
    delivery_status varchar(50) NOT NULL DEFAULT 'delivered',
    delivery_status_message text,
    size_bytes bigint NOT NULL DEFAULT 0,
    has_attachments boolean NOT NULL DEFAULT false,
    attachment_count integer NOT NULL DEFAULT 0,
    is_read boolean NOT NULL DEFAULT false,
    is_starred boolean NOT NULL DEFAULT false,
    is_flagged boolean NOT NULL DEFAULT false,
    is_answered boolean NOT NULL DEFAULT false,
    is_forwarded boolean NOT NULL DEFAULT false,
    is_draft boolean NOT NULL DEFAULT false,
    is_encrypted boolean NOT NULL DEFAULT false,
    is_signed boolean NOT NULL DEFAULT false,
    spam_score real DEFAULT 0,
    is_spam boolean NOT NULL DEFAULT false,
    spam_reason varchar(500),
    label_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
    importance_score integer NOT NULL DEFAULT 50,
    raw_headers jsonb,
    parsed_headers jsonb,
    security_info jsonb,
    received_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)  -- Include partition key in primary key
) PARTITION BY RANGE (created_at);

-- Create indexes on partitioned table (will be inherited by partitions)
CREATE INDEX IF NOT EXISTS emails_part_thread_id_idx ON emails_partitioned(thread_id);
CREATE INDEX IF NOT EXISTS emails_part_mailbox_id_idx ON emails_partitioned(mailbox_id);
CREATE INDEX IF NOT EXISTS emails_part_folder_id_idx ON emails_partitioned(folder_id);
CREATE INDEX IF NOT EXISTS emails_part_message_id_idx ON emails_partitioned(message_id);
CREATE INDEX IF NOT EXISTS emails_part_from_domain_idx ON emails_partitioned(from_domain);
CREATE INDEX IF NOT EXISTS emails_part_mailbox_created_idx ON emails_partitioned(mailbox_id, created_at DESC);
CREATE INDEX IF NOT EXISTS emails_part_mailbox_folder_idx ON emails_partitioned(mailbox_id, folder_id, created_at DESC);
CREATE INDEX IF NOT EXISTS emails_part_mailbox_read_idx ON emails_partitioned(mailbox_id, is_read);
CREATE INDEX IF NOT EXISTS emails_part_mailbox_starred_idx ON emails_partitioned(mailbox_id, is_starred);
CREATE INDEX IF NOT EXISTS emails_part_label_ids_idx ON emails_partitioned USING GIN (label_ids);

-- =============================================================================
-- STEP 2: Create new partitioned audit_logs table
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_logs_partitioned (
    id uuid DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    domain_id uuid,
    user_id uuid,
    user_email varchar(255),
    user_display_name varchar(255),
    category varchar(100) NOT NULL,
    action varchar(100) NOT NULL,
    description text NOT NULL,
    severity varchar(20) NOT NULL DEFAULT 'info',
    target_type varchar(50),
    target_id varchar(255),
    target_name varchar(255),
    details jsonb,
    ip_address inet,
    geo_location varchar(255),
    country_code varchar(2),
    correlation_id varchar(100),
    source varchar(50) NOT NULL DEFAULT 'web',
    api_client_id varchar(100),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)  -- Include partition key in primary key
) PARTITION BY RANGE (created_at);

-- Create indexes on partitioned audit_logs table
CREATE INDEX IF NOT EXISTS audit_logs_part_org_id_idx ON audit_logs_partitioned(organization_id);
CREATE INDEX IF NOT EXISTS audit_logs_part_domain_id_idx ON audit_logs_partitioned(domain_id);
CREATE INDEX IF NOT EXISTS audit_logs_part_user_id_idx ON audit_logs_partitioned(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_part_category_idx ON audit_logs_partitioned(organization_id, category);
CREATE INDEX IF NOT EXISTS audit_logs_part_action_idx ON audit_logs_partitioned(organization_id, category, action);
CREATE INDEX IF NOT EXISTS audit_logs_part_target_idx ON audit_logs_partitioned(organization_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS audit_logs_part_severity_idx ON audit_logs_partitioned(organization_id, severity);
CREATE INDEX IF NOT EXISTS audit_logs_part_created_at_idx ON audit_logs_partitioned(organization_id, created_at);
CREATE INDEX IF NOT EXISTS audit_logs_part_correlation_idx ON audit_logs_partitioned(correlation_id);
CREATE INDEX IF NOT EXISTS audit_logs_part_org_date_cat_idx ON audit_logs_partitioned(organization_id, created_at, category);

-- =============================================================================
-- STEP 3: Create initial partitions (current month + 3 months ahead)
-- =============================================================================

DO $$
DECLARE
    partition_date DATE;
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
    i INTEGER;
BEGIN
    -- Create partitions for current month and 3 months ahead
    FOR i IN 0..3 LOOP
        partition_date := DATE_TRUNC('month', CURRENT_DATE) + (i || ' months')::INTERVAL;
        start_date := partition_date;
        end_date := partition_date + '1 month'::INTERVAL;

        -- Emails partition
        partition_name := 'emails_' || TO_CHAR(partition_date, 'YYYY_MM');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF emails_partitioned
             FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
        RAISE NOTICE 'Created emails partition: %', partition_name;

        -- Audit logs partition
        partition_name := 'audit_logs_' || TO_CHAR(partition_date, 'YYYY_MM');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs_partitioned
             FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
        RAISE NOTICE 'Created audit_logs partition: %', partition_name;
    END LOOP;

    -- Also create a partition for historical data (before current month)
    -- This catches any data from before partitioning was implemented
    partition_date := '2020-01-01'::DATE;  -- Arbitrary old date
    end_date := DATE_TRUNC('month', CURRENT_DATE);

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS emails_historical PARTITION OF emails_partitioned
         FOR VALUES FROM (%L) TO (%L)',
        partition_date, end_date
    );

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS audit_logs_historical PARTITION OF audit_logs_partitioned
         FOR VALUES FROM (%L) TO (%L)',
        partition_date, end_date
    );
END $$;

-- =============================================================================
-- STEP 4: Create partition management functions
-- =============================================================================

-- Function to create future partitions automatically
CREATE OR REPLACE FUNCTION create_future_partitions(months_ahead INTEGER DEFAULT 3)
RETURNS void AS $$
DECLARE
    partition_date DATE;
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
    i INTEGER;
BEGIN
    FOR i IN 1..months_ahead LOOP
        partition_date := DATE_TRUNC('month', CURRENT_DATE) + (i || ' months')::INTERVAL;
        start_date := partition_date;
        end_date := partition_date + '1 month'::INTERVAL;

        -- Emails partition
        partition_name := 'emails_' || TO_CHAR(partition_date, 'YYYY_MM');
        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = partition_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF emails_partitioned
                 FOR VALUES FROM (%L) TO (%L)',
                partition_name, start_date, end_date
            );
            RAISE NOTICE 'Created emails partition: %', partition_name;
        END IF;

        -- Audit logs partition
        partition_name := 'audit_logs_' || TO_CHAR(partition_date, 'YYYY_MM');
        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = partition_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF audit_logs_partitioned
                 FOR VALUES FROM (%L) TO (%L)',
                partition_name, start_date, end_date
            );
            RAISE NOTICE 'Created audit_logs partition: %', partition_name;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to archive old partitions (detach and optionally move/compress)
CREATE OR REPLACE FUNCTION archive_old_partitions(retention_months INTEGER DEFAULT 24)
RETURNS void AS $$
DECLARE
    partition_record RECORD;
    archive_date DATE;
BEGIN
    archive_date := DATE_TRUNC('month', CURRENT_DATE) - (retention_months || ' months')::INTERVAL;

    -- Find emails partitions older than retention period
    FOR partition_record IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename LIKE 'emails_%'
          AND tablename NOT IN ('emails_partitioned', 'emails_historical')
          AND tablename < 'emails_' || TO_CHAR(archive_date, 'YYYY_MM')
    LOOP
        RAISE NOTICE 'Archiving partition: %', partition_record.tablename;
        -- Detach partition (data preserved, just not part of parent)
        EXECUTE format(
            'ALTER TABLE emails_partitioned DETACH PARTITION %I',
            partition_record.tablename
        );
        -- Optionally rename to indicate archived status
        EXECUTE format(
            'ALTER TABLE %I RENAME TO %I',
            partition_record.tablename,
            'archived_' || partition_record.tablename
        );
    END LOOP;

    -- Same for audit_logs
    FOR partition_record IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename LIKE 'audit_logs_%'
          AND tablename NOT IN ('audit_logs_partitioned', 'audit_logs_historical')
          AND tablename < 'audit_logs_' || TO_CHAR(archive_date, 'YYYY_MM')
    LOOP
        RAISE NOTICE 'Archiving partition: %', partition_record.tablename;
        EXECUTE format(
            'ALTER TABLE audit_logs_partitioned DETACH PARTITION %I',
            partition_record.tablename
        );
        EXECUTE format(
            'ALTER TABLE %I RENAME TO %I',
            partition_record.tablename,
            'archived_' || partition_record.tablename
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to drop archived partitions (permanent deletion)
CREATE OR REPLACE FUNCTION drop_archived_partitions()
RETURNS void AS $$
DECLARE
    partition_record RECORD;
BEGIN
    -- Find archived partitions and drop them
    FOR partition_record IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND (tablename LIKE 'archived_emails_%' OR tablename LIKE 'archived_audit_logs_%')
    LOOP
        RAISE NOTICE 'Dropping archived partition: %', partition_record.tablename;
        EXECUTE format('DROP TABLE IF EXISTS %I', partition_record.tablename);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to get partition statistics
CREATE OR REPLACE FUNCTION get_partition_stats()
RETURNS TABLE (
    partition_name TEXT,
    row_count BIGINT,
    total_size TEXT,
    index_size TEXT,
    table_size TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.relname::TEXT as partition_name,
        c.reltuples::BIGINT as row_count,
        pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
        pg_size_pretty(pg_indexes_size(c.oid)) as index_size,
        pg_size_pretty(pg_relation_size(c.oid)) as table_size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (c.relname LIKE 'emails_%' OR c.relname LIKE 'audit_logs_%')
      AND c.relkind = 'r'  -- Regular table (partition)
    ORDER BY c.relname;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- STEP 5: Create cron job helper for automatic partition management
-- =============================================================================

-- Note: Requires pg_cron extension to be enabled
-- Run this manually if pg_cron is available:
--
-- SELECT cron.schedule('create-partitions', '0 0 1 * *', $$SELECT create_future_partitions(3)$$);
-- SELECT cron.schedule('archive-partitions', '0 1 1 * *', $$SELECT archive_old_partitions(24)$$);

COMMENT ON FUNCTION create_future_partitions IS
'Creates email and audit_log partitions for the next N months.
Run monthly via cron: SELECT cron.schedule(''create-partitions'', ''0 0 1 * *'', $$SELECT create_future_partitions(3)$$);';

COMMENT ON FUNCTION archive_old_partitions IS
'Detaches partitions older than N months from the parent table.
Data is preserved but no longer included in queries.
Run monthly via cron: SELECT cron.schedule(''archive-partitions'', ''0 1 1 * *'', $$SELECT archive_old_partitions(24)$$);';

COMMIT;

-- =============================================================================
-- NOTE: Data Migration
-- =============================================================================
--
-- To migrate existing data, run the following in a maintenance window:
--
-- 1. Lock the original table to prevent writes
-- 2. Copy data to partitioned table
-- 3. Rename tables
-- 4. Update foreign keys if needed
--
-- Example (DO NOT RUN AUTOMATICALLY):
--
-- BEGIN;
-- LOCK TABLE emails IN ACCESS EXCLUSIVE MODE;
-- INSERT INTO emails_partitioned SELECT * FROM emails;
-- ALTER TABLE emails RENAME TO emails_old;
-- ALTER TABLE emails_partitioned RENAME TO emails;
-- -- Update any foreign keys referencing the old table
-- COMMIT;
--
-- Verify data:
-- SELECT COUNT(*) FROM emails;
-- SELECT COUNT(*) FROM emails_old;
--
-- Once verified, drop the old table:
-- DROP TABLE emails_old;
