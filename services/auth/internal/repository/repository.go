// Package repository provides database access layer.
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/artpromedia/email/services/auth/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Common errors
var (
	ErrNotFound          = errors.New("record not found")
	ErrDuplicateEmail    = errors.New("email address already exists")
	ErrDuplicateDomain   = errors.New("domain already exists")
	ErrInvalidDomain     = errors.New("domain is not valid for this organization")
	ErrUserLocked        = errors.New("user account is locked")
	ErrDomainNotVerified = errors.New("domain is not verified")
)

// Repository provides database operations.
type Repository struct {
	pool *pgxpool.Pool
}

// New creates a new Repository.
func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// ============================================================
// ORGANIZATION OPERATIONS
// ============================================================

// GetOrganizationByID retrieves an organization by ID.
func (r *Repository) GetOrganizationByID(ctx context.Context, id uuid.UUID) (*models.Organization, error) {
	query := `
		SELECT id, name, slug, logo_url, settings, subscription_tier,
		       max_domains, max_users, is_active, created_at, updated_at
		FROM organizations
		WHERE id = $1
	`

	var org models.Organization
	var settingsJSON []byte

	err := r.pool.QueryRow(ctx, query, id).Scan(
		&org.ID, &org.Name, &org.Slug, &org.LogoURL, &settingsJSON,
		&org.SubscriptionTier, &org.MaxDomains, &org.MaxUsers,
		&org.IsActive, &org.CreatedAt, &org.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get organization: %w", err)
	}

	if err := json.Unmarshal(settingsJSON, &org.Settings); err != nil {
		return nil, fmt.Errorf("failed to unmarshal settings: %w", err)
	}

	return &org, nil
}

// GetOrganizationBySlug retrieves an organization by slug.
func (r *Repository) GetOrganizationBySlug(ctx context.Context, slug string) (*models.Organization, error) {
	query := `
		SELECT id, name, slug, logo_url, settings, subscription_tier,
		       max_domains, max_users, is_active, created_at, updated_at
		FROM organizations
		WHERE slug = $1
	`

	var org models.Organization
	var settingsJSON []byte

	err := r.pool.QueryRow(ctx, query, slug).Scan(
		&org.ID, &org.Name, &org.Slug, &org.LogoURL, &settingsJSON,
		&org.SubscriptionTier, &org.MaxDomains, &org.MaxUsers,
		&org.IsActive, &org.CreatedAt, &org.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get organization: %w", err)
	}

	if err := json.Unmarshal(settingsJSON, &org.Settings); err != nil {
		return nil, fmt.Errorf("failed to unmarshal settings: %w", err)
	}

	return &org, nil
}

// ============================================================
// DOMAIN OPERATIONS
// ============================================================

// GetDomainByName retrieves a domain by name.
func (r *Repository) GetDomainByName(ctx context.Context, domainName string) (*models.Domain, error) {
	query := `
		SELECT id, organization_id, domain_name, is_primary, is_verified,
		       verification_status, verification_token, verified_at,
		       mx_verified, spf_verified, dkim_verified, dmarc_verified,
		       is_active, created_at, updated_at
		FROM domains
		WHERE LOWER(domain_name) = LOWER($1)
	`

	var domain models.Domain
	err := r.pool.QueryRow(ctx, query, domainName).Scan(
		&domain.ID, &domain.OrganizationID, &domain.DomainName, &domain.IsPrimary,
		&domain.IsVerified, &domain.VerificationStatus, &domain.VerificationToken,
		&domain.VerifiedAt, &domain.MXVerified, &domain.SPFVerified,
		&domain.DKIMVerified, &domain.DMARCVerified, &domain.IsActive,
		&domain.CreatedAt, &domain.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get domain: %w", err)
	}

	return &domain, nil
}

// GetDomainByID retrieves a domain by ID.
func (r *Repository) GetDomainByID(ctx context.Context, id uuid.UUID) (*models.Domain, error) {
	query := `
		SELECT id, organization_id, domain_name, is_primary, is_verified,
		       verification_status, verification_token, verified_at,
		       mx_verified, spf_verified, dkim_verified, dmarc_verified,
		       is_active, created_at, updated_at
		FROM domains
		WHERE id = $1
	`

	var domain models.Domain
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&domain.ID, &domain.OrganizationID, &domain.DomainName, &domain.IsPrimary,
		&domain.IsVerified, &domain.VerificationStatus, &domain.VerificationToken,
		&domain.VerifiedAt, &domain.MXVerified, &domain.SPFVerified,
		&domain.DKIMVerified, &domain.DMARCVerified, &domain.IsActive,
		&domain.CreatedAt, &domain.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get domain: %w", err)
	}

	return &domain, nil
}

// GetDomainsByOrganizationID retrieves all domains for an organization.
func (r *Repository) GetDomainsByOrganizationID(ctx context.Context, orgID uuid.UUID) ([]models.Domain, error) {
	query := `
		SELECT id, organization_id, domain_name, is_primary, is_verified,
		       verification_status, verification_token, verified_at,
		       mx_verified, spf_verified, dkim_verified, dmarc_verified,
		       is_active, created_at, updated_at
		FROM domains
		WHERE organization_id = $1
		ORDER BY is_primary DESC, domain_name ASC
	`

	rows, err := r.pool.Query(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("failed to query domains: %w", err)
	}
	defer rows.Close()

	var domains []models.Domain
	for rows.Next() {
		var domain models.Domain
		if err := rows.Scan(
			&domain.ID, &domain.OrganizationID, &domain.DomainName, &domain.IsPrimary,
			&domain.IsVerified, &domain.VerificationStatus, &domain.VerificationToken,
			&domain.VerifiedAt, &domain.MXVerified, &domain.SPFVerified,
			&domain.DKIMVerified, &domain.DMARCVerified, &domain.IsActive,
			&domain.CreatedAt, &domain.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan domain: %w", err)
		}
		domains = append(domains, domain)
	}

	return domains, nil
}

// ============================================================
// USER OPERATIONS
// ============================================================

