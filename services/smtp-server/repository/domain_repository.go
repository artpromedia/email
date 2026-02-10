package repository

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/oonrumail/smtp-server/domain"
)

// dkimEncryptionKey is set by the SMTP server from config
var dkimEncryptionKey string

// SetDKIMEncryptionKey sets the encryption key for decrypting DKIM private keys
func SetDKIMEncryptionKey(key string) {
	dkimEncryptionKey = key
}

// DomainRepository implements domain.Repository
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

// GetAllDomains returns all verified domains
func (r *DomainRepository) GetAllDomains(ctx context.Context) ([]*domain.Domain, error) {
	query := `
		SELECT
			d.id, d.organization_id, d.name, d.status, d.is_primary,
			d.mx_verified, d.spf_verified, d.dkim_verified, d.dmarc_verified,
			d.catch_all_enabled, d.catch_all_address,
			d.max_message_size, d.require_tls, d.allow_external_relay,
			d.rate_limit_per_hour, d.rate_limit_per_day,
			d.created_at, d.updated_at, d.verified_at
		FROM domains d
		WHERE d.status IN ('verified', 'pending')
		ORDER BY d.name
	`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query domains: %w", err)
	}
	defer rows.Close()

	var domains []*domain.Domain
	for rows.Next() {
		d, err := scanDomain(rows)
		if err != nil {
			return nil, fmt.Errorf("scan domain: %w", err)
		}
		domains = append(domains, d)
	}

	return domains, rows.Err()
}

// GetDomainByName returns a domain by its name
func (r *DomainRepository) GetDomainByName(ctx context.Context, name string) (*domain.Domain, error) {
	query := `
		SELECT
			d.id, d.organization_id, d.name, d.status, d.is_primary,
			d.mx_verified, d.spf_verified, d.dkim_verified, d.dmarc_verified,
			d.catch_all_enabled, d.catch_all_address,
			d.max_message_size, d.require_tls, d.allow_external_relay,
			d.rate_limit_per_hour, d.rate_limit_per_day,
			d.created_at, d.updated_at, d.verified_at
		FROM domains d
		WHERE d.name = $1
	`

	row := r.db.QueryRow(ctx, query, name)
	d, err := scanDomainRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query domain by name: %w", err)
	}

	return d, nil
}

// GetDomainsByOrganization returns all domains for an organization
func (r *DomainRepository) GetDomainsByOrganization(ctx context.Context, orgID string) ([]*domain.Domain, error) {
	query := `
		SELECT
			d.id, d.organization_id, d.name, d.status, d.is_primary,
			d.mx_verified, d.spf_verified, d.dkim_verified, d.dmarc_verified,
			d.catch_all_enabled, d.catch_all_address,
			d.max_message_size, d.require_tls, d.allow_external_relay,
			d.rate_limit_per_hour, d.rate_limit_per_day,
			d.created_at, d.updated_at, d.verified_at
		FROM domains d
		WHERE d.organization_id = $1 AND d.status = 'verified'
		ORDER BY d.is_primary DESC, d.name
	`

	rows, err := r.db.Query(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("query organization domains: %w", err)
	}
	defer rows.Close()

	var domains []*domain.Domain
	for rows.Next() {
		d, err := scanDomain(rows)
		if err != nil {
			return nil, fmt.Errorf("scan domain: %w", err)
		}
		domains = append(domains, d)
	}

	return domains, rows.Err()
}

// GetDKIMKeys returns all DKIM keys for a domain
func (r *DomainRepository) GetDKIMKeys(ctx context.Context, domainID string) ([]*domain.DKIMKey, error) {
	query := `
		SELECT
			id, domain_id, selector, private_key, public_key,
			algorithm, key_size, is_active, created_at, expires_at, rotated_at
		FROM dkim_keys
		WHERE domain_id = $1
		ORDER BY is_active DESC, created_at DESC
	`

	rows, err := r.db.Query(ctx, query, domainID)
	if err != nil {
		return nil, fmt.Errorf("query dkim keys: %w", err)
	}
	defer rows.Close()

	var keys []*domain.DKIMKey
	for rows.Next() {
		key, err := scanDKIMKey(rows)
		if err != nil {
			return nil, fmt.Errorf("scan dkim key: %w", err)
		}
		keys = append(keys, key)
	}

	return keys, rows.Err()
}

