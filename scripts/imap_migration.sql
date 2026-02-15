-- IMAP Mail Tables Migration
-- Creates mail_folders and mail_messages tables for the web mail interface

-- Fix null domain_id in mailboxes
UPDATE mailboxes SET domain_id = sub.did FROM (
  SELECT m.id as mid, d.id as did FROM mailboxes m
  JOIN domains d ON m.email LIKE '%@' || d.name
  WHERE m.domain_id IS NULL AND m.email IS NOT NULL
) sub WHERE mailboxes.id = sub.mid;

-- Create mail_folders table
CREATE TABLE IF NOT EXISTS mail_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  full_path VARCHAR(1024) NOT NULL,
  parent_id UUID REFERENCES mail_folders(id) ON DELETE CASCADE,
  special_use VARCHAR(50),
  uid_validity INTEGER NOT NULL DEFAULT 1,
  uid_next INTEGER NOT NULL DEFAULT 1,
  message_count INTEGER NOT NULL DEFAULT 0,
  unseen_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_folders_mailbox ON mail_folders(mailbox_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_folders_path ON mail_folders(mailbox_id, full_path);

-- Create mail_messages table
CREATE TABLE IF NOT EXISTS mail_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES mail_folders(id) ON DELETE CASCADE,
  mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  uid INTEGER NOT NULL,
  message_id VARCHAR(512),
  in_reply_to VARCHAR(512),
  references_header TEXT,
  subject TEXT NOT NULL DEFAULT '',
  sender JSONB NOT NULL DEFAULT '{}',
  recipients_to JSONB NOT NULL DEFAULT '[]',
  recipients_cc JSONB NOT NULL DEFAULT '[]',
  recipients_bcc JSONB NOT NULL DEFAULT '[]',
  reply_to VARCHAR(255),
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  size INTEGER NOT NULL DEFAULT 0,
  flags JSONB NOT NULL DEFAULT '[]',
  snippet TEXT NOT NULL DEFAULT '',
  text_body TEXT,
  html_body TEXT,
  raw_headers JSONB,
  body_path VARCHAR(1024),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_messages_folder ON mail_messages(folder_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_mailbox ON mail_messages(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_date ON mail_messages(date DESC);
CREATE INDEX IF NOT EXISTS idx_mail_messages_uid ON mail_messages(folder_id, uid);
CREATE INDEX IF NOT EXISTS idx_mail_messages_flags ON mail_messages USING gin(flags);
CREATE INDEX IF NOT EXISTS idx_mail_messages_message_id ON mail_messages(message_id);

-- Create default system folders for all mailboxes that have valid emails
INSERT INTO mail_folders (mailbox_id, name, full_path, special_use, sort_order)
SELECT m.id, 'Inbox', 'INBOX', '\Inbox', 0 FROM mailboxes m
WHERE m.email IS NOT NULL
ON CONFLICT (mailbox_id, full_path) DO NOTHING;

INSERT INTO mail_folders (mailbox_id, name, full_path, special_use, sort_order)
SELECT m.id, 'Sent', 'Sent', '\Sent', 1 FROM mailboxes m
WHERE m.email IS NOT NULL
ON CONFLICT (mailbox_id, full_path) DO NOTHING;

INSERT INTO mail_folders (mailbox_id, name, full_path, special_use, sort_order)
SELECT m.id, 'Drafts', 'Drafts', '\Drafts', 2 FROM mailboxes m
WHERE m.email IS NOT NULL
ON CONFLICT (mailbox_id, full_path) DO NOTHING;

INSERT INTO mail_folders (mailbox_id, name, full_path, special_use, sort_order)
SELECT m.id, 'Trash', 'Trash', '\Trash', 3 FROM mailboxes m
WHERE m.email IS NOT NULL
ON CONFLICT (mailbox_id, full_path) DO NOTHING;

INSERT INTO mail_folders (mailbox_id, name, full_path, special_use, sort_order)
SELECT m.id, 'Spam', 'Spam', '\Junk', 4 FROM mailboxes m
WHERE m.email IS NOT NULL
ON CONFLICT (mailbox_id, full_path) DO NOTHING;

INSERT INTO mail_folders (mailbox_id, name, full_path, special_use, sort_order)
SELECT m.id, 'Archive', 'Archive', '\Archive', 5 FROM mailboxes m
WHERE m.email IS NOT NULL
ON CONFLICT (mailbox_id, full_path) DO NOTHING;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_mail_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mail_folders_updated_at ON mail_folders;
CREATE TRIGGER trg_mail_folders_updated_at
  BEFORE UPDATE ON mail_folders
  FOR EACH ROW EXECUTE FUNCTION update_mail_folders_updated_at();