// GetUserByID retrieves a user by ID.
func (r *Repository) GetUserByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	query := `
		SELECT id, organization_id, external_id, display_name, password_hash,
		       role, status, timezone, locale, avatar_url, mfa_enabled,
		       mfa_secret, mfa_backup_codes, password_changed_at, last_login_at,
		       last_login_ip, failed_login_attempts, locked_until, email_verified,
		       email_verification_token, created_at, updated_at
		FROM users
		WHERE id = $1
	`

	var user models.User
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&user.ID, &user.OrganizationID, &user.ExternalID, &user.DisplayName,
		&user.PasswordHash, &user.Role, &user.Status, &user.Timezone, &user.Locale,
		&user.AvatarURL, &user.MFAEnabled, &user.MFASecret, &user.MFABackupCodes,
		&user.PasswordChangedAt, &user.LastLoginAt, &user.LastLoginIP,
		&user.FailedLoginAttempts, &user.LockedUntil, &user.EmailVerified,
		&user.EmailVerificationToken, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return &user, nil
}

// GetUserByEmail retrieves a user by any of their email addresses.
func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	query := `
		SELECT u.id, u.organization_id, u.external_id, u.display_name, u.password_hash,
		       u.role, u.status, u.timezone, u.locale, u.avatar_url, u.mfa_enabled,
		       u.mfa_secret, u.mfa_backup_codes, u.password_changed_at, u.last_login_at,
		       u.last_login_ip, u.failed_login_attempts, u.locked_until, u.email_verified,
		       u.email_verification_token, u.created_at, u.updated_at
		FROM users u
		INNER JOIN user_email_addresses uea ON u.id = uea.user_id
		WHERE LOWER(uea.email_address) = LOWER($1)
	`

	var user models.User
	err := r.pool.QueryRow(ctx, query, email).Scan(
		&user.ID, &user.OrganizationID, &user.ExternalID, &user.DisplayName,
		&user.PasswordHash, &user.Role, &user.Status, &user.Timezone, &user.Locale,
		&user.AvatarURL, &user.MFAEnabled, &user.MFASecret, &user.MFABackupCodes,
		&user.PasswordChangedAt, &user.LastLoginAt, &user.LastLoginIP,
		&user.FailedLoginAttempts, &user.LockedUntil, &user.EmailVerified,
		&user.EmailVerificationToken, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get user by email: %w", err)
	}

	return &user, nil
}

// CreateUser creates a new user with their primary email address and mailbox.
func (r *Repository) CreateUser(ctx context.Context, user *models.User, email *models.UserEmailAddress, mailbox *models.Mailbox) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Create user
	userQuery := `
		INSERT INTO users (id, organization_id, display_name, password_hash, role, status,
		                   timezone, locale, email_verified, email_verification_token, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`
	_, err = tx.Exec(ctx, userQuery,
		user.ID, user.OrganizationID, user.DisplayName, user.PasswordHash,
		user.Role, user.Status, user.Timezone, user.Locale,
		user.EmailVerified, user.EmailVerificationToken,
		user.CreatedAt, user.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return ErrDuplicateEmail
		}
		return fmt.Errorf("failed to create user: %w", err)
	}

	// Create email address
	emailQuery := `
		INSERT INTO user_email_addresses (id, user_id, domain_id, email_address, local_part,
		                                  is_primary, is_verified, verification_token, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err = tx.Exec(ctx, emailQuery,
		email.ID, email.UserID, email.DomainID, email.EmailAddress, email.LocalPart,
		email.IsPrimary, email.IsVerified, email.VerificationToken, email.CreatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return ErrDuplicateEmail
		}
		return fmt.Errorf("failed to create email address: %w", err)
	}

	// Create mailbox
	mailboxQuery := `
		INSERT INTO mailboxes (id, user_id, email_address_id, domain_email, display_name,
		                       quota_bytes, used_bytes, settings, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	settingsJSON, _ := json.Marshal(mailbox.Settings)
	_, err = tx.Exec(ctx, mailboxQuery,
		mailbox.ID, mailbox.UserID, mailbox.EmailAddressID, mailbox.DomainEmail,
		mailbox.DisplayName, mailbox.QuotaBytes, mailbox.UsedBytes, settingsJSON,
		mailbox.IsActive, mailbox.CreatedAt, mailbox.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create mailbox: %w", err)
	}

	// Grant domain permission
	permQuery := `
		INSERT INTO user_domain_permissions (user_id, domain_id, can_send_as, can_manage,
		                                     can_view_analytics, can_manage_users, granted_at)
		VALUES ($1, $2, true, false, false, false, $3)
	`
	_, err = tx.Exec(ctx, permQuery, user.ID, email.DomainID, time.Now())
	if err != nil {
		return fmt.Errorf("failed to create domain permission: %w", err)
	}

	return tx.Commit(ctx)
}

// UpdateUser updates user fields.
func (r *Repository) UpdateUser(ctx context.Context, user *models.User) error {
	query := `
		UPDATE users
		SET display_name = $2, password_hash = $3, role = $4, status = $5,
		    timezone = $6, locale = $7, avatar_url = $8, mfa_enabled = $9,
		    mfa_secret = $10, mfa_backup_codes = $11, password_changed_at = $12,
		    last_login_at = $13, last_login_ip = $14, failed_login_attempts = $15,
		    locked_until = $16, email_verified = $17, email_verification_token = $18,
		    updated_at = $19
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query,
		user.ID, user.DisplayName, user.PasswordHash, user.Role, user.Status,
		user.Timezone, user.Locale, user.AvatarURL, user.MFAEnabled,
		user.MFASecret, user.MFABackupCodes, user.PasswordChangedAt,
		user.LastLoginAt, user.LastLoginIP, user.FailedLoginAttempts,
		user.LockedUntil, user.EmailVerified, user.EmailVerificationToken,
		time.Now(),
	)
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}
	return nil
}

// UpdateUserLoginSuccess updates user on successful login.
func (r *Repository) UpdateUserLoginSuccess(ctx context.Context, userID uuid.UUID, ip string) error {
	query := `
		UPDATE users
		SET last_login_at = $2, last_login_ip = $3, failed_login_attempts = 0, updated_at = $2
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, userID, time.Now(), ip)
	return err
}

// UpdateUserLoginFailure increments failed login attempts.
func (r *Repository) UpdateUserLoginFailure(ctx context.Context, userID uuid.UUID, lockoutDuration time.Duration, maxAttempts int) error {
	query := `
		UPDATE users
		SET failed_login_attempts = failed_login_attempts + 1,
		    locked_until = CASE
		        WHEN failed_login_attempts + 1 >= $2 THEN $3
		        ELSE locked_until
		    END,
		    updated_at = NOW()
		WHERE id = $1
	`
	lockoutTime := time.Now().Add(lockoutDuration)
	_, err := r.pool.Exec(ctx, query, userID, maxAttempts, lockoutTime)
	return err
}

// ============================================================
// EMAIL ADDRESS OPERATIONS
// ============================================================