// GetActiveDKIMKey returns the active DKIM key for a domain
func (r *DomainRepository) GetActiveDKIMKey(ctx context.Context, domainName string) (*domain.DKIMKey, error) {
	query := `
		SELECT
			dk.id, dk.domain_id, dk.selector, dk.private_key, dk.public_key,
			dk.algorithm, dk.key_size, dk.is_active, dk.created_at, dk.expires_at, dk.rotated_at
		FROM dkim_keys dk
		JOIN domains d ON d.id = dk.domain_id
		WHERE d.name = $1 AND dk.is_active = true
		AND (dk.expires_at IS NULL OR dk.expires_at > NOW())
		LIMIT 1
	`

	row := r.db.QueryRow(ctx, query, domainName)
	key, err := scanDKIMKeyRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query active dkim key: %w", err)
	}

	return key, nil
}

// GetMailboxByEmail returns a mailbox by email address
func (r *DomainRepository) GetMailboxByEmail(ctx context.Context, email string) (*domain.Mailbox, error) {
	query := `
		SELECT
			m.id, m.user_id, m.domain_id, m.local_part, m.email, m.display_name,
			m.storage_quota_bytes, m.storage_used_bytes, m.is_active, m.auto_reply_enabled,
			m.auto_reply_subject, m.auto_reply_body, m.auto_reply_start, m.auto_reply_end,
			m.forward_enabled, m.forward_address, m.forward_keep_copy,
			m.created_at, m.updated_at
		FROM mailboxes m
		WHERE m.email = $1 AND m.is_active = true
	`

	row := r.db.QueryRow(ctx, query, email)
	mailbox, err := scanMailboxRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query mailbox by email: %w", err)
	}

	return mailbox, nil
}

// GetAliasesBySource returns aliases that point to a source email
func (r *DomainRepository) GetAliasesBySource(ctx context.Context, email string) ([]*domain.Alias, error) {
	query := `
		SELECT
			id, domain_id, source_email, target_email, is_active, created_at
		FROM aliases
		WHERE source_email = $1 AND is_active = true
	`

	rows, err := r.db.Query(ctx, query, email)
	if err != nil {
		return nil, fmt.Errorf("query aliases: %w", err)
	}
	defer rows.Close()

	var aliases []*domain.Alias
	for rows.Next() {
		var a domain.Alias
		err := rows.Scan(
			&a.ID, &a.DomainID, &a.SourceEmail, &a.TargetEmail,
			&a.IsActive, &a.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan alias: %w", err)
		}
		aliases = append(aliases, &a)
	}

	return aliases, rows.Err()
}

// GetAliasesByTarget returns aliases that point to a target email
func (r *DomainRepository) GetAliasesByTarget(ctx context.Context, email string) ([]*domain.Alias, error) {
	query := `
		SELECT
			id, domain_id, source_email, target_email, is_active, created_at
		FROM aliases
		WHERE target_email = $1 AND is_active = true
	`

	rows, err := r.db.Query(ctx, query, email)
	if err != nil {
		return nil, fmt.Errorf("query aliases by target: %w", err)
	}
	defer rows.Close()

	var aliases []*domain.Alias
	for rows.Next() {
		var a domain.Alias
		err := rows.Scan(
			&a.ID, &a.DomainID, &a.SourceEmail, &a.TargetEmail,
			&a.IsActive, &a.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan alias: %w", err)
		}
		aliases = append(aliases, &a)
	}

	return aliases, rows.Err()
}

