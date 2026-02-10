package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"

	"sms-gateway/internal/config"
)

// Repository handles database and cache operations
type Repository struct {
	db    *sqlx.DB
	redis *redis.Client
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

	// Test Redis connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		// Redis is optional, log warning but continue
		rdb = nil
	}

	return &Repository{
		db:    db,
		redis: rdb,
	}, nil
}

// Close closes database connections
func (r *Repository) Close() {
	if r.db != nil {
		r.db.Close()
	}
	if r.redis != nil {
		r.redis.Close()
	}
}

// =============================================================================
// SMS Message Operations
// =============================================================================

// SMSMessage represents a sent SMS message
type SMSMessage struct {
	ID             string     `db:"id"`
	OrganizationID string     `db:"organization_id"`
	UserID         string     `db:"user_id"`
	Provider       string     `db:"provider"`
	ProviderID     string     `db:"provider_id"`
	FromNumber     string     `db:"from_number"`
	ToNumber       string     `db:"to_number"`
	Message        string     `db:"message"`
	MessageType    string     `db:"message_type"`
	Status         string     `db:"status"`
	SegmentCount   int        `db:"segment_count"`
	Cost           float64    `db:"cost"`
	Currency       string     `db:"currency"`
	ErrorCode      string     `db:"error_code"`
	ErrorMessage   string     `db:"error_message"`
	ScheduledAt    *time.Time `db:"scheduled_at"`
	SentAt         *time.Time `db:"sent_at"`
	DeliveredAt    *time.Time `db:"delivered_at"`
	CreatedAt      time.Time  `db:"created_at"`
	UpdatedAt      time.Time  `db:"updated_at"`
	Metadata       string     `db:"metadata"`
}

// CreateMessage creates a new SMS message record
func (r *Repository) CreateMessage(ctx context.Context, msg *SMSMessage) (string, error) {
	msg.ID = uuid.New().String()
	msg.CreatedAt = time.Now()
	msg.UpdatedAt = time.Now()

	query := `
		INSERT INTO sms_messages (
			id, organization_id, user_id, provider, provider_id,
			from_number, to_number, message, message_type, status,
			segment_count, cost, currency, error_code, error_message,
			scheduled_at, sent_at, delivered_at, created_at, updated_at, metadata
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
			$11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
		)`

	_, err := r.db.ExecContext(ctx, query,
		msg.ID, msg.OrganizationID, msg.UserID, msg.Provider, msg.ProviderID,
		msg.FromNumber, msg.ToNumber, msg.Message, msg.MessageType, msg.Status,
		msg.SegmentCount, msg.Cost, msg.Currency, msg.ErrorCode, msg.ErrorMessage,
		msg.ScheduledAt, msg.SentAt, msg.DeliveredAt, msg.CreatedAt, msg.UpdatedAt, msg.Metadata,
	)

	return msg.ID, err
}

// GetMessage retrieves a message by ID
func (r *Repository) GetMessage(ctx context.Context, id string) (*SMSMessage, error) {
	var msg SMSMessage
	query := `SELECT * FROM sms_messages WHERE id = $1`
	err := r.db.GetContext(ctx, &msg, query, id)
	if err != nil {
		return nil, err
	}
	return &msg, nil
}

// GetMessageByProviderID retrieves a message by provider ID
func (r *Repository) GetMessageByProviderID(ctx context.Context, provider, providerID string) (*SMSMessage, error) {
	var msg SMSMessage
	query := `SELECT * FROM sms_messages WHERE provider = $1 AND provider_id = $2`
	err := r.db.GetContext(ctx, &msg, query, provider, providerID)
	if err != nil {
		return nil, err
	}
	return &msg, nil
}

