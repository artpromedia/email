package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"domain-manager/domain"
)

// DomainRepository handles domain database operations
type DomainRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// NewDomainRepository creates a new domain repository
func NewDomainRepository(db *pgxpool.Pool, logger *zap.Logger) *DomainRepository {
	return &DomainRepository{
		db:     db,
		logger: logger,
	}
}

// Create creates a new domain
func (r *DomainRepository) Create(ctx context.Context, d *domain.Domain) error {
	query := `
		INSERT INTO domains (
			id, organization_id, name, display_name, status, is_primary,
			verification_token, mx_verified, spf_verified, dkim_verified, dmarc_verified,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
		)
	`

	_, err := r.db.Exec(ctx, query,
		d.ID, d.OrganizationID, d.DomainName, d.DisplayName, d.Status, d.IsPrimary,
		d.VerificationToken, d.MXVerified, d.SPFVerified, d.DKIMVerified, d.DMARCVerified,
		d.CreatedAt, d.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("create domain: %w", err)
	}

	return nil
}

// GetByID returns a domain by ID
func (r *DomainRepository) GetByID(ctx context.Context, id string) (*domain.Domain, error) {
	query := `
		SELECT 
			id, organization_id, name, display_name, status, is_primary,
			verification_token, mx_verified, spf_verified, dkim_verified, dmarc_verified,
			created_at, updated_at, verified_at, last_dns_check
		FROM domains
		WHERE id = $1 AND status != 'deleted'
	`

	var d domain.Domain
	var verifiedAt, lastDNSCheck *time.Time

	err := r.db.QueryRow(ctx, query, id).Scan(
		&d.ID, &d.OrganizationID, &d.DomainName, &d.DisplayName, &d.Status, &d.IsPrimary,
		&d.VerificationToken, &d.MXVerified, &d.SPFVerified, &d.DKIMVerified, &d.DMARCVerified,
		&d.CreatedAt, &d.UpdatedAt, &verifiedAt, &lastDNSCheck,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get domain by id: %w", err)
	}

	d.VerifiedAt = verifiedAt
	d.LastDNSCheck = lastDNSCheck

	return &d, nil
}

// GetByName returns a domain by name
func (r *DomainRepository) GetByName(ctx context.Context, name string) (*domain.Domain, error) {
	query := `
		SELECT 
			id, organization_id, name, display_name, status, is_primary,
			verification_token, mx_verified, spf_verified, dkim_verified, dmarc_verified,
			created_at, updated_at, verified_at, last_dns_check
		FROM domains
		WHERE name = $1 AND status != 'deleted'
	`

	var d domain.Domain
	var verifiedAt, lastDNSCheck *time.Time

	err := r.db.QueryRow(ctx, query, name).Scan(
		&d.ID, &d.OrganizationID, &d.DomainName, &d.DisplayName, &d.Status, &d.IsPrimary,
		&d.VerificationToken, &d.MXVerified, &d.SPFVerified, &d.DKIMVerified, &d.DMARCVerified,
		&d.CreatedAt, &d.UpdatedAt, &verifiedAt, &lastDNSCheck,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get domain by name: %w", err)
	}

	d.VerifiedAt = verifiedAt
	d.LastDNSCheck = lastDNSCheck

	return &d, nil
}

// ListByOrganization returns all domains for an organization
func (r *DomainRepository) ListByOrganization(ctx context.Context, orgID string) ([]*domain.Domain, error) {
	query := `
		SELECT 
			id, organization_id, name, display_name, status, is_primary,
			verification_token, mx_verified, spf_verified, dkim_verified, dmarc_verified,
			created_at, updated_at, verified_at, last_dns_check
		FROM domains
		WHERE organization_id = $1 AND status != 'deleted'
		ORDER BY is_primary DESC, name ASC
	`

	rows, err := r.db.Query(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("list domains by organization: %w", err)
	}
	defer rows.Close()

	var domains []*domain.Domain
	for rows.Next() {
		var d domain.Domain
		var verifiedAt, lastDNSCheck *time.Time

		err := rows.Scan(
			&d.ID, &d.OrganizationID, &d.DomainName, &d.DisplayName, &d.Status, &d.IsPrimary,
			&d.VerificationToken, &d.MXVerified, &d.SPFVerified, &d.DKIMVerified, &d.DMARCVerified,
			&d.CreatedAt, &d.UpdatedAt, &verifiedAt, &lastDNSCheck,
		)
		if err != nil {
			return nil, fmt.Errorf("scan domain: %w", err)
		}

		d.VerifiedAt = verifiedAt
		d.LastDNSCheck = lastDNSCheck
		domains = append(domains, &d)
	}

	return domains, rows.Err()
}