// GetDistributionListByEmail returns a distribution list by email
func (r *DomainRepository) GetDistributionListByEmail(ctx context.Context, email string) (*domain.DistributionList, error) {
	query := `
		SELECT
			dl.id, dl.domain_id, dl.email, dl.name, dl.description,
			dl.members_only, dl.moderated, dl.is_active, dl.created_at
		FROM distribution_lists dl
		WHERE dl.email = $1 AND dl.is_active = true
	`

	var dl domain.DistributionList
	err := r.db.QueryRow(ctx, query, email).Scan(
		&dl.ID, &dl.DomainID, &dl.Email, &dl.Name, &dl.Description,
		&dl.MembersOnly, &dl.Moderated, &dl.IsActive, &dl.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query distribution list: %w", err)
	}

	// Load members
	membersQuery := `
		SELECT email FROM distribution_list_members
		WHERE list_id = $1
	`
	rows, err := r.db.Query(ctx, membersQuery, dl.ID)
	if err != nil {
		return nil, fmt.Errorf("query distribution list members: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var member string
		if err := rows.Scan(&member); err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		dl.Members = append(dl.Members, member)
	}

	// Load moderators if moderated
	if dl.Moderated {
		modsQuery := `
			SELECT email FROM distribution_list_moderators
			WHERE list_id = $1
		`
		modRows, err := r.db.Query(ctx, modsQuery, dl.ID)
		if err != nil {
			return nil, fmt.Errorf("query moderators: %w", err)
		}
		defer modRows.Close()

		for modRows.Next() {
			var mod string
			if err := modRows.Scan(&mod); err != nil {
				return nil, fmt.Errorf("scan moderator: %w", err)
			}
			dl.Moderators = append(dl.Moderators, mod)
		}
	}

	return &dl, rows.Err()
}

// GetRoutingRules returns routing rules for a domain
func (r *DomainRepository) GetRoutingRules(ctx context.Context, domainID string) ([]*domain.RoutingRule, error) {
	query := `
		SELECT
			id, domain_id, name, priority, is_active,
			condition_sender_pattern, condition_recipient_pattern,
			condition_subject_pattern, condition_header_name, condition_header_pattern,
			condition_size_min, condition_size_max, condition_has_attachment,
			action_type, action_target, action_rewrite_from, action_rewrite_to,
			action_add_header_name, action_add_header_value,
			action_reject_message, action_quarantine_reason,
			created_at, updated_at
		FROM routing_rules
		WHERE domain_id = $1 AND is_active = true
		ORDER BY priority ASC
	`

	rows, err := r.db.Query(ctx, query, domainID)
	if err != nil {
		return nil, fmt.Errorf("query routing rules: %w", err)
	}
	defer rows.Close()

	var rules []*domain.RoutingRule
	for rows.Next() {
		rule, err := scanRoutingRule(rows)
		if err != nil {
			return nil, fmt.Errorf("scan routing rule: %w", err)
		}
		rules = append(rules, rule)
	}

	return rules, rows.Err()
}

// GetUserDomainPermission returns a user's permission for a domain
func (r *DomainRepository) GetUserDomainPermission(ctx context.Context, userID, domainID string) (*domain.UserDomainPermission, error) {
	query := `
		SELECT
			id, user_id, domain_id, can_send, can_send_as,
			allowed_send_as_addresses, daily_send_limit, created_at
		FROM user_domain_permissions
		WHERE user_id = $1 AND domain_id = $2
	`

	var perm domain.UserDomainPermission
	var allowedAddresses []string
	err := r.db.QueryRow(ctx, query, userID, domainID).Scan(
		&perm.ID, &perm.UserID, &perm.DomainID,
		&perm.CanSend, &perm.CanSendAs, &allowedAddresses,
		&perm.DailySendLimit, &perm.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query user domain permission: %w", err)
	}

	perm.AllowedSendAsAddresses = allowedAddresses
	return &perm, nil
}

// ListenForChanges listens for PostgreSQL NOTIFY events
func (r *DomainRepository) ListenForChanges(ctx context.Context, callback func(table, action, id string)) error {
	conn, err := r.db.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire connection: %w", err)
	}
	defer conn.Release()

	// Listen to domain-related channels
	channels := []string{
		"domain_changes",
		"mailbox_changes",
		"alias_changes",
		"dkim_changes",
		"routing_changes",
		"permission_changes",
	}

	for _, ch := range channels {
		_, err = conn.Exec(ctx, fmt.Sprintf("LISTEN %s", ch))
		if err != nil {
			return fmt.Errorf("listen %s: %w", ch, err)
		}
	}

	r.logger.Info("Listening for database changes", zap.Strings("channels", channels))

	for {
		notification, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return fmt.Errorf("wait for notification: %w", err)
		}

		// Parse payload: "table:action:id"
		var table, action, id string
		_, err = fmt.Sscanf(notification.Payload, "%s:%s:%s", &table, &action, &id)
		if err != nil {
			r.logger.Warn("Invalid notification payload",
				zap.String("payload", notification.Payload))
			continue
		}

		callback(table, action, id)
	}
}