// GetUserEmailAddresses retrieves all email addresses for a user.
func (r *Repository) GetUserEmailAddresses(ctx context.Context, userID uuid.UUID) ([]models.UserEmailAddress, error) {
	query := `
		SELECT id, user_id, domain_id, email_address, local_part,
		       is_primary, is_verified, verification_token, verified_at, created_at
		FROM user_email_addresses
		WHERE user_id = $1
		ORDER BY is_primary DESC, email_address ASC
	`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query email addresses: %w", err)
	}
	defer rows.Close()

	var emails []models.UserEmailAddress
	for rows.Next() {
		var email models.UserEmailAddress
		if err := rows.Scan(
			&email.ID, &email.UserID, &email.DomainID, &email.EmailAddress,
			&email.LocalPart, &email.IsPrimary, &email.IsVerified,
			&email.VerificationToken, &email.VerifiedAt, &email.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan email address: %w", err)
		}
		emails = append(emails, email)
	}

	return emails, nil
}

// GetUserEmailAddressByID retrieves an email address by ID.
func (r *Repository) GetUserEmailAddressByID(ctx context.Context, id uuid.UUID) (*models.UserEmailAddress, error) {
	query := `
		SELECT id, user_id, domain_id, email_address, local_part,
		       is_primary, is_verified, verification_token, verified_at, created_at
		FROM user_email_addresses
		WHERE id = $1
	`

	var email models.UserEmailAddress
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&email.ID, &email.UserID, &email.DomainID, &email.EmailAddress,
		&email.LocalPart, &email.IsPrimary, &email.IsVerified,
		&email.VerificationToken, &email.VerifiedAt, &email.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get email address: %w", err)
	}

	return &email, nil
}

// GetEmailAddressByToken retrieves an email address by verification token.
func (r *Repository) GetEmailAddressByToken(ctx context.Context, token string) (*models.UserEmailAddress, error) {
	query := `
		SELECT id, user_id, domain_id, email_address, local_part,
		       is_primary, is_verified, verification_token, verified_at, created_at
		FROM user_email_addresses
		WHERE verification_token = $1
	`

	var email models.UserEmailAddress
	err := r.pool.QueryRow(ctx, query, token).Scan(
		&email.ID, &email.UserID, &email.DomainID, &email.EmailAddress,
		&email.LocalPart, &email.IsPrimary, &email.IsVerified,
		&email.VerificationToken, &email.VerifiedAt, &email.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get email address by token: %w", err)
	}

	return &email, nil
}

// CreateEmailAddress creates a new email address for a user.
func (r *Repository) CreateEmailAddress(ctx context.Context, email *models.UserEmailAddress) error {
	query := `
		INSERT INTO user_email_addresses (id, user_id, domain_id, email_address, local_part,
		                                  is_primary, is_verified, verification_token, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.pool.Exec(ctx, query,
		email.ID, email.UserID, email.DomainID, email.EmailAddress, email.LocalPart,
		email.IsPrimary, email.IsVerified, email.VerificationToken, email.CreatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return ErrDuplicateEmail
		}
		return fmt.Errorf("failed to create email address: %w", err)
	}

	// Grant domain permission if not already exists
	permQuery := `
		INSERT INTO user_domain_permissions (user_id, domain_id, can_send_as, can_manage,
		                                     can_view_analytics, can_manage_users, granted_at)
		VALUES ($1, $2, true, false, false, false, $3)
		ON CONFLICT (user_id, domain_id) DO NOTHING
	`
	_, err = r.pool.Exec(ctx, permQuery, email.UserID, email.DomainID, time.Now())
	if err != nil {
		return fmt.Errorf("failed to create domain permission: %w", err)
	}

	return nil
}

// VerifyEmailAddress marks an email address as verified.
func (r *Repository) VerifyEmailAddress(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE user_email_addresses
		SET is_verified = true, verified_at = $2, verification_token = NULL
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, id, time.Now())
	return err
}

// SetPrimaryEmail sets an email address as primary for a user.
func (r *Repository) SetPrimaryEmail(ctx context.Context, userID, emailID uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Unset current primary
	_, err = tx.Exec(ctx, `UPDATE user_email_addresses SET is_primary = false WHERE user_id = $1`, userID)
	if err != nil {
		return fmt.Errorf("failed to unset primary: %w", err)
	}

	// Set new primary
	_, err = tx.Exec(ctx, `UPDATE user_email_addresses SET is_primary = true WHERE id = $1 AND user_id = $2`, emailID, userID)
	if err != nil {
		return fmt.Errorf("failed to set primary: %w", err)
	}

	return tx.Commit(ctx)
}

// DeleteEmailAddress deletes an email address.
func (r *Repository) DeleteEmailAddress(ctx context.Context, id uuid.UUID) error {
	// Note: Mailbox deletion should be handled by the service layer
	query := `DELETE FROM user_email_addresses WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id)
	return err
}

// UpdateEmailVerificationToken updates the verification token for an email address.
func (r *Repository) UpdateEmailVerificationToken(ctx context.Context, emailID uuid.UUID, token string, expiresAt time.Time) error {
	query := `
		UPDATE user_email_addresses
		SET verification_token = $2, verification_token_expires_at = $3
		WHERE id = $1
	`
	_, err := r.pool.Exec(ctx, query, emailID, token, expiresAt)
	return err
}

// ============================================================
// PASSWORD RESET TOKENS
// ============================================================

