-- Fix: domain-manager uses 'name', auth uses 'domain_name'
-- Solution: rename back to 'name' and add 'domain_name' as a stored generated column won't work
-- because generated columns can't be used in INSERT statements by auth service.
--
-- Real solution: rename back to 'name' and add 'domain_name' as a regular column that
-- stays in sync via triggers.

BEGIN;

-- First, drop the new constraint/index
ALTER TABLE domains DROP CONSTRAINT IF EXISTS domains_domain_name_key;
DROP INDEX IF EXISTS idx_domains_domain_name;

-- Rename domain_name back to name
ALTER TABLE domains RENAME COLUMN domain_name TO name;

-- Recreate original constraint and index
ALTER TABLE domains ADD CONSTRAINT domains_name_key UNIQUE (name);
CREATE INDEX IF NOT EXISTS idx_domains_name ON domains(name);

-- Add domain_name as a real column that mirrors 'name'
ALTER TABLE domains ADD COLUMN IF NOT EXISTS domain_name VARCHAR(255);

-- Backfill domain_name from name
UPDATE domains SET domain_name = name WHERE domain_name IS NULL;

-- Create triggers to keep name and domain_name in sync
CREATE OR REPLACE FUNCTION sync_domain_name_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- If domain_name was set (auth service INSERT/UPDATE), sync to name
    IF TG_OP = 'INSERT' THEN
        IF NEW.domain_name IS NOT NULL AND NEW.name IS NULL THEN
            NEW.name := NEW.domain_name;
        ELSIF NEW.name IS NOT NULL AND NEW.domain_name IS NULL THEN
            NEW.domain_name := NEW.name;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.domain_name IS DISTINCT FROM OLD.domain_name THEN
            NEW.name := NEW.domain_name;
        ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
            NEW.domain_name := NEW.name;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_domain_names ON domains;
CREATE TRIGGER sync_domain_names
    BEFORE INSERT OR UPDATE ON domains
    FOR EACH ROW
    EXECUTE FUNCTION sync_domain_name_columns();

-- Verify
SELECT name, domain_name, status, is_verified FROM domains;

COMMIT;