// Update updates a domain
func (r *DomainRepository) Update(ctx context.Context, d *domain.Domain) error {
	query := `
		UPDATE domains SET
			display_name = $2,
			status = $3,
			is_primary = $4,
			mx_verified = $5,
			spf_verified = $6,
			dkim_verified = $7,
			dmarc_verified = $8,
			updated_at = $9,
			verified_at = $10,
			last_dns_check = $11
		WHERE id = $1
	`

	_, err := r.db.Exec(ctx, query,
		d.ID, d.DisplayName, d.Status, d.IsPrimary,
		d.MXVerified, d.SPFVerified, d.DKIMVerified, d.DMARCVerified,
		d.UpdatedAt, d.VerifiedAt, d.LastDNSCheck,
	)
	if err != nil {
		return fmt.Errorf("update domain: %w", err)
	}

	return nil
}

// Delete soft-deletes a domain
func (r *DomainRepository) Delete(ctx context.Context, id string) error {
	query := `
		UPDATE domains SET
			status = 'deleted',
			updated_at = $2
		WHERE id = $1
	`

	_, err := r.db.Exec(ctx, query, id, time.Now())
	if err != nil {
		return fmt.Errorf("delete domain: %w", err)
	}

	return nil
}

// ListAllVerified returns all verified domains for monitoring
func (r *DomainRepository) ListAllVerified(ctx context.Context) ([]*domain.Domain, error) {
	query := `
		SELECT 
			id, organization_id, name, display_name, status, is_primary,
			verification_token, mx_verified, spf_verified, dkim_verified, dmarc_verified,
			created_at, updated_at, verified_at, last_dns_check
		FROM domains
		WHERE status = 'verified'
		ORDER BY last_dns_check ASC NULLS FIRST
	`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list verified domains: %w", err)
	}
	defer rows.Close()

	var domains []*domain.Domain
	for rows.Next() {
		var d domain.Domain
		var verifiedAt, lastDNSCheck *time.Time

		err := rows.Scan(
			&d.ID, &d.OrganizationID, &d.DomainName, &d.DisplayName, &d.Status, &d.IsPrimary,
			&d.VerificationToken, &d.MXVerified, &d.SPFVerified, &d.DKIMVerified, &d.DMARCVerified,
			&d.CreatedAt, &d.UpdatedAt, &verifiedAt, &lastDNSCheck,
		)
		if err != nil {
			return nil, fmt.Errorf("scan domain: %w", err)
		}

		d.VerifiedAt = verifiedAt
		d.LastDNSCheck = lastDNSCheck
		domains = append(domains, &d)
	}

	return domains, rows.Err()
}

// UpdateDNSStatus updates DNS verification status
func (r *DomainRepository) UpdateDNSStatus(ctx context.Context, id string, mx, spf, dkim, dmarc bool) error {
	now := time.Now()
	query := `
		UPDATE domains SET
			mx_verified = $2,
			spf_verified = $3,
			dkim_verified = $4,
			dmarc_verified = $5,
			last_dns_check = $6,
			updated_at = $6
		WHERE id = $1
	`

	_, err := r.db.Exec(ctx, query, id, mx, spf, dkim, dmarc, now)
	if err != nil {
		return fmt.Errorf("update dns status: %w", err)
	}

	return nil
}

// DKIMKeyRepository handles DKIM key database operations
type DKIMKeyRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// NewDKIMKeyRepository creates a new DKIM key repository
func NewDKIMKeyRepository(db *pgxpool.Pool, logger *zap.Logger) *DKIMKeyRepository {
	return &DKIMKeyRepository{
		db:     db,
		logger: logger,
	}
}

// Create creates a new DKIM key
func (r *DKIMKeyRepository) Create(ctx context.Context, key *domain.DKIMKey) error {
	query := `
		INSERT INTO dkim_keys (
			id, domain_id, selector, algorithm, key_size,
			public_key, private_key, is_active, created_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9
		)
	`

	_, err := r.db.Exec(ctx, query,
		key.ID, key.DomainID, key.Selector, key.Algorithm, key.KeySize,
		key.PublicKey, key.PrivateKeyEncrypted, key.IsActive, key.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("create dkim key: %w", err)
	}

	return nil
}

