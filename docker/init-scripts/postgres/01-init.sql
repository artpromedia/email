-- ============================================================
-- ENTERPRISE EMAIL SYSTEM - DATABASE INITIALIZATION
-- ============================================================
-- This script runs automatically when PostgreSQL container starts
-- ============================================================

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create schemas for multi-tenant isolation
CREATE SCHEMA IF NOT EXISTS email;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS queue;

-- Set default search path
ALTER DATABASE enterprise_email SET search_path TO public, email, audit, queue;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA email TO email_admin;
GRANT ALL PRIVILEGES ON SCHEMA audit TO email_admin;
GRANT ALL PRIVILEGES ON SCHEMA queue TO email_admin;

-- Create enum types
DO $$ BEGIN
    CREATE TYPE email.domain_status AS ENUM ('pending', 'verifying', 'active', 'suspended', 'deleted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE email.email_status AS ENUM ('draft', 'queued', 'sending', 'sent', 'delivered', 'bounced', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE email.verification_type AS ENUM ('dns_txt', 'dns_cname', 'email', 'file');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Log successful initialization
DO $$
BEGIN
    RAISE NOTICE 'Database initialization completed successfully';
END $$;
