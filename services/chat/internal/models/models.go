package models

import (
	"time"

	"github.com/google/uuid"
)

// ChannelType represents the type of channel
type ChannelType string

const (
	ChannelTypePublic  ChannelType = "public"
	ChannelTypePrivate ChannelType = "private"
	ChannelTypeDirect  ChannelType = "direct"
)

// Channel represents a chat channel
type Channel struct {
	ID             uuid.UUID   `json:"id" db:"id"`
	OrganizationID uuid.UUID   `json:"organization_id" db:"organization_id"`
	Name           string      `json:"name" db:"name"`
	Slug           string      `json:"slug" db:"slug"`
	Description    string      `json:"description" db:"description"`
	Type           ChannelType `json:"type" db:"type"`
	Topic          string      `json:"topic" db:"topic"`
	IsArchived     bool        `json:"is_archived" db:"is_archived"`
	CreatedBy      uuid.UUID   `json:"created_by" db:"created_by"`
	CreatedAt      time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at" db:"updated_at"`

	// Computed fields
	MemberCount    int         `json:"member_count,omitempty" db:"member_count"`
	LastMessageAt  *time.Time  `json:"last_message_at,omitempty" db:"last_message_at"`
	UnreadCount    int         `json:"unread_count,omitempty" db:"unread_count"`
}

// ChannelMember represents a user's membership in a channel
type ChannelMember struct {
	ID            uuid.UUID  `json:"id" db:"id"`
	ChannelID     uuid.UUID  `json:"channel_id" db:"channel_id"`
	UserID        uuid.UUID  `json:"user_id" db:"user_id"`
	Role          string     `json:"role" db:"role"` // owner, admin, member
	LastReadAt    *time.Time `json:"last_read_at" db:"last_read_at"`
	LastReadMsgID *uuid.UUID `json:"last_read_msg_id" db:"last_read_msg_id"`
	IsMuted       bool       `json:"is_muted" db:"is_muted"`
	JoinedAt      time.Time  `json:"joined_at" db:"joined_at"`

	// Joined fields
	User *User `json:"user,omitempty"`
}

// Message represents a chat message
type Message struct {
	ID          uuid.UUID   `json:"id" db:"id"`
	ChannelID   uuid.UUID   `json:"channel_id" db:"channel_id"`
	UserID      uuid.UUID   `json:"user_id" db:"user_id"`
	ParentID    *uuid.UUID  `json:"parent_id,omitempty" db:"parent_id"` // For threads
	Content     string      `json:"content" db:"content"`
	ContentType string      `json:"content_type" db:"content_type"` // text, markdown, system
	IsEdited    bool        `json:"is_edited" db:"is_edited"`
	IsPinned    bool        `json:"is_pinned" db:"is_pinned"`
	IsDeleted   bool        `json:"is_deleted" db:"is_deleted"`
	Metadata    JSONMap     `json:"metadata,omitempty" db:"metadata"`
	CreatedAt   time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at" db:"updated_at"`

	// Computed/joined fields
	User         *User        `json:"user,omitempty"`
	Attachments  []Attachment `json:"attachments,omitempty"`
	Reactions    []Reaction   `json:"reactions,omitempty"`
	ReplyCount   int          `json:"reply_count,omitempty" db:"reply_count"`
	ThreadUsers  []User       `json:"thread_users,omitempty"`
}

// Attachment represents a file attached to a message
type Attachment struct {
	ID          uuid.UUID `json:"id" db:"id"`
	MessageID   uuid.UUID `json:"message_id" db:"message_id"`
	FileName    string    `json:"file_name" db:"file_name"`
	FileSize    int64     `json:"file_size" db:"file_size"`
	ContentType string    `json:"content_type" db:"content_type"`
	StoragePath string    `json:"storage_path" db:"storage_path"`
	URL         string    `json:"url" db:"url"`
	ThumbnailURL string   `json:"thumbnail_url,omitempty" db:"thumbnail_url"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

// Reaction represents an emoji reaction to a message
type Reaction struct {
	ID        uuid.UUID `json:"id" db:"id"`
	MessageID uuid.UUID `json:"message_id" db:"message_id"`
	UserID    uuid.UUID `json:"user_id" db:"user_id"`
	Emoji     string    `json:"emoji" db:"emoji"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`

	// Computed fields
	Count int    `json:"count,omitempty"`
	Users []User `json:"users,omitempty"`
}

// User represents a user in the chat system
type User struct {
	ID           uuid.UUID `json:"id" db:"id"`
	Email        string    `json:"email" db:"email"`
	DisplayName  string    `json:"display_name" db:"display_name"`
	AvatarURL    string    `json:"avatar_url,omitempty" db:"avatar_url"`
	Status       string    `json:"status" db:"status"` // online, away, dnd, offline
	StatusText   string    `json:"status_text,omitempty" db:"status_text"`
	LastSeenAt   time.Time `json:"last_seen_at" db:"last_seen_at"`
}

// Presence represents a user's online status
type Presence struct {
	UserID     uuid.UUID `json:"user_id"`
	Status     string    `json:"status"`
	StatusText string    `json:"status_text,omitempty"`
	LastSeenAt time.Time `json:"last_seen_at"`
}

// Thread represents a message thread
type Thread struct {
	ParentMessage *Message  `json:"parent_message"`
	Messages      []Message `json:"messages"`
	ReplyCount    int       `json:"reply_count"`
	Participants  []User    `json:"participants"`
}

// DirectMessage represents a direct message conversation
type DirectMessage struct {
	ChannelID uuid.UUID `json:"channel_id"`
	Users     []User    `json:"users"`
	Messages  []Message `json:"messages"`
}

// JSONMap is a helper type for JSON columns
type JSONMap map[string]interface{}

// Notification represents a chat notification
type Notification struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Type      string    `json:"type"` // mention, dm, reply
	ChannelID uuid.UUID `json:"channel_id"`
	MessageID uuid.UUID `json:"message_id"`
	Content   string    `json:"content"`
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}

// SearchResult represents a search result
type SearchResult struct {
	Messages []Message `json:"messages"`
	Channels []Channel `json:"channels"`
	Users    []User    `json:"users"`
	Total    int       `json:"total"`
}
