package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"

	"chat/config"
	"chat/internal/models"
)

// Repository handles data persistence
type Repository struct {
	db    *sqlx.DB
	redis *redis.Client
	cfg   *config.Config
}

// New creates a new repository
func New(cfg *config.Config) (*Repository, error) {
	// Connect to PostgreSQL
	db, err := sqlx.Connect("postgres", cfg.Database.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	db.SetMaxOpenConns(cfg.Database.MaxConns)
	db.SetMaxIdleConns(cfg.Database.MinConns)
	db.SetConnMaxLifetime(cfg.Database.MaxConnLifetime)

	// Connect to Redis
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Redis.Addr,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})

	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}

	return &Repository{
		db:    db,
		redis: rdb,
		cfg:   cfg,
	}, nil
}

// Close closes database connections
func (r *Repository) Close() error {
	if err := r.redis.Close(); err != nil {
		return err
	}
	return r.db.Close()
}

// ============================================================================
// Channel Operations
// ============================================================================

// CreateChannel creates a new channel
func (r *Repository) CreateChannel(ctx context.Context, channel *models.Channel) error {
	query := `
		INSERT INTO chat_channels (id, organization_id, name, slug, description, type, topic, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	channel.ID = uuid.New()
	channel.CreatedAt = time.Now()
	channel.UpdatedAt = time.Now()

	_, err := r.db.ExecContext(ctx, query,
		channel.ID, channel.OrganizationID, channel.Name, channel.Slug,
		channel.Description, channel.Type, channel.Topic, channel.CreatedBy,
		channel.CreatedAt, channel.UpdatedAt,
	)
	return err
}

// GetChannel retrieves a channel by ID
func (r *Repository) GetChannel(ctx context.Context, channelID uuid.UUID) (*models.Channel, error) {
	var channel models.Channel
	query := `
		SELECT c.*,
			(SELECT COUNT(*) FROM chat_channel_members WHERE channel_id = c.id) as member_count,
			(SELECT MAX(created_at) FROM chat_messages WHERE channel_id = c.id AND is_deleted = false) as last_message_at
		FROM chat_channels c
		WHERE c.id = $1
	`
	err := r.db.GetContext(ctx, &channel, query, channelID)
	if err != nil {
		return nil, err
	}
	return &channel, nil
}

// GetChannelBySlug retrieves a channel by organization and slug
func (r *Repository) GetChannelBySlug(ctx context.Context, orgID uuid.UUID, slug string) (*models.Channel, error) {
	var channel models.Channel
	query := `
		SELECT c.*,
			(SELECT COUNT(*) FROM chat_channel_members WHERE channel_id = c.id) as member_count
		FROM chat_channels c
		WHERE c.organization_id = $1 AND c.slug = $2
	`
	err := r.db.GetContext(ctx, &channel, query, orgID, slug)
	if err != nil {
		return nil, err
	}
	return &channel, nil
}

// ListChannels lists channels for an organization
func (r *Repository) ListChannels(ctx context.Context, orgID, userID uuid.UUID, includePrivate bool) ([]models.Channel, error) {
	var channels []models.Channel
	query := `
		SELECT c.*,
			(SELECT COUNT(*) FROM chat_channel_members WHERE channel_id = c.id) as member_count,
			(SELECT MAX(created_at) FROM chat_messages WHERE channel_id = c.id AND is_deleted = false) as last_message_at,
			COALESCE((
				SELECT COUNT(*) FROM chat_messages m
				WHERE m.channel_id = c.id AND m.is_deleted = false
				AND m.created_at > COALESCE(
					(SELECT last_read_at FROM chat_channel_members WHERE channel_id = c.id AND user_id = $2),
					'1970-01-01'
				)
			), 0) as unread_count
		FROM chat_channels c
		WHERE c.organization_id = $1
		AND c.is_archived = false
		AND (
			c.type = 'public'
			OR EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = c.id AND user_id = $2)
		)
		ORDER BY c.name ASC
	`
	err := r.db.SelectContext(ctx, &channels, query, orgID, userID)
	return channels, err
}

// ListUserChannels lists channels a user is a member of
func (r *Repository) ListUserChannels(ctx context.Context, userID uuid.UUID) ([]models.Channel, error) {
	var channels []models.Channel
	query := `
		SELECT c.*,
			(SELECT COUNT(*) FROM chat_channel_members WHERE channel_id = c.id) as member_count,
			(SELECT MAX(created_at) FROM chat_messages WHERE channel_id = c.id AND is_deleted = false) as last_message_at,
			COALESCE((
				SELECT COUNT(*) FROM chat_messages m
				WHERE m.channel_id = c.id AND m.is_deleted = false
				AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')
			), 0) as unread_count
		FROM chat_channels c
		INNER JOIN chat_channel_members cm ON cm.channel_id = c.id AND cm.user_id = $1
		WHERE c.is_archived = false
		ORDER BY c.name ASC
	`
	err := r.db.SelectContext(ctx, &channels, query, userID)
	return channels, err
}

// UpdateChannel updates a channel
func (r *Repository) UpdateChannel(ctx context.Context, channel *models.Channel) error {
	query := `
		UPDATE chat_channels
		SET name = $2, description = $3, topic = $4, is_archived = $5, updated_at = $6
		WHERE id = $1
	`
	channel.UpdatedAt = time.Now()
	_, err := r.db.ExecContext(ctx, query,
		channel.ID, channel.Name, channel.Description, channel.Topic,
		channel.IsArchived, channel.UpdatedAt,
	)
	return err
}

// DeleteChannel deletes a channel
func (r *Repository) DeleteChannel(ctx context.Context, channelID uuid.UUID) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Delete messages
	_, err = tx.ExecContext(ctx, "DELETE FROM chat_messages WHERE channel_id = $1", channelID)
	if err != nil {
		return err
	}

	// Delete members
	_, err = tx.ExecContext(ctx, "DELETE FROM chat_channel_members WHERE channel_id = $1", channelID)
	if err != nil {
		return err
	}

	// Delete channel
	_, err = tx.ExecContext(ctx, "DELETE FROM chat_channels WHERE id = $1", channelID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// ============================================================================
// Channel Member Operations
// ============================================================================

// AddChannelMember adds a member to a channel
func (r *Repository) AddChannelMember(ctx context.Context, member *models.ChannelMember) error {
	query := `
		INSERT INTO chat_channel_members (id, channel_id, user_id, role, joined_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (channel_id, user_id) DO NOTHING
	`
	member.ID = uuid.New()
	member.JoinedAt = time.Now()

	_, err := r.db.ExecContext(ctx, query,
		member.ID, member.ChannelID, member.UserID, member.Role, member.JoinedAt,
	)
	return err
}

// RemoveChannelMember removes a member from a channel
func (r *Repository) RemoveChannelMember(ctx context.Context, channelID, userID uuid.UUID) error {
	query := `DELETE FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2`
	_, err := r.db.ExecContext(ctx, query, channelID, userID)
	return err
}

// GetChannelMembers gets all members of a channel
func (r *Repository) GetChannelMembers(ctx context.Context, channelID uuid.UUID) ([]models.ChannelMember, error) {
	var members []models.ChannelMember
	query := `
		SELECT cm.*, u.email, u.display_name, u.avatar_url, u.status
		FROM chat_channel_members cm
		INNER JOIN users u ON u.id = cm.user_id
		WHERE cm.channel_id = $1
		ORDER BY cm.joined_at ASC
	`
	err := r.db.SelectContext(ctx, &members, query, channelID)
	return members, err
}

// IsMember checks if a user is a member of a channel
func (r *Repository) IsMember(ctx context.Context, channelID, userID uuid.UUID) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2`
	err := r.db.GetContext(ctx, &count, query, channelID, userID)
	return count > 0, err
}

