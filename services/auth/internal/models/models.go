// Package models defines the data structures used throughout the auth service.
package models

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Organization represents a tenant organization.
type Organization struct {
	ID               uuid.UUID            `json:"id" db:"id"`
	Name             string               `json:"name" db:"name"`
	Slug             string               `json:"slug" db:"slug"`
	OwnerID          uuid.UUID            `json:"owner_id" db:"owner_id"`
	Plan             string               `json:"plan" db:"plan"`
	Status           string               `json:"status" db:"status"`
	LogoURL          sql.NullString       `json:"logo_url,omitempty" db:"logo_url"`
	Settings         OrganizationSettings `json:"settings" db:"settings"`
	SubscriptionTier string               `json:"subscription_tier" db:"subscription_tier"`
	MaxDomains       int                  `json:"max_domains" db:"max_domains"`
	MaxUsers         int                  `json:"max_users" db:"max_users"`
	IsActive         bool                 `json:"is_active" db:"is_active"`
	CreatedAt        time.Time            `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time            `json:"updated_at" db:"updated_at"`
}

// OrganizationSettings holds organization-level settings.
type OrganizationSettings struct {
	ID                  uuid.UUID      `json:"id" db:"id"`
	OrganizationID      uuid.UUID      `json:"organization_id" db:"organization_id"`
	DefaultUserQuotaBytes int64        `json:"defaultUserQuotaBytes"`
	MaxAttachmentSizeBytes int64       `json:"maxAttachmentSizeBytes"`
	RequireTwoFactor       bool        `json:"requireTwoFactor"`
	RequireMFA             bool        `json:"require_mfa" db:"require_mfa"`
	SessionTimeoutMinutes  int         `json:"sessionTimeoutMinutes"`
	SessionDuration        int         `json:"session_duration" db:"session_duration"`
	MaxLoginAttempts       int         `json:"max_login_attempts" db:"max_login_attempts"`
	AllowedEmailDomains    []string    `json:"allowed_email_domains" db:"allowed_email_domains"`
	PasswordPolicy         PasswordPolicy `json:"passwordPolicy"`
	EmailRetentionDays     int           `json:"emailRetentionDays"`
	AllowedIPRanges        []string      `json:"allowedIpRanges"`
	Branding               Branding      `json:"branding"`
	CreatedAt              time.Time     `json:"created_at" db:"created_at"`
	UpdatedAt              time.Time     `json:"updated_at" db:"updated_at"`
}

// PasswordPolicy defines password requirements.
type PasswordPolicy struct {
	MinLength           int  `json:"minLength"`
	RequireUppercase    bool `json:"requireUppercase"`
	RequireLowercase    bool `json:"requireLowercase"`
	RequireNumbers      bool `json:"requireNumbers"`
	RequireSpecialChars bool `json:"requireSpecialChars"`
	ExpirationDays      int  `json:"expirationDays"`
}

// DefaultPasswordPolicy returns a sensible default password policy.
func DefaultPasswordPolicy() PasswordPolicy {
	return PasswordPolicy{
		MinLength:           12,
		RequireUppercase:    true,
		RequireLowercase:    true,
		RequireNumbers:      true,
		RequireSpecialChars: true,
		ExpirationDays:      90,
	}
}

// Branding holds organization branding settings.
type Branding struct {
	PrimaryColor string  `json:"primaryColor"`
	LogoURL      *string `json:"logoUrl"`
	FaviconURL   *string `json:"faviconUrl"`
}

// Domain represents an email domain.
type Domain struct {
	ID                  uuid.UUID       `json:"id" db:"id"`
	OrganizationID      uuid.UUID       `json:"organization_id" db:"organization_id"`
	DomainName          string          `json:"domain_name" db:"domain_name"`
	IsPrimary           bool            `json:"is_primary" db:"is_primary"`
	IsDefault           bool            `json:"is_default" db:"is_default"`
	Status              string          `json:"status" db:"status"`
	IsVerified          bool            `json:"is_verified" db:"is_verified"`
	VerificationStatus  string          `json:"verification_status" db:"verification_status"`
	VerificationToken   string          `json:"verification_token,omitempty" db:"verification_token"`
	VerificationMethod  string          `json:"verification_method" db:"verification_method"`
	VerifiedAt          *time.Time      `json:"verified_at,omitempty" db:"verified_at"`
	MXVerified          bool            `json:"mx_verified" db:"mx_verified"`
	SPFVerified         bool            `json:"spf_verified" db:"spf_verified"`
	DKIMVerified        bool            `json:"dkim_verified" db:"dkim_verified"`
	DMARCVerified       bool            `json:"dmarc_verified" db:"dmarc_verified"`
	IsActive            bool            `json:"is_active" db:"is_active"`
	CreatedAt           time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at" db:"updated_at"`
}