// Helper scan functions

func scanDomain(rows pgx.Rows) (*domain.Domain, error) {
	var d domain.Domain
	d.Policies = &domain.DomainPolicies{}
	var catchAllAddr *string
	var verifiedAt *time.Time

	err := rows.Scan(
		&d.ID, &d.OrganizationID, &d.Name, &d.Status, &d.IsPrimary,
		&d.MXVerified, &d.SPFVerified, &d.DKIMVerified, &d.DMARCVerified,
		&d.Policies.CatchAllEnabled, &catchAllAddr,
		&d.Policies.MaxMessageSize, &d.Policies.RequireTLS, &d.Policies.AllowExternalRelay,
		&d.Policies.RateLimitPerHour, &d.Policies.RateLimitPerDay,
		&d.CreatedAt, &d.UpdatedAt, &verifiedAt,
	)
	if err != nil {
		return nil, err
	}

	if catchAllAddr != nil {
		d.Policies.CatchAllAddress = *catchAllAddr
	}
	if verifiedAt != nil {
		d.VerifiedAt = *verifiedAt
	}

	return &d, nil
}

func scanDomainRow(row pgx.Row) (*domain.Domain, error) {
	var d domain.Domain
	d.Policies = &domain.DomainPolicies{}
	var catchAllAddr *string
	var verifiedAt *time.Time

	err := row.Scan(
		&d.ID, &d.OrganizationID, &d.Name, &d.Status, &d.IsPrimary,
		&d.MXVerified, &d.SPFVerified, &d.DKIMVerified, &d.DMARCVerified,
		&d.Policies.CatchAllEnabled, &catchAllAddr,
		&d.Policies.MaxMessageSize, &d.Policies.RequireTLS, &d.Policies.AllowExternalRelay,
		&d.Policies.RateLimitPerHour, &d.Policies.RateLimitPerDay,
		&d.CreatedAt, &d.UpdatedAt, &verifiedAt,
	)
	if err != nil {
		return nil, err
	}

	if catchAllAddr != nil {
		d.Policies.CatchAllAddress = *catchAllAddr
	}
	if verifiedAt != nil {
		d.VerifiedAt = *verifiedAt
	}

	return &d, nil
}