// UpdateLastRead updates the last read timestamp for a member
func (r *Repository) UpdateLastRead(ctx context.Context, channelID, userID uuid.UUID, messageID *uuid.UUID) error {
	query := `
		UPDATE chat_channel_members
		SET last_read_at = $3, last_read_msg_id = $4
		WHERE channel_id = $1 AND user_id = $2
	`
	_, err := r.db.ExecContext(ctx, query, channelID, userID, time.Now(), messageID)
	return err
}

// ============================================================================
// Message Operations
// ============================================================================

// CreateMessage creates a new message
func (r *Repository) CreateMessage(ctx context.Context, message *models.Message) error {
	query := `
		INSERT INTO chat_messages (id, channel_id, user_id, parent_id, content, content_type, metadata, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	message.ID = uuid.New()
	message.CreatedAt = time.Now()
	message.UpdatedAt = time.Now()

	_, err := r.db.ExecContext(ctx, query,
		message.ID, message.ChannelID, message.UserID, message.ParentID,
		message.Content, message.ContentType, message.Metadata,
		message.CreatedAt, message.UpdatedAt,
	)
	return err
}

// GetMessage retrieves a message by ID
func (r *Repository) GetMessage(ctx context.Context, messageID uuid.UUID) (*models.Message, error) {
	var message models.Message
	query := `
		SELECT m.*,
			u.email as "user.email", u.display_name as "user.display_name", u.avatar_url as "user.avatar_url",
			(SELECT COUNT(*) FROM chat_messages WHERE parent_id = m.id AND is_deleted = false) as reply_count
		FROM chat_messages m
		INNER JOIN users u ON u.id = m.user_id
		WHERE m.id = $1
	`
	err := r.db.GetContext(ctx, &message, query, messageID)
	if err != nil {
		return nil, err
	}
	return &message, nil
}

// ListMessages lists messages in a channel with pagination
func (r *Repository) ListMessages(ctx context.Context, channelID uuid.UUID, limit int, before *uuid.UUID) ([]models.Message, error) {
	var messages []models.Message
	var err error

	if before == nil {
		query := `
			SELECT m.*,
				u.id as "user.id", u.email as "user.email", u.display_name as "user.display_name", u.avatar_url as "user.avatar_url",
				(SELECT COUNT(*) FROM chat_messages WHERE parent_id = m.id AND is_deleted = false) as reply_count
			FROM chat_messages m
			INNER JOIN users u ON u.id = m.user_id
			WHERE m.channel_id = $1 AND m.is_deleted = false AND m.parent_id IS NULL
			ORDER BY m.created_at DESC
			LIMIT $2
		`
		err = r.db.SelectContext(ctx, &messages, query, channelID, limit)
	} else {
		query := `
			SELECT m.*,
				u.id as "user.id", u.email as "user.email", u.display_name as "user.display_name", u.avatar_url as "user.avatar_url",
				(SELECT COUNT(*) FROM chat_messages WHERE parent_id = m.id AND is_deleted = false) as reply_count
			FROM chat_messages m
			INNER JOIN users u ON u.id = m.user_id
			WHERE m.channel_id = $1 AND m.is_deleted = false AND m.parent_id IS NULL
			AND m.created_at < (SELECT created_at FROM chat_messages WHERE id = $3)
			ORDER BY m.created_at DESC
			LIMIT $2
		`
		err = r.db.SelectContext(ctx, &messages, query, channelID, limit, before)
	}

	// Reverse to chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages, err
}

// ListThreadMessages lists messages in a thread
func (r *Repository) ListThreadMessages(ctx context.Context, parentID uuid.UUID, limit int) ([]models.Message, error) {
	var messages []models.Message
	query := `
		SELECT m.*,
			u.id as "user.id", u.email as "user.email", u.display_name as "user.display_name", u.avatar_url as "user.avatar_url"
		FROM chat_messages m
		INNER JOIN users u ON u.id = m.user_id
		WHERE m.parent_id = $1 AND m.is_deleted = false
		ORDER BY m.created_at ASC
		LIMIT $2
	`
	err := r.db.SelectContext(ctx, &messages, query, parentID, limit)
	return messages, err
}

// UpdateMessage updates a message
func (r *Repository) UpdateMessage(ctx context.Context, message *models.Message) error {
	query := `
		UPDATE chat_messages
		SET content = $2, is_edited = true, updated_at = $3
		WHERE id = $1
	`
	message.UpdatedAt = time.Now()
	_, err := r.db.ExecContext(ctx, query, message.ID, message.Content, message.UpdatedAt)
	return err
}

// DeleteMessage soft deletes a message
func (r *Repository) DeleteMessage(ctx context.Context, messageID uuid.UUID) error {
	query := `UPDATE chat_messages SET is_deleted = true, updated_at = $2 WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, messageID, time.Now())
	return err
}