// DomainSettings holds domain-specific settings.
type DomainSettings struct {
	ID                   uuid.UUID          `json:"id" db:"id"`
	DomainID             uuid.UUID          `json:"domain_id" db:"domain_id"`
	CatchAllEnabled      bool               `json:"catch_all_enabled" db:"catch_all_enabled"`
	AutoCreateMailbox    bool               `json:"auto_create_mailbox" db:"auto_create_mailbox"`
	Branding             *DomainBranding    `json:"branding,omitempty" db:"branding"`
	DefaultMailboxQuota  int64              `json:"default_mailbox_quota_bytes" db:"default_mailbox_quota_bytes"`
	AllowExternalEmails  bool               `json:"allow_external_emails" db:"allow_external_emails"`
	RequireApproval      bool               `json:"require_approval_for_new_users" db:"require_approval_for_new_users"`
	ContentFilterRules   []ContentFilterRule `json:"content_filter_rules,omitempty" db:"content_filter_rules"`
	CreatedAt            time.Time          `json:"created_at" db:"created_at"`
	UpdatedAt            time.Time          `json:"updated_at" db:"updated_at"`
}

// DomainBranding holds domain-specific branding.
type DomainBranding struct {
	LogoURL         *string `json:"logoUrl"`
	PrimaryColor    string  `json:"primaryColor"`
	WebmailTitle    string  `json:"webmailTitle"`
	SupportEmail    string  `json:"supportEmail"`
	CustomCSS       *string `json:"customCss"`
	EmailSignature  *string `json:"emailSignature"`
}

// ContentFilterRule defines a content filtering rule.
type ContentFilterRule struct {
	ID           string                   `json:"id"`
	Name         string                   `json:"name"`
	Enabled      bool                     `json:"enabled"`
	Criteria     []ContentFilterCriteria  `json:"criteria"`
	Action       string                   `json:"action"`
	ActionParams map[string]string        `json:"actionParams"`
}

// ContentFilterCriteria defines filter matching criteria.
type ContentFilterCriteria struct {
	Field         string `json:"field"`
	Operator      string `json:"operator"`
	Value         string `json:"value"`
	CaseSensitive bool   `json:"caseSensitive"`
}

// User represents a user account.
type User struct {
	ID                    uuid.UUID       `json:"id" db:"id"`
	OrganizationID        uuid.UUID       `json:"organization_id" db:"organization_id"`
	ExternalID            sql.NullString  `json:"external_id,omitempty" db:"external_id"`
	Email                 string          `json:"email" db:"email"` // Primary email
	DisplayName           string          `json:"display_name" db:"display_name"`
	PasswordHash          sql.NullString  `json:"-" db:"password_hash"`
	Role                  string          `json:"role" db:"role"`
	OrganizationRole      string          `json:"organization_role" db:"organization_role"`
	Status                string          `json:"status" db:"status"`
	Timezone              string          `json:"timezone" db:"timezone"`
	Locale                string          `json:"locale" db:"locale"`
	AvatarURL             sql.NullString  `json:"avatar_url,omitempty" db:"avatar_url"`
	MFAEnabled            bool            `json:"mfa_enabled" db:"mfa_enabled"`
	MFASecret             sql.NullString  `json:"-" db:"mfa_secret"`
	MFABackupCodes        sql.NullString  `json:"-" db:"mfa_backup_codes"`
	PasswordChangedAt     sql.NullTime    `json:"password_changed_at,omitempty" db:"password_changed_at"`
	LastLoginAt           sql.NullTime    `json:"last_login_at,omitempty" db:"last_login_at"`
	LastLoginIP           sql.NullString  `json:"last_login_ip,omitempty" db:"last_login_ip"`
	FailedLoginAttempts   int             `json:"-" db:"failed_login_attempts"`
	LockedUntil           sql.NullTime    `json:"-" db:"locked_until"`
	SuspendedAt           *time.Time      `json:"suspended_at,omitempty" db:"suspended_at"`
	SuspendReason         string          `json:"suspend_reason,omitempty" db:"suspend_reason"`
	EmailVerified         bool            `json:"email_verified" db:"email_verified"`
	EmailVerificationToken sql.NullString `json:"-" db:"email_verification_token"`
	CreatedAt             time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time       `json:"updated_at" db:"updated_at"`
}

