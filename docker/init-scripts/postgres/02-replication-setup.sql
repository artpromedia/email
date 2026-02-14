-- PostgreSQL Replication Setup for OonruMail
-- This script configures the primary server for streaming replication

-- Create replication user with appropriate permissions
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicator') THEN
        CREATE ROLE replicator WITH LOGIN REPLICATION PASSWORD 'replication_secure_password';
    END IF;
END $$;

-- Grant necessary permissions to replication user
GRANT CONNECT ON DATABASE enterprise_email TO replicator;

-- Create replication slot if it doesn't exist (prevents WAL segment removal before replica catches up)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_replication_slots WHERE slot_name = 'replica_1_slot') THEN
        PERFORM pg_create_physical_replication_slot('replica_1_slot');
    END IF;
END $$;

-- Create function to monitor replication lag
CREATE OR REPLACE FUNCTION get_replication_lag()
RETURNS TABLE (
    client_addr inet,
    state text,
    sent_lag interval,
    write_lag interval,
    flush_lag interval,
    replay_lag interval
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.client_addr,
        r.state,
        r.sent_lsn - r.write_lsn AS sent_lag_lsn,
        r.write_lsn - r.flush_lsn AS write_lag_lsn,
        r.flush_lsn - r.replay_lsn AS flush_lag_lsn,
        r.replay_lag
    FROM pg_stat_replication r;
END;
$$ LANGUAGE plpgsql;

-- Create view for replication monitoring
CREATE OR REPLACE VIEW replication_status AS
SELECT
    client_addr,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    write_lag,
    flush_lag,
    replay_lag,
    sync_priority,
    sync_state,
    application_name
FROM pg_stat_replication;

-- Grant monitoring permissions
GRANT SELECT ON replication_status TO replicator;
GRANT EXECUTE ON FUNCTION get_replication_lag() TO replicator;

-- Create extension for monitoring (if not exists)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Log successful setup
DO $$
BEGIN
    RAISE NOTICE 'Replication setup completed successfully';
END $$;