// PinMessage pins/unpins a message
func (r *Repository) PinMessage(ctx context.Context, messageID uuid.UUID, isPinned bool) error {
	query := `UPDATE chat_messages SET is_pinned = $2, updated_at = $3 WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, messageID, isPinned, time.Now())
	return err
}

// GetPinnedMessages gets pinned messages for a channel
func (r *Repository) GetPinnedMessages(ctx context.Context, channelID uuid.UUID) ([]models.Message, error) {
	var messages []models.Message
	query := `
		SELECT m.*,
			u.id as "user.id", u.email as "user.email", u.display_name as "user.display_name", u.avatar_url as "user.avatar_url"
		FROM chat_messages m
		INNER JOIN users u ON u.id = m.user_id
		WHERE m.channel_id = $1 AND m.is_pinned = true AND m.is_deleted = false
		ORDER BY m.created_at DESC
	`
	err := r.db.SelectContext(ctx, &messages, query, channelID)
	return messages, err
}

// ============================================================================
// Reaction Operations
// ============================================================================

// AddReaction adds a reaction to a message
func (r *Repository) AddReaction(ctx context.Context, reaction *models.Reaction) error {
	query := `
		INSERT INTO chat_reactions (id, message_id, user_id, emoji, created_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (message_id, user_id, emoji) DO NOTHING
	`
	reaction.ID = uuid.New()
	reaction.CreatedAt = time.Now()

	_, err := r.db.ExecContext(ctx, query,
		reaction.ID, reaction.MessageID, reaction.UserID, reaction.Emoji, reaction.CreatedAt,
	)
	return err
}

// RemoveReaction removes a reaction from a message
func (r *Repository) RemoveReaction(ctx context.Context, messageID, userID uuid.UUID, emoji string) error {
	query := `DELETE FROM chat_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`
	_, err := r.db.ExecContext(ctx, query, messageID, userID, emoji)
	return err
}

// GetMessageReactions gets all reactions for a message
func (r *Repository) GetMessageReactions(ctx context.Context, messageID uuid.UUID) ([]models.Reaction, error) {
	var reactions []models.Reaction
	query := `
		SELECT emoji, COUNT(*) as count, array_agg(user_id) as user_ids
		FROM chat_reactions
		WHERE message_id = $1
		GROUP BY emoji
	`
	err := r.db.SelectContext(ctx, &reactions, query, messageID)
	return reactions, err
}

// ============================================================================
// Attachment Operations
// ============================================================================

// CreateAttachment creates a new attachment
func (r *Repository) CreateAttachment(ctx context.Context, attachment *models.Attachment) error {
	query := `
		INSERT INTO chat_attachments (id, message_id, file_name, file_size, content_type, storage_path, url, thumbnail_url, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	attachment.ID = uuid.New()
	attachment.CreatedAt = time.Now()

	_, err := r.db.ExecContext(ctx, query,
		attachment.ID, attachment.MessageID, attachment.FileName, attachment.FileSize,
		attachment.ContentType, attachment.StoragePath, attachment.URL, attachment.ThumbnailURL,
		attachment.CreatedAt,
	)
	return err
}

// GetMessageAttachments gets attachments for a message
func (r *Repository) GetMessageAttachments(ctx context.Context, messageID uuid.UUID) ([]models.Attachment, error) {
	var attachments []models.Attachment
	query := `SELECT * FROM chat_attachments WHERE message_id = $1 ORDER BY created_at ASC`
	err := r.db.SelectContext(ctx, &attachments, query, messageID)
	return attachments, err
}

// ============================================================================
// Direct Message Operations
// ============================================================================

// GetOrCreateDirectChannel gets or creates a direct message channel between users
func (r *Repository) GetOrCreateDirectChannel(ctx context.Context, orgID uuid.UUID, userIDs []uuid.UUID) (*models.Channel, error) {
	// Sort user IDs to ensure consistent channel lookup
	if len(userIDs) != 2 {
		return nil, fmt.Errorf("direct messages require exactly 2 users")
	}

	// Try to find existing channel
	query := `
		SELECT c.* FROM chat_channels c
		WHERE c.organization_id = $1 AND c.type = 'direct'
		AND EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = c.id AND user_id = $2)
		AND EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = c.id AND user_id = $3)
		AND (SELECT COUNT(*) FROM chat_channel_members WHERE channel_id = c.id) = 2
		LIMIT 1
	`

	var channel models.Channel
	err := r.db.GetContext(ctx, &channel, query, orgID, userIDs[0], userIDs[1])
	if err == nil {
		return &channel, nil
	}

	if err != sql.ErrNoRows {
		return nil, err
	}

	// Create new direct channel
	channel = models.Channel{
		ID:             uuid.New(),
		OrganizationID: orgID,
		Name:           "Direct Message",
		Slug:           uuid.New().String(),
		Type:           models.ChannelTypeDirect,
		CreatedBy:      userIDs[0],
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Create channel
	_, err = tx.ExecContext(ctx, `
		INSERT INTO chat_channels (id, organization_id, name, slug, type, created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, channel.ID, channel.OrganizationID, channel.Name, channel.Slug, channel.Type,
		channel.CreatedBy, channel.CreatedAt, channel.UpdatedAt)
	if err != nil {
		return nil, err
	}

	// Add both users as members
	for _, userID := range userIDs {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO chat_channel_members (id, channel_id, user_id, role, joined_at)
			VALUES ($1, $2, $3, 'member', $4)
		`, uuid.New(), channel.ID, userID, time.Now())
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &channel, nil
}

// ============================================================================
// Search Operations
// ============================================================================

// SearchMessages searches messages
func (r *Repository) SearchMessages(ctx context.Context, orgID, userID uuid.UUID, query string, limit int) ([]models.Message, error) {
	var messages []models.Message
	sqlQuery := `
		SELECT m.*,
			u.id as "user.id", u.email as "user.email", u.display_name as "user.display_name",
			c.name as channel_name
		FROM chat_messages m
		INNER JOIN users u ON u.id = m.user_id
		INNER JOIN chat_channels c ON c.id = m.channel_id
		WHERE c.organization_id = $1
		AND m.is_deleted = false
		AND m.content ILIKE '%' || $2 || '%'
		AND (c.type = 'public' OR EXISTS (
			SELECT 1 FROM chat_channel_members WHERE channel_id = c.id AND user_id = $3
		))
		ORDER BY m.created_at DESC
		LIMIT $4
	`
	err := r.db.SelectContext(ctx, &messages, sqlQuery, orgID, query, userID, limit)
	return messages, err
}

// ============================================================================
// User Operations
// ============================================================================

// GetUser retrieves a user by ID
func (r *Repository) GetUser(ctx context.Context, userID uuid.UUID) (*models.User, error) {
	var user models.User
	query := `SELECT id, email, display_name, avatar_url, status, status_text, last_seen_at FROM users WHERE id = $1`
	err := r.db.GetContext(ctx, &user, query, userID)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// UpdateUserStatus updates a user's status
func (r *Repository) UpdateUserStatus(ctx context.Context, userID uuid.UUID, status, statusText string) error {
	query := `UPDATE users SET status = $2, status_text = $3, last_seen_at = $4 WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, userID, status, statusText, time.Now())
	return err
}

// GetOrganizationUsers gets all users in an organization
func (r *Repository) GetOrganizationUsers(ctx context.Context, orgID uuid.UUID) ([]models.User, error) {
	var users []models.User
	query := `
		SELECT u.id, u.email, u.display_name, u.avatar_url, u.status, u.status_text, u.last_seen_at
		FROM users u
		INNER JOIN organization_members om ON om.user_id = u.id
		WHERE om.organization_id = $1
		ORDER BY u.display_name ASC
	`
	err := r.db.SelectContext(ctx, &users, query, orgID)
	return users, err
}

// ============================================================================
// Redis Operations (Presence & Caching)
// ============================================================================

// SetUserPresence sets user presence in Redis
func (r *Repository) SetUserPresence(ctx context.Context, userID uuid.UUID, status string, ttl time.Duration) error {
	key := fmt.Sprintf("presence:%s", userID)
	return r.redis.Set(ctx, key, status, ttl).Err()
}

// GetUserPresence gets user presence from Redis
func (r *Repository) GetUserPresence(ctx context.Context, userID uuid.UUID) (string, error) {
	key := fmt.Sprintf("presence:%s", userID)
	return r.redis.Get(ctx, key).Result()
}

// CacheChannel caches channel data
func (r *Repository) CacheChannel(ctx context.Context, channel *models.Channel, ttl time.Duration) error {
	// Implementation for caching
	return nil
}

// GetCachedChannel retrieves cached channel data
func (r *Repository) GetCachedChannel(ctx context.Context, channelID uuid.UUID) (*models.Channel, error) {
	// Implementation for cache retrieval
	return nil, redis.Nil
}