// UserEmailAddress represents an email address associated with a user.
type UserEmailAddress struct {
	ID                uuid.UUID      `json:"id" db:"id"`
	UserID            uuid.UUID      `json:"user_id" db:"user_id"`
	DomainID          uuid.UUID      `json:"domain_id" db:"domain_id"`
	EmailAddress      string         `json:"email_address" db:"email_address"`
	LocalPart         string         `json:"local_part" db:"local_part"`
	IsPrimary         bool           `json:"is_primary" db:"is_primary"`
	IsVerified        bool           `json:"is_verified" db:"is_verified"`
	VerificationToken sql.NullString `json:"-" db:"verification_token"`
	VerifiedAt        sql.NullTime   `json:"verified_at,omitempty" db:"verified_at"`
	CreatedAt         time.Time      `json:"created_at" db:"created_at"`
}

// UserDomainPermission represents a user's permissions on a domain.
type UserDomainPermission struct {
	ID               uuid.UUID  `json:"id" db:"id"`
	UserID           uuid.UUID  `json:"user_id" db:"user_id"`
	DomainID         uuid.UUID  `json:"domain_id" db:"domain_id"`
	CanSendAs        bool       `json:"can_send_as" db:"can_send_as"`
	CanManage        bool       `json:"can_manage" db:"can_manage"`
	CanViewAnalytics bool       `json:"can_view_analytics" db:"can_view_analytics"`
	CanManageUsers   bool       `json:"can_manage_users" db:"can_manage_users"`
	GrantedBy        *uuid.UUID `json:"granted_by,omitempty" db:"granted_by"`
	GrantedAt        time.Time  `json:"granted_at" db:"granted_at"`
}

// UserSession represents an active user session.
type UserSession struct {
	ID             uuid.UUID      `json:"id" db:"id"`
	UserID         uuid.UUID      `json:"user_id" db:"user_id"`
	TokenHash      string         `json:"-" db:"token_hash"`
	UserAgent      sql.NullString `json:"user_agent,omitempty" db:"user_agent"`
	IPAddress      sql.NullString `json:"ip_address,omitempty" db:"ip_address"`
	LastActivityAt time.Time      `json:"last_activity_at" db:"last_activity_at"`
	ExpiresAt      time.Time      `json:"expires_at" db:"expires_at"`
	CreatedAt      time.Time      `json:"created_at" db:"created_at"`
	RevokedAt      sql.NullTime   `json:"revoked_at,omitempty" db:"revoked_at"`
}

// Mailbox represents a user's mailbox.
type Mailbox struct {
	ID             uuid.UUID         `json:"id" db:"id"`
	UserID         uuid.UUID         `json:"user_id" db:"user_id"`
	EmailAddressID uuid.UUID         `json:"email_address_id" db:"email_address_id"`
	DomainEmail    string            `json:"domain_email" db:"domain_email"`
	DisplayName    sql.NullString    `json:"display_name,omitempty" db:"display_name"`
	QuotaBytes     int64             `json:"quota_bytes" db:"quota_bytes"`
	UsedBytes      int64             `json:"used_bytes" db:"used_bytes"`
	Settings       *MailboxSettings  `json:"settings,omitempty" db:"settings"`
	IsActive       bool              `json:"is_active" db:"is_active"`
	CreatedAt      time.Time         `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at" db:"updated_at"`
}

// MailboxSettings holds mailbox-specific settings.
type MailboxSettings struct {
	AutoReply        *AutoReplySettings `json:"autoReply,omitempty"`
	SignatureHTML    *string            `json:"signatureHtml,omitempty"`
	SignaturePlain   *string            `json:"signaturePlain,omitempty"`
	ForwardTo        []string           `json:"forwardTo,omitempty"`
	DeleteAfterFwd   bool               `json:"deleteAfterForward"`
}

// AutoReplySettings holds auto-reply configuration.
type AutoReplySettings struct {
	Enabled    bool       `json:"enabled"`
	Subject    string     `json:"subject"`
	Message    string     `json:"message"`
	StartDate  *time.Time `json:"startDate,omitempty"`
	EndDate    *time.Time `json:"endDate,omitempty"`
	ExternalOnly bool     `json:"externalOnly"`
}

