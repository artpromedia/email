package domain

import (
	"crypto/rsa"
	"time"
)

// DomainStatus represents the verification status of a domain
type DomainStatus string

const (
	StatusPending    DomainStatus = "pending_verification"
	StatusVerified   DomainStatus = "verified"
	StatusFailed     DomainStatus = "verification_failed"
	StatusSuspended  DomainStatus = "suspended"
	StatusDeleted    DomainStatus = "deleted"
)

// Domain represents an email domain
type Domain struct {
	ID               string       `json:"id"`
	OrganizationID   string       `json:"organization_id"`
	DomainName       string       `json:"domain_name"`
	DisplayName      string       `json:"display_name"`
	Status           DomainStatus `json:"status"`
	IsPrimary        bool         `json:"is_primary"`
	VerificationToken string      `json:"verification_token,omitempty"`

	// DNS verification status
	MXVerified    bool `json:"mx_verified"`
	SPFVerified   bool `json:"spf_verified"`
	DKIMVerified  bool `json:"dkim_verified"`
	DMARCVerified bool `json:"dmarc_verified"`

	// Timestamps
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
	VerifiedAt *time.Time `json:"verified_at,omitempty"`
	LastDNSCheck *time.Time `json:"last_dns_check,omitempty"`
}

// DNSRecord represents a required DNS record
type DNSRecord struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	Value    string `json:"value"`
	Priority int    `json:"priority,omitempty"`
	Purpose  string `json:"purpose"`
}

// DNSCheckResult holds the result of a DNS check
type DNSCheckResult struct {
	MXVerified    bool         `json:"mx_verified"`
	SPFVerified   bool         `json:"spf_verified"`
	DKIMVerified  bool         `json:"dkim_verified"`
	DMARCVerified bool         `json:"dmarc_verified"`
	Issues        []DNSIssue   `json:"issues,omitempty"`
	CheckedAt     time.Time    `json:"checked_at"`
}

// DNSIssue represents an issue found during DNS checking
type DNSIssue struct {
	RecordType string  `json:"record_type"`
	Expected   string  `json:"expected"`
	Found      *string `json:"found"`
	Message    string  `json:"message"`
}

// DKIMKey represents a DKIM signing key
type DKIMKey struct {
	ID         string     `json:"id"`
	DomainID   string     `json:"domain_id"`
	Selector   string     `json:"selector"`
	Algorithm  string     `json:"algorithm"`
	KeySize    int        `json:"key_size"`
	PublicKey  string     `json:"public_key"`
	PrivateKey *rsa.PrivateKey `json:"-"`
	PrivateKeyEncrypted []byte `json:"-"`
	IsActive   bool       `json:"is_active"`
	CreatedAt  time.Time  `json:"created_at"`
	ActivatedAt *time.Time `json:"activated_at,omitempty"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	RotatedAt  *time.Time `json:"rotated_at,omitempty"`
}

// DKIMKeyPublic is the public representation of a DKIM key
type DKIMKeyPublic struct {
	ID          string     `json:"id"`
	Selector    string     `json:"selector"`
	Algorithm   string     `json:"algorithm"`
	KeySize     int        `json:"key_size"`
	PublicKey   string     `json:"public_key"`
	DNSRecord   string     `json:"dns_record"`
	IsActive    bool       `json:"is_active"`
	CreatedAt   time.Time  `json:"created_at"`
	ActivatedAt *time.Time `json:"activated_at,omitempty"`
}

// Branding represents domain-specific branding
type Branding struct {
	ID                 string  `json:"id"`
	DomainID           string  `json:"domain_id"`
	LogoURL            *string `json:"logo_url,omitempty"`
	FaviconURL         *string `json:"favicon_url,omitempty"`
	PrimaryColor       string  `json:"primary_color"`
	LoginBackgroundURL *string `json:"login_background_url,omitempty"`
	EmailHeaderHTML    *string `json:"email_header_html,omitempty"`
	EmailFooterHTML    *string `json:"email_footer_html,omitempty"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// Policies represents domain-specific policies
type Policies struct {
	ID                       string            `json:"id"`
	DomainID                 string            `json:"domain_id"`
	MaxMessageSizeBytes      int64             `json:"max_message_size_bytes"`
	MaxRecipientsPerMessage  int               `json:"max_recipients_per_message"`
	MaxMessagesPerDayPerUser int               `json:"max_messages_per_day_per_user"`
	RequireTLSOutbound       bool              `json:"require_tls_outbound"`
	AllowedRecipientDomains  []string          `json:"allowed_recipient_domains,omitempty"`
	BlockedRecipientDomains  []string          `json:"blocked_recipient_domains,omitempty"`
	AutoBCCAddress           *string           `json:"auto_bcc_address,omitempty"`
	DefaultSignatureEnforced bool              `json:"default_signature_enforced"`
	AttachmentPolicy         *AttachmentPolicy `json:"attachment_policy,omitempty"`
	UpdatedAt                time.Time         `json:"updated_at"`
}

// AttachmentPolicy represents attachment restrictions
type AttachmentPolicy struct {
	BlockedExtensions []string `json:"blocked_extensions,omitempty"`
	RequireScanning   bool     `json:"require_scanning"`
	MaxSizeBytes      int64    `json:"max_size_bytes,omitempty"`
}

// CatchAllConfig represents catch-all email configuration
type CatchAllConfig struct {
	ID        string         `json:"id"`
	DomainID  string         `json:"domain_id"`
	Enabled   bool           `json:"enabled"`
	Action    CatchAllAction `json:"action"`
	DeliverTo *string        `json:"deliver_to,omitempty"`
	ForwardTo *string        `json:"forward_to,omitempty"`
	UpdatedAt time.Time      `json:"updated_at"`
}

// CatchAllAction represents the action to take for catch-all emails
type CatchAllAction string

const (
	CatchAllDeliver CatchAllAction = "deliver"
	CatchAllForward CatchAllAction = "forward"
	CatchAllReject  CatchAllAction = "reject"
)

// DomainStats represents domain statistics
type DomainStats struct {
	DomainID            string    `json:"domain_id"`
	UserCount           int64     `json:"user_count"`
	MailboxCount        int64     `json:"mailbox_count"`
	AliasCount          int64     `json:"alias_count"`
	StorageUsedBytes    int64     `json:"storage_used_bytes"`
	EmailsSentToday     int64     `json:"emails_sent_today"`
	EmailsReceivedToday int64     `json:"emails_received_today"`
	SpamBlockedToday    int64     `json:"spam_blocked_today"`
	ComputedAt          time.Time `json:"computed_at"`
}

// DNSMonitorAlert represents an alert from DNS monitoring
type DNSMonitorAlert struct {
	ID         string    `json:"id"`
	DomainID   string    `json:"domain_id"`
	DomainName string    `json:"domain_name"`
	AlertType  string    `json:"alert_type"`
	RecordType string    `json:"record_type"`
	Message    string    `json:"message"`
	Severity   string    `json:"severity"`
	CreatedAt  time.Time `json:"created_at"`
	ResolvedAt *time.Time `json:"resolved_at,omitempty"`
}
