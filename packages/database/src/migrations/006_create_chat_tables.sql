-- Chat Service Database Schema
-- Migration: 001_create_chat_tables

-- Channels table
CREATE TABLE IF NOT EXISTS chat_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    type VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'private', 'direct')),
    topic VARCHAR(500) DEFAULT '',
    is_archived BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (organization_id, slug)
);

CREATE INDEX idx_chat_channels_org ON chat_channels(organization_id);
CREATE INDEX idx_chat_channels_type ON chat_channels(type);
CREATE INDEX idx_chat_channels_slug ON chat_channels(organization_id, slug);

-- Channel members table
CREATE TABLE IF NOT EXISTS chat_channel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    last_read_at TIMESTAMPTZ,
    last_read_msg_id UUID,
    is_muted BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (channel_id, user_id)
);

CREATE INDEX idx_chat_members_channel ON chat_channel_members(channel_id);
CREATE INDEX idx_chat_members_user ON chat_channel_members(user_id);

-- Messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    parent_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    content_type VARCHAR(20) DEFAULT 'text' CHECK (content_type IN ('text', 'markdown', 'system', 'code')),
    is_edited BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id, created_at DESC);
CREATE INDEX idx_chat_messages_parent ON chat_messages(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_pinned ON chat_messages(channel_id) WHERE is_pinned = TRUE;
CREATE INDEX idx_chat_messages_search ON chat_messages USING gin(to_tsvector('english', content));

-- Attachments table
CREATE TABLE IF NOT EXISTS chat_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    url VARCHAR(1000) NOT NULL,
    thumbnail_url VARCHAR(1000),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_attachments_message ON chat_attachments(message_id);

-- Reactions table
CREATE TABLE IF NOT EXISTS chat_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX idx_chat_reactions_message ON chat_reactions(message_id);

-- Notifications table
CREATE TABLE IF NOT EXISTS chat_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('mention', 'dm', 'reply', 'channel')),
    channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
    message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
    content TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_notifications_user ON chat_notifications(user_id, is_read, created_at DESC);

-- User status extensions (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status') THEN
        ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'offline';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status_text') THEN
        ALTER TABLE users ADD COLUMN status_text VARCHAR(255) DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_seen_at') THEN
        ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS chat_channels_updated_at ON chat_channels;
CREATE TRIGGER chat_channels_updated_at
    BEFORE UPDATE ON chat_channels
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_updated_at();

DROP TRIGGER IF EXISTS chat_messages_updated_at ON chat_messages;
CREATE TRIGGER chat_messages_updated_at
    BEFORE UPDATE ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_updated_at();

-- Comments
COMMENT ON TABLE chat_channels IS 'Chat channels for team communication';
COMMENT ON TABLE chat_channel_members IS 'Channel membership and read status';
COMMENT ON TABLE chat_messages IS 'Chat messages with threading support';
COMMENT ON TABLE chat_attachments IS 'File attachments for messages';
COMMENT ON TABLE chat_reactions IS 'Emoji reactions on messages';
COMMENT ON TABLE chat_notifications IS 'User notifications for mentions and DMs';