// GetByID returns a DKIM key by ID
func (r *DKIMKeyRepository) GetByID(ctx context.Context, id string) (*domain.DKIMKey, error) {
	query := `
		SELECT 
			id, domain_id, selector, algorithm, key_size,
			public_key, private_key, is_active, created_at, activated_at, expires_at, rotated_at
		FROM dkim_keys
		WHERE id = $1
	`

	var key domain.DKIMKey
	var activatedAt, expiresAt, rotatedAt *time.Time

	err := r.db.QueryRow(ctx, query, id).Scan(
		&key.ID, &key.DomainID, &key.Selector, &key.Algorithm, &key.KeySize,
		&key.PublicKey, &key.PrivateKeyEncrypted, &key.IsActive, &key.CreatedAt,
		&activatedAt, &expiresAt, &rotatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get dkim key by id: %w", err)
	}

	key.ActivatedAt = activatedAt
	key.ExpiresAt = expiresAt
	key.RotatedAt = rotatedAt

	return &key, nil
}

// ListByDomain returns all DKIM keys for a domain
func (r *DKIMKeyRepository) ListByDomain(ctx context.Context, domainID string) ([]*domain.DKIMKey, error) {
	query := `
		SELECT 
			id, domain_id, selector, algorithm, key_size,
			public_key, private_key, is_active, created_at, activated_at, expires_at, rotated_at
		FROM dkim_keys
		WHERE domain_id = $1
		ORDER BY created_at DESC
	`

	rows, err := r.db.Query(ctx, query, domainID)
	if err != nil {
		return nil, fmt.Errorf("list dkim keys by domain: %w", err)
	}
	defer rows.Close()

	var keys []*domain.DKIMKey
	for rows.Next() {
		var key domain.DKIMKey
		var activatedAt, expiresAt, rotatedAt *time.Time

		err := rows.Scan(
			&key.ID, &key.DomainID, &key.Selector, &key.Algorithm, &key.KeySize,
			&key.PublicKey, &key.PrivateKeyEncrypted, &key.IsActive, &key.CreatedAt,
			&activatedAt, &expiresAt, &rotatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan dkim key: %w", err)
		}

		key.ActivatedAt = activatedAt
		key.ExpiresAt = expiresAt
		key.RotatedAt = rotatedAt
		keys = append(keys, &key)
	}

	return keys, rows.Err()
}

// Activate activates a DKIM key
func (r *DKIMKeyRepository) Activate(ctx context.Context, id string) error {
	now := time.Now()
	query := `UPDATE dkim_keys SET is_active = true, activated_at = $2 WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id, now)
	if err != nil {
		return fmt.Errorf("activate dkim key: %w", err)
	}
	return nil
}

// Deactivate deactivates a DKIM key
func (r *DKIMKeyRepository) Deactivate(ctx context.Context, id string) error {
	query := `UPDATE dkim_keys SET is_active = false WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("deactivate dkim key: %w", err)
	}
	return nil
}

// DeactivateAllForDomain deactivates all keys for a domain
func (r *DKIMKeyRepository) DeactivateAllForDomain(ctx context.Context, domainID string) error {
	query := `UPDATE dkim_keys SET is_active = false WHERE domain_id = $1`
	_, err := r.db.Exec(ctx, query, domainID)
	if err != nil {
		return fmt.Errorf("deactivate all dkim keys: %w", err)
	}
	return nil
}