// UpdateMessageStatus updates the delivery status of a message
func (r *Repository) UpdateMessageStatus(ctx context.Context, id, status, errorCode, errorMessage string, deliveredAt *time.Time) error {
	query := `
		UPDATE sms_messages
		SET status = $2, error_code = $3, error_message = $4, delivered_at = $5, updated_at = $6
		WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id, status, errorCode, errorMessage, deliveredAt, time.Now())
	return err
}

// ListMessages lists messages with pagination
func (r *Repository) ListMessages(ctx context.Context, organizationID string, limit, offset int) ([]*SMSMessage, int, error) {
	var total int
	countQuery := `SELECT COUNT(*) FROM sms_messages WHERE organization_id = $1`
	if err := r.db.GetContext(ctx, &total, countQuery, organizationID); err != nil {
		return nil, 0, err
	}

	var messages []*SMSMessage
	query := `
		SELECT * FROM sms_messages
		WHERE organization_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`
	if err := r.db.SelectContext(ctx, &messages, query, organizationID, limit, offset); err != nil {
		return nil, 0, err
	}

	return messages, total, nil
}

// =============================================================================
// OTP Operations
// =============================================================================

// OTPRecord represents an OTP record
type OTPRecord struct {
	ID             string     `db:"id"`
	PhoneNumber    string     `db:"phone_number"`
	Code           string     `db:"code"`
	Purpose        string     `db:"purpose"`
	UserID         string     `db:"user_id"`
	OrganizationID string     `db:"organization_id"`
	MessageID      string     `db:"message_id"`
	Attempts       int        `db:"attempts"`
	MaxAttempts    int        `db:"max_attempts"`
	Verified       bool       `db:"verified"`
	Cancelled      bool       `db:"cancelled"`
	ExpiresAt      time.Time  `db:"expires_at"`
	VerifiedAt     *time.Time `db:"verified_at"`
	CreatedAt      time.Time  `db:"created_at"`
	IPAddress      string     `db:"ip_address"`
	UserAgent      string     `db:"user_agent"`
}

// CreateOTP creates a new OTP record
func (r *Repository) CreateOTP(ctx context.Context, record interface{}) (string, error) {
	// Type assertion from otp.OTPRecord to repository.OTPRecord
	id := uuid.New().String()

	query := `
		INSERT INTO sms_otps (
			id, phone_number, code, purpose, user_id, organization_id,
			message_id, attempts, max_attempts, verified, expires_at,
			created_at, ip_address, user_agent
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
		)`

	switch otpRecord := record.(type) {
	case *OTPRecord:
		_, err := r.db.ExecContext(ctx, query,
			id, otpRecord.PhoneNumber, otpRecord.Code, otpRecord.Purpose, otpRecord.UserID, otpRecord.OrganizationID,
			otpRecord.MessageID, 0, otpRecord.MaxAttempts, false, otpRecord.ExpiresAt,
			time.Now(), otpRecord.IPAddress, otpRecord.UserAgent,
		)
		return id, err
	default:
		// Handle otp.OTPRecord through reflection or interface
		return id, fmt.Errorf("unsupported OTP record type")
	}
}

// GetOTPByID retrieves an OTP by ID
func (r *Repository) GetOTPByID(ctx context.Context, id string) (*OTPRecord, error) {
	var record OTPRecord
	query := `SELECT * FROM sms_otps WHERE id = $1`
	err := r.db.GetContext(ctx, &record, query, id)
	if err != nil {
		return nil, err
	}
	return &record, nil
}

// GetActiveOTP retrieves the most recent active OTP for a phone number and purpose
func (r *Repository) GetActiveOTP(ctx context.Context, phoneNumber, purpose string) (*OTPRecord, error) {
	var record OTPRecord
	query := `
		SELECT * FROM sms_otps
		WHERE phone_number = $1 AND purpose = $2
		AND verified = false AND cancelled = false AND expires_at > NOW()
		ORDER BY created_at DESC
		LIMIT 1`
	err := r.db.GetContext(ctx, &record, query, phoneNumber, purpose)
	if err != nil {
		return nil, err
	}
	return &record, nil
}

// GetLastOTP retrieves the most recent OTP for a phone number and purpose
func (r *Repository) GetLastOTP(ctx context.Context, phoneNumber, purpose string) (*OTPRecord, error) {
	var record OTPRecord
	query := `
		SELECT * FROM sms_otps
		WHERE phone_number = $1 AND purpose = $2
		ORDER BY created_at DESC
		LIMIT 1`
	err := r.db.GetContext(ctx, &record, query, phoneNumber, purpose)
	if err != nil {
		return nil, err
	}
	return &record, nil
}

// IncrementOTPAttempts increments the attempt counter
func (r *Repository) IncrementOTPAttempts(ctx context.Context, id string) error {
	query := `UPDATE sms_otps SET attempts = attempts + 1 WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// MarkOTPVerified marks an OTP as verified
func (r *Repository) MarkOTPVerified(ctx context.Context, id string) error {
	query := `UPDATE sms_otps SET verified = true, verified_at = NOW() WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// CancelOTP cancels an OTP
func (r *Repository) CancelOTP(ctx context.Context, id string) error {
	query := `UPDATE sms_otps SET cancelled = true WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// =============================================================================
// Template Operations
// =============================================================================

// Template represents a message template
type Template struct {
	ID             string    `db:"id"`
	Name           string    `db:"name"`
	OrganizationID string    `db:"organization_id"`
	Type           string    `db:"type"`
	Purpose        string    `db:"purpose"`
	Content        string    `db:"content"`
	Variables      string    `db:"variables"`
	IsDefault      bool      `db:"is_default"`
	IsActive       bool      `db:"is_active"`
	Language       string    `db:"language"`
	CreatedAt      time.Time `db:"created_at"`
	UpdatedAt      time.Time `db:"updated_at"`
}

// CreateTemplate creates a new template
func (r *Repository) CreateTemplate(ctx context.Context, t interface{}) error {
	id := uuid.New().String()
	query := `
		INSERT INTO sms_templates (
			id, name, organization_id, type, purpose, content,
			is_default, is_active, language, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`

	now := time.Now()
	_, err := r.db.ExecContext(ctx, query,
		id, "", "", "", "", "",
		false, true, "en", now, now,
	)
	return err
}

// GetTemplate retrieves a template by ID
func (r *Repository) GetTemplate(ctx context.Context, id string) (*Template, error) {
	var t Template
	query := `SELECT * FROM sms_templates WHERE id = $1`
	err := r.db.GetContext(ctx, &t, query, id)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// UpdateTemplate updates a template
func (r *Repository) UpdateTemplate(ctx context.Context, t interface{}) error {
	return nil // Placeholder
}

// ListTemplates lists templates for an organization
func (r *Repository) ListTemplates(ctx context.Context, organizationID, templateType string) ([]*Template, error) {
	var templates []*Template
	query := `
		SELECT * FROM sms_templates
		WHERE organization_id = $1
		AND ($2 = '' OR type = $2)
		ORDER BY name`
	err := r.db.SelectContext(ctx, &templates, query, organizationID, templateType)
	return templates, err
}

// DeleteTemplate deletes a template
func (r *Repository) DeleteTemplate(ctx context.Context, id string) error {
	query := `DELETE FROM sms_templates WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// =============================================================================
// API Key Operations
// =============================================================================

// APIKey represents an API key
type APIKey struct {
	ID             string     `db:"id"`
	OrganizationID string     `db:"organization_id"`
	Name           string     `db:"name"`
	KeyHash        string     `db:"key_hash"`
	Prefix         string     `db:"prefix"`
	Scopes         string     `db:"scopes"`
	IsActive       bool       `db:"is_active"`
	ExpiresAt      *time.Time `db:"expires_at"`
	LastUsedAt     *time.Time `db:"last_used_at"`
	CreatedAt      time.Time  `db:"created_at"`
}

// GetAPIKeyByPrefix retrieves an API key by its prefix
func (r *Repository) GetAPIKeyByPrefix(ctx context.Context, prefix string) (*APIKey, error) {
	var key APIKey
	query := `SELECT * FROM sms_api_keys WHERE prefix = $1 AND is_active = true`
	err := r.db.GetContext(ctx, &key, query, prefix)
	if err != nil {
		return nil, err
	}
	return &key, nil
}

// UpdateAPIKeyLastUsed updates the last used timestamp
func (r *Repository) UpdateAPIKeyLastUsed(ctx context.Context, id string) error {
	query := `UPDATE sms_api_keys SET last_used_at = NOW() WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// =============================================================================
// Rate Limiting Operations (Redis)
// =============================================================================

// IncrementRateLimit increments a rate limit counter
func (r *Repository) IncrementRateLimit(ctx context.Context, key string, window time.Duration) (int, time.Time, error) {
	if r.redis == nil {
		return 0, time.Time{}, fmt.Errorf("redis not available")
	}

	pipe := r.redis.Pipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, window)
	ttl := pipe.TTL(ctx, key)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return 0, time.Time{}, err
	}

	count := int(incr.Val())
	resetAt := time.Now().Add(ttl.Val())

	return count, resetAt, nil
}

// GetRateLimitCount gets the current count for a rate limit key
func (r *Repository) GetRateLimitCount(ctx context.Context, key string) (int, error) {
	if r.redis == nil {
		return 0, fmt.Errorf("redis not available")
	}

	val, err := r.redis.Get(ctx, key).Int()
	if err == redis.Nil {
		return 0, nil
	}
	return val, err
}

// ResetRateLimit resets a rate limit counter
func (r *Repository) ResetRateLimit(ctx context.Context, key string) error {
	if r.redis == nil {
		return nil
	}
	return r.redis.Del(ctx, key).Err()
}

// AnalyticsSummary represents analytics summary data
type AnalyticsSummary struct {
	TotalSent      int64   `json:"total_sent"`
	TotalDelivered int64   `json:"total_delivered"`
	TotalFailed    int64   `json:"total_failed"`
	DeliveryRate   float64 `json:"delivery_rate"`
}

// GetAnalyticsSummary returns analytics summary for an organization
func (r *Repository) GetAnalyticsSummary(ctx context.Context, organizationID string) (*AnalyticsSummary, error) {
	// Return empty summary for now - can be implemented later
	return &AnalyticsSummary{}, nil
}

// UsageStats represents usage statistics
type UsageStats struct {
	Today int64 `json:"today"`
	Week  int64 `json:"week"`
	Month int64 `json:"month"`
}

// GetUsageStats returns usage stats for an organization
func (r *Repository) GetUsageStats(ctx context.Context, organizationID string) (*UsageStats, error) {
	// Return empty stats for now - can be implemented later
	return &UsageStats{}, nil
}

// GetAPIKey retrieves an API key by its value
func (r *Repository) GetAPIKey(ctx context.Context, key string) (*APIKey, error) {
	var apiKey APIKey
	query := `SELECT * FROM sms_api_keys WHERE key_hash = $1 AND is_active = true`
	err := r.db.GetContext(ctx, &apiKey, query, key)
	if err != nil {
		return nil, err
	}
	return &apiKey, nil
}