// SSOConfig represents SSO configuration for a domain.
type SSOConfig struct {
	ID                  uuid.UUID        `json:"id" db:"id"`
	DomainID            uuid.UUID        `json:"domain_id" db:"domain_id"`
	Provider            string           `json:"provider" db:"provider"` // "saml" or "oidc"
	IsEnabled           bool             `json:"is_enabled" db:"is_enabled"`
	EnforceSSO          bool             `json:"enforce_sso" db:"enforce_sso"` // Password login disabled
	AutoProvisionUsers  bool             `json:"auto_provision_users" db:"auto_provision_users"`
	DefaultRole         string           `json:"default_role" db:"default_role"`
	SAMLConfig          *SAMLConfig      `json:"saml_config,omitempty" db:"saml_config"`
	OIDCConfig          *OIDCConfig      `json:"oidc_config,omitempty" db:"oidc_config"`
	CreatedAt           time.Time        `json:"created_at" db:"created_at"`
	UpdatedAt           time.Time        `json:"updated_at" db:"updated_at"`
}

// SAMLConfig holds SAML IdP configuration.
type SAMLConfig struct {
	IDPMetadataURL   string  `json:"idp_metadata_url"`
	IDPEntityID      string  `json:"idp_entity_id"`
	IDPSSOURL        string  `json:"idp_sso_url"`
	IDPSLOUrl        *string `json:"idp_slo_url,omitempty"`
	Certificate      string  `json:"certificate"`
	SignRequests     bool    `json:"sign_requests"`
	WantAssertionsSigned bool `json:"want_assertions_signed"`
	NameIDFormat     string  `json:"name_id_format"`
	AttributeMapping map[string]string `json:"attribute_mapping"`
}

// OIDCConfig holds OIDC IdP configuration.
type OIDCConfig struct {
	Issuer           string            `json:"issuer"`
	ClientID         string            `json:"client_id"`
	ClientSecret     string            `json:"client_secret"`
	Scopes           []string          `json:"scopes"`
	AuthorizationURL *string           `json:"authorization_url,omitempty"` // Override from discovery
	TokenURL         *string           `json:"token_url,omitempty"`          // Override from discovery
	UserInfoURL      *string           `json:"userinfo_url,omitempty"`       // Override from discovery
	JWKSURL          *string           `json:"jwks_url,omitempty"`           // Override from discovery
	AttributeMapping map[string]string `json:"attribute_mapping"`
}

// SSOIdentity links a user to their SSO identity.
type SSOIdentity struct {
	ID             uuid.UUID      `json:"id" db:"id"`
	UserID         uuid.UUID      `json:"user_id" db:"user_id"`
	DomainID       uuid.UUID      `json:"domain_id" db:"domain_id"`
	Provider       string         `json:"provider" db:"provider"`
	ProviderUserID string         `json:"provider_user_id" db:"provider_user_id"`
	Email          string         `json:"email" db:"email"`
	RawAttributes  json.RawMessage `json:"raw_attributes,omitempty" db:"raw_attributes"`
	LastLoginAt    sql.NullTime   `json:"last_login_at,omitempty" db:"last_login_at"`
	CreatedAt      time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at" db:"updated_at"`
}

// LoginAttempt records a login attempt for audit purposes.
type LoginAttempt struct {
	ID            uuid.UUID      `json:"id" db:"id"`
	UserID        *uuid.UUID     `json:"user_id,omitempty" db:"user_id"`
	Email         string         `json:"email" db:"email"`
	IPAddress     string         `json:"ip_address" db:"ip_address"`
	UserAgent     sql.NullString `json:"user_agent,omitempty" db:"user_agent"`
	Success       bool           `json:"success" db:"success"`
	FailureReason sql.NullString `json:"failure_reason,omitempty" db:"failure_reason"`
	Method        string         `json:"method" db:"method"` // "password", "sso_saml", "sso_oidc", "mfa"
	CreatedAt     time.Time      `json:"created_at" db:"created_at"`
}

// AuditLog records an audit event.
type AuditLog struct {
	ID             uuid.UUID       `json:"id" db:"id"`
	OrganizationID uuid.UUID       `json:"organization_id" db:"organization_id"`
	UserID         *uuid.UUID      `json:"user_id,omitempty" db:"user_id"`
	Action         string          `json:"action" db:"action"`
	ResourceType   string          `json:"resource_type" db:"resource_type"`
	ResourceID     *uuid.UUID      `json:"resource_id,omitempty" db:"resource_id"`
	Details        json.RawMessage `json:"details,omitempty" db:"details"`
	IPAddress      sql.NullString  `json:"ip_address,omitempty" db:"ip_address"`
	UserAgent      sql.NullString  `json:"user_agent,omitempty" db:"user_agent"`
	CreatedAt      time.Time       `json:"created_at" db:"created_at"`
}
