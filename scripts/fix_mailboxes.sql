-- Fix mailboxes table: sync email and domain_email columns
BEGIN;

-- Create trigger to sync email <-> domain_email
CREATE OR REPLACE FUNCTION sync_mailbox_email_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.domain_email IS NOT NULL AND NEW.email IS NULL THEN
            NEW.email := NEW.domain_email;
        ELSIF NEW.email IS NOT NULL AND NEW.domain_email IS NULL THEN
            NEW.domain_email := NEW.email;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.domain_email IS DISTINCT FROM OLD.domain_email THEN
            NEW.email := NEW.domain_email;
        ELSIF NEW.email IS DISTINCT FROM OLD.email THEN
            NEW.domain_email := NEW.email;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_mailbox_emails ON mailboxes;
CREATE TRIGGER sync_mailbox_emails
    BEFORE INSERT OR UPDATE ON mailboxes
    FOR EACH ROW
    EXECUTE FUNCTION sync_mailbox_email_columns();

-- Also drop the unique constraint on mailboxes_email_key if it causes issues
-- (auth creates with domain_email, the trigger syncs to email, but email needs to be unique)
-- Keep the constraint but make sure the trigger works

COMMIT;
