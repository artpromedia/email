-- Chat Service Database Schema
-- Migration: 001_chat.sql

-- Chat Channels
CREATE TABLE IF NOT EXISTS chat_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(20) NOT NULL DEFAULT 'public', -- public, private, direct
    topic TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_chat_channels_org ON chat_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_chat_channels_type ON chat_channels(type);
CREATE INDEX IF NOT EXISTS idx_chat_channels_slug ON chat_channels(slug);

-- Channel Members
CREATE TABLE IF NOT EXISTS chat_channel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member', -- owner, admin, member
    last_read_at TIMESTAMPTZ,
    last_read_msg_id UUID,
    is_muted BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_members_channel ON chat_channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_channel_members(user_id);

-- Chat Messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    parent_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL, -- For threads
    content TEXT NOT NULL,
    content_type VARCHAR(20) NOT NULL DEFAULT 'text', -- text, markdown, system
    is_edited BOOLEAN NOT NULL DEFAULT false,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_parent ON chat_messages(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned ON chat_messages(channel_id, is_pinned) WHERE is_pinned = true;

-- Message Reactions
CREATE TABLE IF NOT EXISTS chat_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_user ON chat_reactions(user_id);

-- Message Attachments
CREATE TABLE IF NOT EXISTS chat_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    storage_path TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON chat_attachments(message_id);

-- Add status fields to users for chat presence (if not exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status_text') THEN
        ALTER TABLE users ADD COLUMN status_text TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_seen_at') THEN
        ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;
    END IF;
END$$;

-- Update trigger for channels
CREATE OR REPLACE FUNCTION update_chat_channel_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_chat_channel_updated_at ON chat_channels;
CREATE TRIGGER update_chat_channel_updated_at
    BEFORE UPDATE ON chat_channels
    FOR EACH ROW EXECUTE FUNCTION update_chat_channel_timestamp();

-- Update trigger for messages
DROP TRIGGER IF EXISTS update_chat_message_updated_at ON chat_messages;
CREATE TRIGGER update_chat_message_updated_at
    BEFORE UPDATE ON chat_messages
    FOR EACH ROW EXECUTE FUNCTION update_chat_channel_timestamp();