// MarkRotated marks a key as rotated
func (r *DKIMKeyRepository) MarkRotated(ctx context.Context, id string) error {
	now := time.Now()
	query := `UPDATE dkim_keys SET rotated_at = $2, is_active = false WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id, now)
	if err != nil {
		return fmt.Errorf("mark dkim key rotated: %w", err)
	}
	return nil
}

// Delete deletes a DKIM key
func (r *DKIMKeyRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM dkim_keys WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("delete dkim key: %w", err)
	}
	return nil
}

// BrandingRepository handles branding database operations
type BrandingRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// NewBrandingRepository creates a new branding repository
func NewBrandingRepository(db *pgxpool.Pool, logger *zap.Logger) *BrandingRepository {
	return &BrandingRepository{
		db:     db,
		logger: logger,
	}
}

// Upsert creates or updates branding
func (r *BrandingRepository) Upsert(ctx context.Context, b *domain.Branding) error {
	query := `
		INSERT INTO domain_branding (
			id, domain_id, logo_url, favicon_url, primary_color,
			login_background_url, email_header_html, email_footer_html, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9
		)
		ON CONFLICT (domain_id) DO UPDATE SET
			logo_url = EXCLUDED.logo_url,
			favicon_url = EXCLUDED.favicon_url,
			primary_color = EXCLUDED.primary_color,
			login_background_url = EXCLUDED.login_background_url,
			email_header_html = EXCLUDED.email_header_html,
			email_footer_html = EXCLUDED.email_footer_html,
			updated_at = EXCLUDED.updated_at
	`

	_, err := r.db.Exec(ctx, query,
		b.ID, b.DomainID, b.LogoURL, b.FaviconURL, b.PrimaryColor,
		b.LoginBackgroundURL, b.EmailHeaderHTML, b.EmailFooterHTML, b.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert branding: %w", err)
	}

	return nil
}

// GetByDomainID returns branding by domain ID
func (r *BrandingRepository) GetByDomainID(ctx context.Context, domainID string) (*domain.Branding, error) {
	query := `
		SELECT 
			id, domain_id, logo_url, favicon_url, primary_color,
			login_background_url, email_header_html, email_footer_html, updated_at
		FROM domain_branding
		WHERE domain_id = $1
	`

	var b domain.Branding
	err := r.db.QueryRow(ctx, query, domainID).Scan(
		&b.ID, &b.DomainID, &b.LogoURL, &b.FaviconURL, &b.PrimaryColor,
		&b.LoginBackgroundURL, &b.EmailHeaderHTML, &b.EmailFooterHTML, &b.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get branding by domain id: %w", err)
	}

	return &b, nil
}

// GetByDomainName returns branding by domain name
func (r *BrandingRepository) GetByDomainName(ctx context.Context, domainName string) (*domain.Branding, error) {
	query := `
		SELECT 
			b.id, b.domain_id, b.logo_url, b.favicon_url, b.primary_color,
			b.login_background_url, b.email_header_html, b.email_footer_html, b.updated_at
		FROM domain_branding b
		JOIN domains d ON d.id = b.domain_id
		WHERE d.name = $1 AND d.status = 'verified'
	`

	var b domain.Branding
	err := r.db.QueryRow(ctx, query, domainName).Scan(
		&b.ID, &b.DomainID, &b.LogoURL, &b.FaviconURL, &b.PrimaryColor,
		&b.LoginBackgroundURL, &b.EmailHeaderHTML, &b.EmailFooterHTML, &b.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get branding by domain name: %w", err)
	}

	return &b, nil
}

// PoliciesRepository handles policies database operations
type PoliciesRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// NewPoliciesRepository creates a new policies repository
func NewPoliciesRepository(db *pgxpool.Pool, logger *zap.Logger) *PoliciesRepository {
	return &PoliciesRepository{
		db:     db,
		logger: logger,
	}
}

// Upsert creates or updates policies
func (r *PoliciesRepository) Upsert(ctx context.Context, p *domain.Policies) error {
	allowedJSON, _ := json.Marshal(p.AllowedRecipientDomains)
	blockedJSON, _ := json.Marshal(p.BlockedRecipientDomains)
	attachmentJSON, _ := json.Marshal(p.AttachmentPolicy)

	query := `
		INSERT INTO domain_policies (
			id, domain_id, max_message_size_bytes, max_recipients_per_message,
			max_messages_per_day_per_user, require_tls_outbound,
			allowed_recipient_domains, blocked_recipient_domains,
			auto_bcc_address, default_signature_enforced, attachment_policy, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
		)
		ON CONFLICT (domain_id) DO UPDATE SET
			max_message_size_bytes = EXCLUDED.max_message_size_bytes,
			max_recipients_per_message = EXCLUDED.max_recipients_per_message,
			max_messages_per_day_per_user = EXCLUDED.max_messages_per_day_per_user,
			require_tls_outbound = EXCLUDED.require_tls_outbound,
			allowed_recipient_domains = EXCLUDED.allowed_recipient_domains,
			blocked_recipient_domains = EXCLUDED.blocked_recipient_domains,
			auto_bcc_address = EXCLUDED.auto_bcc_address,
			default_signature_enforced = EXCLUDED.default_signature_enforced,
			attachment_policy = EXCLUDED.attachment_policy,
			updated_at = EXCLUDED.updated_at
	`

	_, err := r.db.Exec(ctx, query,
		p.ID, p.DomainID, p.MaxMessageSizeBytes, p.MaxRecipientsPerMessage,
		p.MaxMessagesPerDayPerUser, p.RequireTLSOutbound,
		allowedJSON, blockedJSON,
		p.AutoBCCAddress, p.DefaultSignatureEnforced, attachmentJSON, p.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert policies: %w", err)
	}

	return nil
}

// GetByDomainID returns policies by domain ID
func (r *PoliciesRepository) GetByDomainID(ctx context.Context, domainID string) (*domain.Policies, error) {
	query := `
		SELECT 
			id, domain_id, max_message_size_bytes, max_recipients_per_message,
			max_messages_per_day_per_user, require_tls_outbound,
			allowed_recipient_domains, blocked_recipient_domains,
			auto_bcc_address, default_signature_enforced, attachment_policy, updated_at
		FROM domain_policies
		WHERE domain_id = $1
	`

	var p domain.Policies
	var allowedJSON, blockedJSON, attachmentJSON []byte

	err := r.db.QueryRow(ctx, query, domainID).Scan(
		&p.ID, &p.DomainID, &p.MaxMessageSizeBytes, &p.MaxRecipientsPerMessage,
		&p.MaxMessagesPerDayPerUser, &p.RequireTLSOutbound,
		&allowedJSON, &blockedJSON,
		&p.AutoBCCAddress, &p.DefaultSignatureEnforced, &attachmentJSON, &p.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get policies by domain id: %w", err)
	}

	json.Unmarshal(allowedJSON, &p.AllowedRecipientDomains)
	json.Unmarshal(blockedJSON, &p.BlockedRecipientDomains)
	json.Unmarshal(attachmentJSON, &p.AttachmentPolicy)

	return &p, nil
}

// CatchAllRepository handles catch-all config database operations
type CatchAllRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// NewCatchAllRepository creates a new catch-all repository
func NewCatchAllRepository(db *pgxpool.Pool, logger *zap.Logger) *CatchAllRepository {
	return &CatchAllRepository{
		db:     db,
		logger: logger,
	}
}

// Upsert creates or updates catch-all config
func (r *CatchAllRepository) Upsert(ctx context.Context, c *domain.CatchAllConfig) error {
	query := `
		INSERT INTO domain_catch_all (
			id, domain_id, enabled, action, deliver_to, forward_to, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7
		)
		ON CONFLICT (domain_id) DO UPDATE SET
			enabled = EXCLUDED.enabled,
			action = EXCLUDED.action,
			deliver_to = EXCLUDED.deliver_to,
			forward_to = EXCLUDED.forward_to,
			updated_at = EXCLUDED.updated_at
	`

	_, err := r.db.Exec(ctx, query,
		c.ID, c.DomainID, c.Enabled, c.Action, c.DeliverTo, c.ForwardTo, c.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("upsert catch-all: %w", err)
	}

	return nil
}

// GetByDomainID returns catch-all config by domain ID
func (r *CatchAllRepository) GetByDomainID(ctx context.Context, domainID string) (*domain.CatchAllConfig, error) {
	query := `
		SELECT id, domain_id, enabled, action, deliver_to, forward_to, updated_at
		FROM domain_catch_all
		WHERE domain_id = $1
	`

	var c domain.CatchAllConfig
	err := r.db.QueryRow(ctx, query, domainID).Scan(
		&c.ID, &c.DomainID, &c.Enabled, &c.Action, &c.DeliverTo, &c.ForwardTo, &c.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get catch-all by domain id: %w", err)
	}

	return &c, nil
}

// StatsRepository handles statistics queries
type StatsRepository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// NewStatsRepository creates a new stats repository
func NewStatsRepository(db *pgxpool.Pool, logger *zap.Logger) *StatsRepository {
	return &StatsRepository{
		db:     db,
		logger: logger,
	}
}

// GetDomainStats returns statistics for a domain
func (r *StatsRepository) GetDomainStats(ctx context.Context, domainID string) (*domain.DomainStats, error) {
	stats := &domain.DomainStats{
		DomainID:   domainID,
		ComputedAt: time.Now(),
	}

	// Get user count
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(DISTINCT user_id) FROM mailboxes WHERE domain_id = $1
	`, domainID).Scan(&stats.UserCount)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("get user count: %w", err)
	}

	// Get mailbox count
	err = r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM mailboxes WHERE domain_id = $1
	`, domainID).Scan(&stats.MailboxCount)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("get mailbox count: %w", err)
	}

	// Get alias count
	err = r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM aliases WHERE domain_id = $1
	`, domainID).Scan(&stats.AliasCount)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("get alias count: %w", err)
	}

	// Get storage used
	err = r.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(storage_used_bytes), 0) FROM mailboxes WHERE domain_id = $1
	`, domainID).Scan(&stats.StorageUsedBytes)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("get storage used: %w", err)
	}

	// Get emails sent today
	today := time.Now().Truncate(24 * time.Hour)
	err = r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM message_queue 
		WHERE domain_id = $1 AND created_at >= $2 AND status = 'delivered'
	`, domainID, today).Scan(&stats.EmailsSentToday)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("get emails sent: %w", err)
	}

	// Get emails received today (from inbox table if exists)
	// Placeholder - would need actual inbox table
	stats.EmailsReceivedToday = 0

	// Get spam blocked today (placeholder)
	stats.SpamBlockedToday = 0

	return stats, nil
}