// CreatePasswordResetToken creates a password reset token for a user.
func (r *Repository) CreatePasswordResetToken(ctx context.Context, userID uuid.UUID, token string, expiresAt time.Time) error {
	query := `
		INSERT INTO password_reset_tokens (id, user_id, token, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := r.pool.Exec(ctx, query, uuid.New(), userID, token, expiresAt, time.Now())
	return err
}

// ValidatePasswordResetToken validates a password reset token and returns the user ID.
func (r *Repository) ValidatePasswordResetToken(ctx context.Context, token string) (*uuid.UUID, error) {
	query := `
		SELECT user_id FROM password_reset_tokens
		WHERE token = $1 AND expires_at > $2 AND used_at IS NULL
	`
	var userID uuid.UUID
	err := r.pool.QueryRow(ctx, query, token, time.Now()).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &userID, nil
}

// InvalidatePasswordResetToken marks a password reset token as used.
func (r *Repository) InvalidatePasswordResetToken(ctx context.Context, token string) error {
	query := `
		UPDATE password_reset_tokens SET used_at = $2 WHERE token = $1
	`
	_, err := r.pool.Exec(ctx, query, token, time.Now())
	return err
}

// ============================================================
// MAILBOX OPERATIONS
// ============================================================

// GetMailboxByEmailAddressID retrieves a mailbox by email address ID.
func (r *Repository) GetMailboxByEmailAddressID(ctx context.Context, emailAddressID uuid.UUID) (*models.Mailbox, error) {
	query := `
		SELECT id, user_id, email_address_id, domain_email, display_name,
		       quota_bytes, used_bytes, settings, is_active, created_at, updated_at
		FROM mailboxes
		WHERE email_address_id = $1
	`

	var mailbox models.Mailbox
	var settingsJSON []byte
	err := r.pool.QueryRow(ctx, query, emailAddressID).Scan(
		&mailbox.ID, &mailbox.UserID, &mailbox.EmailAddressID, &mailbox.DomainEmail,
		&mailbox.DisplayName, &mailbox.QuotaBytes, &mailbox.UsedBytes, &settingsJSON,
		&mailbox.IsActive, &mailbox.CreatedAt, &mailbox.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get mailbox: %w", err)
	}

	if settingsJSON != nil {
		var settings models.MailboxSettings
		if err := json.Unmarshal(settingsJSON, &settings); err == nil {
			mailbox.Settings = &settings
		}
	}

	return &mailbox, nil
}

// CreateMailbox creates a new mailbox.
func (r *Repository) CreateMailbox(ctx context.Context, mailbox *models.Mailbox) error {
	query := `
		INSERT INTO mailboxes (id, user_id, email_address_id, domain_email, display_name,
		                       quota_bytes, used_bytes, settings, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	settingsJSON, _ := json.Marshal(mailbox.Settings)
	_, err := r.pool.Exec(ctx, query,
		mailbox.ID, mailbox.UserID, mailbox.EmailAddressID, mailbox.DomainEmail,
		mailbox.DisplayName, mailbox.QuotaBytes, mailbox.UsedBytes, settingsJSON,
		mailbox.IsActive, mailbox.CreatedAt, mailbox.UpdatedAt,
	)
	return err
}

// ============================================================
// DOMAIN PERMISSION OPERATIONS
// ============================================================

// GetUserDomainPermissions retrieves all domain permissions for a user.
func (r *Repository) GetUserDomainPermissions(ctx context.Context, userID uuid.UUID) ([]models.UserDomainPermission, error) {
	query := `
		SELECT user_id, domain_id, can_send_as, can_manage, can_view_analytics,
		       can_manage_users, granted_by, granted_at
		FROM user_domain_permissions
		WHERE user_id = $1
	`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query permissions: %w", err)
	}
	defer rows.Close()

	var perms []models.UserDomainPermission
	for rows.Next() {
		var perm models.UserDomainPermission
		if err := rows.Scan(
			&perm.UserID, &perm.DomainID, &perm.CanSendAs, &perm.CanManage,
			&perm.CanViewAnalytics, &perm.CanManageUsers, &perm.GrantedBy, &perm.GrantedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan permission: %w", err)
		}
		perms = append(perms, perm)
	}

	return perms, nil
}

// GetUserDomainPermission retrieves a specific domain permission.
func (r *Repository) GetUserDomainPermission(ctx context.Context, userID, domainID uuid.UUID) (*models.UserDomainPermission, error) {
	query := `
		SELECT user_id, domain_id, can_send_as, can_manage, can_view_analytics,
		       can_manage_users, granted_by, granted_at
		FROM user_domain_permissions
		WHERE user_id = $1 AND domain_id = $2
	`

	var perm models.UserDomainPermission
	err := r.pool.QueryRow(ctx, query, userID, domainID).Scan(
		&perm.UserID, &perm.DomainID, &perm.CanSendAs, &perm.CanManage,
		&perm.CanViewAnalytics, &perm.CanManageUsers, &perm.GrantedBy, &perm.GrantedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get permission: %w", err)
	}

	return &perm, nil
}

// ============================================================
// SESSION OPERATIONS
// ============================================================

// CreateSession creates a new user session.
func (r *Repository) CreateSession(ctx context.Context, session *models.UserSession) error {
	query := `
		INSERT INTO user_sessions (id, user_id, token_hash, user_agent, ip_address,
		                           last_activity_at, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := r.pool.Exec(ctx, query,
		session.ID, session.UserID, session.TokenHash, session.UserAgent,
		session.IPAddress, session.LastActivityAt, session.ExpiresAt, session.CreatedAt,
	)
	return err
}

// GetSessionByTokenHash retrieves a session by token hash.
func (r *Repository) GetSessionByTokenHash(ctx context.Context, tokenHash string) (*models.UserSession, error) {
	query := `
		SELECT id, user_id, token_hash, user_agent, ip_address,
		       last_activity_at, expires_at, created_at, revoked_at
		FROM user_sessions
		WHERE token_hash = $1 AND revoked_at IS NULL
	`

	var session models.UserSession
	err := r.pool.QueryRow(ctx, query, tokenHash).Scan(
		&session.ID, &session.UserID, &session.TokenHash, &session.UserAgent,
		&session.IPAddress, &session.LastActivityAt, &session.ExpiresAt,
		&session.CreatedAt, &session.RevokedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	return &session, nil
}

// GetUserSessions retrieves all active sessions for a user.
func (r *Repository) GetUserSessions(ctx context.Context, userID uuid.UUID) ([]models.UserSession, error) {
	query := `
		SELECT id, user_id, token_hash, user_agent, ip_address,
		       last_activity_at, expires_at, created_at, revoked_at
		FROM user_sessions
		WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
		ORDER BY last_activity_at DESC
	`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query sessions: %w", err)
	}
	defer rows.Close()

	var sessions []models.UserSession
	for rows.Next() {
		var session models.UserSession
		if err := rows.Scan(
			&session.ID, &session.UserID, &session.TokenHash, &session.UserAgent,
			&session.IPAddress, &session.LastActivityAt, &session.ExpiresAt,
			&session.CreatedAt, &session.RevokedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan session: %w", err)
		}
		sessions = append(sessions, session)
	}

	return sessions, nil
}

// UpdateSessionActivity updates session last activity time.
func (r *Repository) UpdateSessionActivity(ctx context.Context, sessionID uuid.UUID) error {
	query := `UPDATE user_sessions SET last_activity_at = $2 WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, sessionID, time.Now())
	return err
}