func scanDKIMKey(rows pgx.Rows) (*domain.DKIMKey, error) {
	var k domain.DKIMKey
	var privateKeyPEM string
	var publicKeyPEM string
	var expiresAt, rotatedAt *time.Time

	err := rows.Scan(
		&k.ID, &k.DomainID, &k.Selector, &privateKeyPEM, &publicKeyPEM,
		&k.Algorithm, &k.KeySize, &k.IsActive, &k.CreatedAt, &expiresAt, &rotatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Store public key PEM
	k.PublicKeyPEM = publicKeyPEM

	// Parse private key
	key, err := parsePEMPrivateKey(privateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}
	k.PrivateKey = key

	// Set public key from private key
	k.PublicKey = &key.PublicKey

	if expiresAt != nil {
		k.ExpiresAt = expiresAt
	}
	if rotatedAt != nil {
		k.RotatedAt = rotatedAt
	}

	return &k, nil
}

func scanDKIMKeyRow(row pgx.Row) (*domain.DKIMKey, error) {
	var k domain.DKIMKey
	var privateKeyPEM string
	var publicKeyPEM string
	var expiresAt, rotatedAt *time.Time

	err := row.Scan(
		&k.ID, &k.DomainID, &k.Selector, &privateKeyPEM, &publicKeyPEM,
		&k.Algorithm, &k.KeySize, &k.IsActive, &k.CreatedAt, &expiresAt, &rotatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Store public key PEM
	k.PublicKeyPEM = publicKeyPEM

	// Parse private key
	key, err := parsePEMPrivateKey(privateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}
	k.PrivateKey = key

	// Set public key from private key
	k.PublicKey = &key.PublicKey

	if expiresAt != nil {
		k.ExpiresAt = expiresAt
	}
	if rotatedAt != nil {
		k.RotatedAt = rotatedAt
	}

	return &k, nil
}

func scanMailboxRow(row pgx.Row) (*domain.Mailbox, error) {
	var m domain.Mailbox
	var displayName, autoReplySubject, autoReplyBody, forwardAddress *string
	var autoReplyStart, autoReplyEnd *time.Time

	err := row.Scan(
		&m.ID, &m.UserID, &m.DomainID, &m.LocalPart, &m.Email, &displayName,
		&m.StorageQuotaBytes, &m.StorageUsedBytes, &m.IsActive, &m.AutoReplyEnabled,
		&autoReplySubject, &autoReplyBody, &autoReplyStart, &autoReplyEnd,
		&m.ForwardEnabled, &forwardAddress, &m.ForwardKeepCopy,
		&m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if displayName != nil {
		m.DisplayName = *displayName
	}
	if autoReplySubject != nil {
		m.AutoReplySubject = *autoReplySubject
	}
	if autoReplyBody != nil {
		m.AutoReplyBody = *autoReplyBody
	}
	if autoReplyStart != nil {
		m.AutoReplyStart = autoReplyStart
	}
	if autoReplyEnd != nil {
		m.AutoReplyEnd = autoReplyEnd
	}
	if forwardAddress != nil {
		m.ForwardAddress = *forwardAddress
	}

	return &m, nil
}

func scanRoutingRule(rows pgx.Rows) (*domain.RoutingRule, error) {
	var r domain.RoutingRule
	var condSender, condRecipient, condSubject, condHeaderName, condHeaderPattern *string
	var condSizeMin, condSizeMax *int64
	var condHasAttachment *bool
	var actionTarget, actionRewriteFrom, actionRewriteTo *string
	var actionAddHeaderName, actionAddHeaderValue *string
	var actionRejectMsg, actionQuarantineReason *string

	err := rows.Scan(
		&r.ID, &r.DomainID, &r.Name, &r.Priority, &r.IsActive,
		&condSender, &condRecipient, &condSubject, &condHeaderName, &condHeaderPattern,
		&condSizeMin, &condSizeMax, &condHasAttachment,
		&r.Actions.Type, &actionTarget, &actionRewriteFrom, &actionRewriteTo,
		&actionAddHeaderName, &actionAddHeaderValue,
		&actionRejectMsg, &actionQuarantineReason,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Map nullable fields to conditions
	if condSender != nil {
		r.Conditions.SenderPattern = *condSender
	}
	if condRecipient != nil {
		r.Conditions.RecipientPattern = *condRecipient
	}
	if condSubject != nil {
		r.Conditions.SubjectPattern = *condSubject
	}
	if condHeaderName != nil {
		r.Conditions.HeaderName = *condHeaderName
	}
	if condHeaderPattern != nil {
		r.Conditions.HeaderPattern = *condHeaderPattern
	}
	if condSizeMin != nil {
		r.Conditions.SizeMin = condSizeMin
	}
	if condSizeMax != nil {
		r.Conditions.SizeMax = condSizeMax
	}
	if condHasAttachment != nil {
		r.Conditions.HasAttachment = condHasAttachment
	}

	// Map nullable fields to actions
	if actionTarget != nil {
		r.Actions.Target = *actionTarget
	}
	if actionRewriteFrom != nil {
		r.Actions.RewriteFrom = *actionRewriteFrom
	}
	if actionRewriteTo != nil {
		r.Actions.RewriteTo = *actionRewriteTo
	}
	if actionAddHeaderName != nil {
		r.Actions.AddHeaderName = *actionAddHeaderName
	}
	if actionAddHeaderValue != nil {
		r.Actions.AddHeaderValue = *actionAddHeaderValue
	}
	if actionRejectMsg != nil {
		r.Actions.RejectMessage = *actionRejectMsg
	}
	if actionQuarantineReason != nil {
		r.Actions.QuarantineReason = *actionQuarantineReason
	}

	return &r, nil
}

func parsePEMPrivateKey(pemStr string) (*rsa.PrivateKey, error) {
	// Try PEM decoding first
	block, _ := pem.Decode([]byte(pemStr))
	if block != nil {
		switch block.Type {
		case "RSA PRIVATE KEY":
			return x509.ParsePKCS1PrivateKey(block.Bytes)
		case "PRIVATE KEY":
			key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
			if err != nil {
				return nil, err
			}
			rsaKey, ok := key.(*rsa.PrivateKey)
			if !ok {
				return nil, errors.New("not an RSA private key")
			}
			return rsaKey, nil
		default:
			return nil, fmt.Errorf("unsupported key type: %s", block.Type)
		}
	}

	// If PEM decoding fails, the key may be encrypted
	// Try to decrypt first
	if dkimEncryptionKey != "" {
		decrypted, err := decryptPrivateKey(pemStr)
		if err == nil {
			// The decrypted data should be PEM-encoded
			return parsePEMPrivateKey(string(decrypted))
		}
		// If decryption fails, try other methods
	}

	// If PEM decoding fails, try raw base64
	keyBytes, err := base64.StdEncoding.DecodeString(pemStr)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %w", err)
	}

	// Try PKCS1 first
	if key, err := x509.ParsePKCS1PrivateKey(keyBytes); err == nil {
		return key, nil
	}

	// Try PKCS8
	pkcs8Key, err := x509.ParsePKCS8PrivateKey(keyBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}
	rsaKey, ok := pkcs8Key.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("not an RSA private key")
	}
	return rsaKey, nil
}

// decryptPrivateKey decrypts an AES-GCM encrypted private key
func decryptPrivateKey(encryptedKey string) ([]byte, error) {
	if dkimEncryptionKey == "" {
		return nil, errors.New("DKIM encryption key not configured")
	}

	ciphertext, err := base64.StdEncoding.DecodeString(encryptedKey)
	if err != nil {
		return nil, fmt.Errorf("decode ciphertext: %w", err)
	}

	// Decode the encryption key from base64
	key, err := base64.StdEncoding.DecodeString(dkimEncryptionKey)
	if err != nil {
		// If not base64, use the key directly (padded/truncated to 32 bytes)
		key = []byte(dkimEncryptionKey)
		if len(key) < 32 {
			paddedKey := make([]byte, 32)
			copy(paddedKey, key)
			key = paddedKey
		} else if len(key) > 32 {
			key = key[:32]
		}
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create gcm: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt: %w", err)
	}

	return plaintext, nil
}
