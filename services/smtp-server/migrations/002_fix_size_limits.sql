-- Migration: Fix message size limit mismatches
-- Ensures all domains use the standardized 25MB (26214400 bytes) default
-- Previously, the SMTP config had 50MB (52428800) while the DB schema had 25MB

-- Update any domains that still have the old 50MB default
UPDATE domains
SET max_message_size = 26214400,
    updated_at = NOW()
WHERE max_message_size = 52428800;

-- Add a CHECK constraint to prevent unreasonably large size limits (max 100MB)
ALTER TABLE domains
ADD CONSTRAINT check_max_message_size
CHECK (max_message_size > 0 AND max_message_size <= 104857600);

-- Add a comment documenting the standard
COMMENT ON COLUMN domains.max_message_size IS 'Maximum message size in bytes. Default 25MB (26214400). Industry standard matches Gmail. Max allowed: 100MB.';