// RotateSessionToken updates the session with a new token hash for refresh token rotation.
// Returns the old token hash for detection of token reuse.
func (r *Repository) RotateSessionToken(ctx context.Context, sessionID uuid.UUID, newTokenHash string, newExpiresAt time.Time) error {
	query := `
		UPDATE user_sessions
		SET token_hash = $2, last_activity_at = $3, expires_at = $4
		WHERE id = $1 AND revoked_at IS NULL
	`
	result, err := r.pool.Exec(ctx, query, sessionID, newTokenHash, time.Now(), newExpiresAt)
	if err != nil {
		return fmt.Errorf("failed to rotate session token: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// GetSessionByID retrieves a session by ID.
func (r *Repository) GetSessionByID(ctx context.Context, sessionID uuid.UUID) (*models.UserSession, error) {
	query := `
		SELECT id, user_id, token_hash, user_agent, ip_address,
		       last_activity_at, expires_at, created_at, revoked_at
		FROM user_sessions
		WHERE id = $1
	`

	var session models.UserSession
	err := r.pool.QueryRow(ctx, query, sessionID).Scan(
		&session.ID, &session.UserID, &session.TokenHash, &session.UserAgent,
		&session.IPAddress, &session.LastActivityAt, &session.ExpiresAt,
		&session.CreatedAt, &session.RevokedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	return &session, nil
}

// RevokeSession revokes a session.
func (r *Repository) RevokeSession(ctx context.Context, sessionID uuid.UUID) error {
	query := `UPDATE user_sessions SET revoked_at = $2 WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, sessionID, time.Now())
	return err
}

// RevokeAllUserSessions revokes all sessions for a user.
func (r *Repository) RevokeAllUserSessions(ctx context.Context, userID uuid.UUID, exceptSessionID *uuid.UUID) error {
	var query string
	var args []interface{}

	if exceptSessionID != nil {
		query = `UPDATE user_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL AND id != $3`
		args = []interface{}{userID, time.Now(), *exceptSessionID}
	} else {
		query = `UPDATE user_sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`
		args = []interface{}{userID, time.Now()}
	}

	_, err := r.pool.Exec(ctx, query, args...)
	return err
}

// DeleteSession deletes a session by ID (alias for RevokeSession).
func (r *Repository) DeleteSession(ctx context.Context, sessionID uuid.UUID) error {
	return r.RevokeSession(ctx, sessionID)
}

// DeleteUserSessions deletes all sessions for a user.
func (r *Repository) DeleteUserSessions(ctx context.Context, userID uuid.UUID) error {
	return r.RevokeAllUserSessions(ctx, userID, nil)
}

// ============================================================
// SSO CONFIG OPERATIONS
// ============================================================

// GetSSOConfigByDomainID retrieves SSO configuration for a domain.
func (r *Repository) GetSSOConfigByDomainID(ctx context.Context, domainID uuid.UUID) (*models.SSOConfig, error) {
	query := `
		SELECT id, domain_id, provider, is_enabled, enforce_sso, auto_provision_users,
		       default_role, saml_config, oidc_config, created_at, updated_at
		FROM domain_sso_configs
		WHERE domain_id = $1
	`

	var config models.SSOConfig
	var samlJSON, oidcJSON []byte
	err := r.pool.QueryRow(ctx, query, domainID).Scan(
		&config.ID, &config.DomainID, &config.Provider, &config.IsEnabled,
		&config.EnforceSSO, &config.AutoProvisionUsers, &config.DefaultRole,
		&samlJSON, &oidcJSON, &config.CreatedAt, &config.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get SSO config: %w", err)
	}

	if samlJSON != nil && len(samlJSON) > 0 {
		var samlConfig models.SAMLConfig
		if err := json.Unmarshal(samlJSON, &samlConfig); err == nil {
			config.SAMLConfig = &samlConfig
		}
	}

	if oidcJSON != nil && len(oidcJSON) > 0 {
		var oidcConfig models.OIDCConfig
		if err := json.Unmarshal(oidcJSON, &oidcConfig); err == nil {
			config.OIDCConfig = &oidcConfig
		}
	}

	return &config, nil
}

// UpsertSSOConfig creates or updates SSO configuration.
func (r *Repository) UpsertSSOConfig(ctx context.Context, config *models.SSOConfig) error {
	query := `
		INSERT INTO domain_sso_configs (id, domain_id, provider, is_enabled, enforce_sso,
		                                 auto_provision_users, default_role, saml_config,
		                                 oidc_config, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (domain_id) DO UPDATE SET
		    provider = EXCLUDED.provider,
		    is_enabled = EXCLUDED.is_enabled,
		    enforce_sso = EXCLUDED.enforce_sso,
		    auto_provision_users = EXCLUDED.auto_provision_users,
		    default_role = EXCLUDED.default_role,
		    saml_config = EXCLUDED.saml_config,
		    oidc_config = EXCLUDED.oidc_config,
		    updated_at = EXCLUDED.updated_at
	`

	var samlJSON, oidcJSON []byte
	if config.SAMLConfig != nil {
		samlJSON, _ = json.Marshal(config.SAMLConfig)
	}
	if config.OIDCConfig != nil {
		oidcJSON, _ = json.Marshal(config.OIDCConfig)
	}

	_, err := r.pool.Exec(ctx, query,
		config.ID, config.DomainID, config.Provider, config.IsEnabled,
		config.EnforceSSO, config.AutoProvisionUsers, config.DefaultRole,
		samlJSON, oidcJSON, config.CreatedAt, config.UpdatedAt,
	)
	return err
}

// ============================================================
// SSO IDENTITY OPERATIONS
// ============================================================

// GetSSOIdentity retrieves an SSO identity.
func (r *Repository) GetSSOIdentity(ctx context.Context, domainID uuid.UUID, providerUserID string) (*models.SSOIdentity, error) {
	query := `
		SELECT id, user_id, domain_id, provider, provider_user_id, email,
		       raw_attributes, last_login_at, created_at, updated_at
		FROM sso_identities
		WHERE domain_id = $1 AND provider_user_id = $2
	`

	var identity models.SSOIdentity
	err := r.pool.QueryRow(ctx, query, domainID, providerUserID).Scan(
		&identity.ID, &identity.UserID, &identity.DomainID, &identity.Provider,
		&identity.ProviderUserID, &identity.Email, &identity.RawAttributes,
		&identity.LastLoginAt, &identity.CreatedAt, &identity.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get SSO identity: %w", err)
	}

	return &identity, nil
}

// CreateSSOIdentity creates an SSO identity.
func (r *Repository) CreateSSOIdentity(ctx context.Context, identity *models.SSOIdentity) error {
	query := `
		INSERT INTO sso_identities (id, user_id, domain_id, provider, provider_user_id,
		                            email, raw_attributes, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.pool.Exec(ctx, query,
		identity.ID, identity.UserID, identity.DomainID, identity.Provider,
		identity.ProviderUserID, identity.Email, identity.RawAttributes,
		identity.CreatedAt, identity.UpdatedAt,
	)
	return err
}

// UpdateSSOIdentityLogin updates last login time for SSO identity.
func (r *Repository) UpdateSSOIdentityLogin(ctx context.Context, id uuid.UUID, rawAttrs json.RawMessage) error {
	query := `UPDATE sso_identities SET last_login_at = $2, raw_attributes = $3, updated_at = $2 WHERE id = $1`
	_, err := r.pool.Exec(ctx, query, id, time.Now(), rawAttrs)
	return err
}

// GetSSOIdentityByUserID retrieves an SSO identity by user ID.
func (r *Repository) GetSSOIdentityByUserID(ctx context.Context, userID uuid.UUID) (*models.SSOIdentity, error) {
	query := `
		SELECT id, user_id, domain_id, provider, provider_user_id, email,
		       raw_attributes, created_at, updated_at, last_login_at
		FROM sso_identities
		WHERE user_id = $1
		LIMIT 1
	`
	var identity models.SSOIdentity
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&identity.ID, &identity.UserID, &identity.DomainID, &identity.Provider,
		&identity.ProviderUserID, &identity.Email, &identity.RawAttributes,
		&identity.CreatedAt, &identity.UpdatedAt, &identity.LastLoginAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &identity, nil
}

// ============================================================
// AUDIT OPERATIONS
// ============================================================

// CreateLoginAttempt records a login attempt.
func (r *Repository) CreateLoginAttempt(ctx context.Context, attempt *models.LoginAttempt) error {
	query := `
		INSERT INTO login_attempts (id, user_id, email, ip_address, user_agent,
		                            success, failure_reason, method, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.pool.Exec(ctx, query,
		attempt.ID, attempt.UserID, attempt.Email, attempt.IPAddress,
		attempt.UserAgent, attempt.Success, attempt.FailureReason,
		attempt.Method, attempt.CreatedAt,
	)
	return err
}

// CreateAuditLog records an audit event.
func (r *Repository) CreateAuditLog(ctx context.Context, log *models.AuditLog) error {
	query := `
		INSERT INTO audit_logs (id, organization_id, user_id, action, resource_type,
		                        resource_id, details, ip_address, user_agent, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	_, err := r.pool.Exec(ctx, query,
		log.ID, log.OrganizationID, log.UserID, log.Action, log.ResourceType,
		log.ResourceID, log.Details, log.IPAddress, log.UserAgent, log.CreatedAt,
	)
	return err
}

// CheckEmailExists checks if an email address already exists.
func (r *Repository) CheckEmailExists(ctx context.Context, email string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM user_email_addresses WHERE LOWER(email_address) = LOWER($1))`
	var exists bool
	err := r.pool.QueryRow(ctx, query, email).Scan(&exists)
	return exists, err
}

// GetPrimaryEmailAddress retrieves the primary email address for a user.
func (r *Repository) GetPrimaryEmailAddress(ctx context.Context, userID uuid.UUID) (*models.UserEmailAddress, error) {
	query := `
		SELECT id, user_id, domain_id, email_address, local_part,
		       is_primary, is_verified, verification_token, verified_at, created_at
		FROM user_email_addresses
		WHERE user_id = $1 AND is_primary = true
	`

	var email models.UserEmailAddress
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&email.ID, &email.UserID, &email.DomainID, &email.EmailAddress,
		&email.LocalPart, &email.IsPrimary, &email.IsVerified,
		&email.VerificationToken, &email.VerifiedAt, &email.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get primary email: %w", err)
	}

	return &email, nil
}

// GetUserMailboxes retrieves all mailboxes for a user.
func (r *Repository) GetUserMailboxes(ctx context.Context, userID uuid.UUID) ([]models.Mailbox, error) {
	query := `
		SELECT id, user_id, email_address_id, domain_email, display_name,
		       quota_bytes, used_bytes, settings, is_active, created_at, updated_at
		FROM mailboxes
		WHERE user_id = $1
		ORDER BY domain_email ASC
	`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query mailboxes: %w", err)
	}
	defer rows.Close()

	var mailboxes []models.Mailbox
	for rows.Next() {
		var mailbox models.Mailbox
		var settingsJSON []byte
		if err := rows.Scan(
			&mailbox.ID, &mailbox.UserID, &mailbox.EmailAddressID, &mailbox.DomainEmail,
			&mailbox.DisplayName, &mailbox.QuotaBytes, &mailbox.UsedBytes, &settingsJSON,
			&mailbox.IsActive, &mailbox.CreatedAt, &mailbox.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan mailbox: %w", err)
		}
		if settingsJSON != nil {
			var settings models.MailboxSettings
			if err := json.Unmarshal(settingsJSON, &settings); err == nil {
				mailbox.Settings = &settings
			}
		}
		mailboxes = append(mailboxes, mailbox)
	}

	return mailboxes, nil
}

// DB returns the underlying pool for transactions.
func (r *Repository) DB() *pgxpool.Pool {
	return r.pool
}

// ============================================================
// ADDITIONAL ORGANIZATION OPERATIONS
// ============================================================

// GetOrganizationsByUserID retrieves all organizations a user belongs to.
func (r *Repository) GetOrganizationsByUserID(ctx context.Context, userID uuid.UUID) ([]*models.Organization, error) {
query := `
SELECT o.id, o.name, o.slug, o.owner_id, o.plan, o.status, o.logo_url,
       o.subscription_tier, o.max_domains, o.max_users, o.is_active,
       o.created_at, o.updated_at
FROM organizations o
INNER JOIN organization_members om ON o.id = om.organization_id
WHERE om.user_id = $1
ORDER BY o.name ASC
`

rows, err := r.pool.Query(ctx, query, userID)
if err != nil {
return nil, fmt.Errorf("failed to query organizations: %w", err)
}
defer rows.Close()

var orgs []*models.Organization
for rows.Next() {
var org models.Organization
if err := rows.Scan(
&org.ID, &org.Name, &org.Slug, &org.OwnerID, &org.Plan, &org.Status, &org.LogoURL,
&org.SubscriptionTier, &org.MaxDomains, &org.MaxUsers, &org.IsActive,
&org.CreatedAt, &org.UpdatedAt,
); err != nil {
return nil, fmt.Errorf("failed to scan organization: %w", err)
}
orgs = append(orgs, &org)
}

return orgs, nil
}

// CreateOrganization creates a new organization with settings.
func (r *Repository) CreateOrganization(ctx context.Context, org *models.Organization, settings *models.OrganizationSettings) error {
tx, err := r.pool.Begin(ctx)
if err != nil {
return fmt.Errorf("failed to begin transaction: %w", err)
}
defer tx.Rollback(ctx)

// Insert organization
orgQuery := `
INSERT INTO organizations (id, name, slug, owner_id, plan, status, is_active, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`
_, err = tx.Exec(ctx, orgQuery,
org.ID, org.Name, org.Slug, org.OwnerID, org.Plan, org.Status, org.IsActive,
org.CreatedAt, org.UpdatedAt,
)
if err != nil {
return fmt.Errorf("failed to create organization: %w", err)
}

// Insert organization settings
settingsQuery := `
INSERT INTO organization_settings (id, organization_id, require_mfa, session_duration,
                                   max_login_attempts, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
`
_, err = tx.Exec(ctx, settingsQuery,
settings.ID, settings.OrganizationID, settings.RequireMFA, settings.SessionDuration,
settings.MaxLoginAttempts, settings.CreatedAt, settings.UpdatedAt,
)
if err != nil {
return fmt.Errorf("failed to create organization settings: %w", err)
}

return tx.Commit(ctx)
}

// UpdateOrganization updates an organization.
func (r *Repository) UpdateOrganization(ctx context.Context, org *models.Organization) error {
query := `
UPDATE organizations
SET name = $2, slug = $3, plan = $4, status = $5, updated_at = $6
WHERE id = $1
`
_, err := r.pool.Exec(ctx, query, org.ID, org.Name, org.Slug, org.Plan, org.Status, org.UpdatedAt)
return err
}

// GetOrganizationMembers retrieves all members of an organization.
func (r *Repository) GetOrganizationMembers(ctx context.Context, orgID uuid.UUID) ([]*models.OrganizationMember, error) {
query := `
SELECT organization_id, user_id, role, joined_at
FROM organization_members
WHERE organization_id = $1
ORDER BY joined_at ASC
`

rows, err := r.pool.Query(ctx, query, orgID)
if err != nil {
return nil, fmt.Errorf("failed to query members: %w", err)
}
defer rows.Close()

var members []*models.OrganizationMember
for rows.Next() {
var m models.OrganizationMember
if err := rows.Scan(&m.OrganizationID, &m.UserID, &m.Role, &m.JoinedAt); err != nil {
return nil, fmt.Errorf("failed to scan member: %w", err)
}
members = append(members, &m)
}

return members, nil
}

// GetOrganizationMember retrieves a specific organization member.
func (r *Repository) GetOrganizationMember(ctx context.Context, orgID, userID uuid.UUID) (*models.OrganizationMember, error) {
query := `
SELECT organization_id, user_id, role, joined_at
FROM organization_members
WHERE organization_id = $1 AND user_id = $2
`

var m models.OrganizationMember
err := r.pool.QueryRow(ctx, query, orgID, userID).Scan(
&m.OrganizationID, &m.UserID, &m.Role, &m.JoinedAt,
)
if err != nil {
if errors.Is(err, pgx.ErrNoRows) {
return nil, ErrNotFound
}
return nil, fmt.Errorf("failed to get member: %w", err)
}

return &m, nil
}

// CreateOrganizationMember creates a new organization member.
func (r *Repository) CreateOrganizationMember(ctx context.Context, m *models.OrganizationMember) error {
query := `
INSERT INTO organization_members (organization_id, user_id, role, joined_at)
VALUES ($1, $2, $3, $4)
`
_, err := r.pool.Exec(ctx, query, m.OrganizationID, m.UserID, m.Role, m.JoinedAt)
return err
}

// DeleteOrganizationMember removes a member from an organization.
func (r *Repository) DeleteOrganizationMember(ctx context.Context, orgID, userID uuid.UUID) error {
query := `DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2`
_, err := r.pool.Exec(ctx, query, orgID, userID)
return err
}

// UpdateOrganizationMemberRole updates a member's role.
func (r *Repository) UpdateOrganizationMemberRole(ctx context.Context, orgID, userID uuid.UUID, role string) error {
query := `UPDATE organization_members SET role = $3 WHERE organization_id = $1 AND user_id = $2`
_, err := r.pool.Exec(ctx, query, orgID, userID, role)
return err
}

// ============================================================
// ADDITIONAL DOMAIN OPERATIONS
// ============================================================

// GetDomainsByUserID retrieves all domains a user has access to.
func (r *Repository) GetDomainsByUserID(ctx context.Context, userID uuid.UUID) ([]*models.Domain, error) {
query := `
SELECT DISTINCT d.id, d.organization_id, d.domain_name, d.is_primary, d.is_default,
       d.status, d.is_verified, d.verification_status, d.verification_token,
       d.verification_method, d.verified_at, d.mx_verified, d.spf_verified,
       d.dkim_verified, d.dmarc_verified, d.is_active, d.created_at, d.updated_at
FROM domains d
INNER JOIN user_domain_permissions p ON d.id = p.domain_id
WHERE p.user_id = $1
ORDER BY d.domain_name ASC
`

rows, err := r.pool.Query(ctx, query, userID)
if err != nil {
return nil, fmt.Errorf("failed to query domains: %w", err)
}
defer rows.Close()

var domains []*models.Domain
for rows.Next() {
var d models.Domain
if err := rows.Scan(
&d.ID, &d.OrganizationID, &d.DomainName, &d.IsPrimary, &d.IsDefault,
&d.Status, &d.IsVerified, &d.VerificationStatus, &d.VerificationToken,
&d.VerificationMethod, &d.VerifiedAt, &d.MXVerified, &d.SPFVerified,
&d.DKIMVerified, &d.DMARCVerified, &d.IsActive, &d.CreatedAt, &d.UpdatedAt,
); err != nil {
return nil, fmt.Errorf("failed to scan domain: %w", err)
}
domains = append(domains, &d)
}

return domains, nil
}

// CreateDomain creates a new domain with settings.
func (r *Repository) CreateDomain(ctx context.Context, domain *models.Domain, settings *models.DomainSettings) error {
tx, err := r.pool.Begin(ctx)
if err != nil {
return fmt.Errorf("failed to begin transaction: %w", err)
}
defer tx.Rollback(ctx)

domainQuery := `
INSERT INTO domains (id, organization_id, domain_name, is_primary, is_default,
                     status, is_verified, verification_status, verification_token,
                     verification_method, is_active, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
`
_, err = tx.Exec(ctx, domainQuery,
domain.ID, domain.OrganizationID, domain.DomainName, domain.IsPrimary,
domain.IsDefault, domain.Status, domain.IsVerified, domain.VerificationStatus,
domain.VerificationToken, domain.VerificationMethod, domain.IsActive,
domain.CreatedAt, domain.UpdatedAt,
)
if err != nil {
return fmt.Errorf("failed to create domain: %w", err)
}

settingsQuery := `
INSERT INTO domain_settings (id, domain_id, catch_all_enabled, auto_create_mailbox,
                             created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6)
`
_, err = tx.Exec(ctx, settingsQuery,
settings.ID, settings.DomainID, settings.CatchAllEnabled, settings.AutoCreateMailbox,
settings.CreatedAt, settings.UpdatedAt,
)
if err != nil {
return fmt.Errorf("failed to create domain settings: %w", err)
}

return tx.Commit(ctx)
}

// UpdateDomain updates a domain.
func (r *Repository) UpdateDomain(ctx context.Context, domain *models.Domain) error {
query := `
UPDATE domains
SET is_default = $2, status = $3, verification_status = $4, verified_at = $5,
    updated_at = $6
WHERE id = $1
`
_, err := r.pool.Exec(ctx, query, domain.ID, domain.IsDefault, domain.Status,
domain.VerificationStatus, domain.VerifiedAt, domain.UpdatedAt)
return err
}

// GetDomainPermissions retrieves all user permissions for a domain.
func (r *Repository) GetDomainPermissions(ctx context.Context, domainID uuid.UUID) ([]*models.UserDomainPermission, error) {
query := `
SELECT id, user_id, domain_id, can_send_as, can_manage, can_view_analytics,
       can_manage_users, granted_by, granted_at
FROM user_domain_permissions
WHERE domain_id = $1
`

rows, err := r.pool.Query(ctx, query, domainID)
if err != nil {
return nil, fmt.Errorf("failed to query permissions: %w", err)
}
defer rows.Close()

var perms []*models.UserDomainPermission
for rows.Next() {
var p models.UserDomainPermission
if err := rows.Scan(
&p.ID, &p.UserID, &p.DomainID, &p.CanSendAs, &p.CanManage,
&p.CanViewAnalytics, &p.CanManageUsers, &p.GrantedBy, &p.GrantedAt,
); err != nil {
return nil, fmt.Errorf("failed to scan permission: %w", err)
}
perms = append(perms, &p)
}

return perms, nil
}

// CreateUserDomainPermission creates a new user domain permission.
func (r *Repository) CreateUserDomainPermission(ctx context.Context, perm *models.UserDomainPermission) error {
	query := `
		INSERT INTO user_domain_permissions (id, user_id, domain_id, can_send_as, can_manage, can_view_analytics, can_manage_users, granted_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (user_id, domain_id) DO UPDATE SET
			can_send_as = EXCLUDED.can_send_as,
			can_manage = EXCLUDED.can_manage,
			can_view_analytics = EXCLUDED.can_view_analytics,
			can_manage_users = EXCLUDED.can_manage_users
	`
	_, err := r.pool.Exec(ctx, query, perm.ID, perm.UserID, perm.DomainID, perm.CanSendAs,
		perm.CanManage, perm.CanViewAnalytics, perm.CanManageUsers, perm.GrantedAt)
	return err
}

// UpdateUserDomainPermission updates a user's domain permissions.
func (r *Repository) UpdateUserDomainPermission(ctx context.Context, perm *models.UserDomainPermission) error {
query := `
UPDATE user_domain_permissions
SET can_send_as = $3, can_manage = $4, can_view_analytics = $5, can_manage_users = $6
WHERE user_id = $1 AND domain_id = $2
`
_, err := r.pool.Exec(ctx, query, perm.UserID, perm.DomainID, perm.CanSendAs,
perm.CanManage, perm.CanViewAnalytics, perm.CanManageUsers)
return err
}

// DeleteUserDomainPermission removes a user's domain permission.
func (r *Repository) DeleteUserDomainPermission(ctx context.Context, userID, domainID uuid.UUID) error {
query := `DELETE FROM user_domain_permissions WHERE user_id = $1 AND domain_id = $2`
_, err := r.pool.Exec(ctx, query, userID, domainID)
return err
}

// ListOrganizationUsers lists users in an organization with pagination.
func (r *Repository) ListOrganizationUsers(ctx context.Context, orgID uuid.UUID, search string, limit, offset int) ([]*models.User, int, error) {
countQuery := `SELECT COUNT(*) FROM users WHERE organization_id = $1`
if search != "" {
countQuery += ` AND (display_name ILIKE $2 OR email ILIKE $2)`
}

var total int
var err error
if search != "" {
searchPattern := "%" + search + "%"
err = r.pool.QueryRow(ctx, countQuery, orgID, searchPattern).Scan(&total)
} else {
err = r.pool.QueryRow(ctx, countQuery, orgID).Scan(&total)
}
if err != nil {
return nil, 0, fmt.Errorf("failed to count users: %w", err)
}

query := `
SELECT id, organization_id, email, display_name, role, organization_role,
       status, mfa_enabled, created_at, updated_at
FROM users
WHERE organization_id = $1
`
var rows pgx.Rows
if search != "" {
searchPattern := "%" + search + "%"
query += ` AND (display_name ILIKE $2 OR email ILIKE $2)
          ORDER BY display_name ASC LIMIT $3 OFFSET $4`
rows, err = r.pool.Query(ctx, query, orgID, searchPattern, limit, offset)
} else {
query += ` ORDER BY display_name ASC LIMIT $2 OFFSET $3`
rows, err = r.pool.Query(ctx, query, orgID, limit, offset)
}
if err != nil {
return nil, 0, fmt.Errorf("failed to query users: %w", err)
}
defer rows.Close()

var users []*models.User
for rows.Next() {
var u models.User
if err := rows.Scan(
&u.ID, &u.OrganizationID, &u.Email, &u.DisplayName, &u.Role,
&u.OrganizationRole, &u.Status, &u.MFAEnabled, &u.CreatedAt, &u.UpdatedAt,
); err != nil {
return nil, 0, fmt.Errorf("failed to scan user: %w", err)
}
users = append(users, &u)
}

return users, total, nil
}
