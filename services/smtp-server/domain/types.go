package domain

import (
	"crypto/rsa"
	"fmt"
	"time"
)

// DomainStatus represents the status of a domain
type DomainStatus string

const (
	DomainStatusPending   DomainStatus = "pending"
	DomainStatusVerified  DomainStatus = "verified"
	DomainStatusFailed    DomainStatus = "failed"
	DomainStatusSuspended DomainStatus = "suspended"
	DomainStatusDeleted   DomainStatus = "deleted"
)

// Domain represents a mail domain configuration
type Domain struct {
	ID             string       `json:"id"`
	OrganizationID string       `json:"organization_id"`
	Name           string       `json:"name"`
	Status         DomainStatus `json:"status"`
	IsPrimary      bool         `json:"is_primary"`
	IsDefault      bool         `json:"is_default"`
	MXVerified     bool         `json:"mx_verified"`
	SPFVerified    bool         `json:"spf_verified"`
	DKIMVerified   bool            `json:"dkim_verified"`
	DMARCVerified  bool            `json:"dmarc_verified"`
	VerifiedAt     time.Time       `json:"verified_at"`
	Policies       *DomainPolicies `json:"policies"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
}

// DomainPolicies holds domain-specific policies
type DomainPolicies struct {
	MaxMessageSize       int64    `json:"max_message_size"`
	RequireTLS           bool     `json:"require_tls"`
	AllowExternalRelay   bool     `json:"allow_external_relay"`
	AllowedSenderDomains []string `json:"allowed_sender_domains"`
	AutoBCCAddresses    []string `json:"auto_bcc_addresses"`
	CatchAllEnabled     bool     `json:"catch_all_enabled"`
	CatchAllAddress     string   `json:"catch_all_address"`
	RejectUnknownUsers  bool     `json:"reject_unknown_users"`
	SpamThreshold       float64  `json:"spam_threshold"`
	VirusScanEnabled    bool     `json:"virus_scan_enabled"`
	GreylistingEnabled  bool     `json:"greylisting_enabled"`
	RateLimitPerHour    int      `json:"rate_limit_per_hour"`
	RateLimitPerDay     int      `json:"rate_limit_per_day"`
}

// DefaultPolicies returns default domain policies
func DefaultPolicies() *DomainPolicies {
	return &DomainPolicies{
		MaxMessageSize:     26214400, // 25MB - aligned with SMTP config and industry standard (Gmail)
		RequireTLS:         false,
		RejectUnknownUsers: true,
		SpamThreshold:      5.0,
		VirusScanEnabled:   true,
		GreylistingEnabled: false,
		RateLimitPerHour:   1000,
		RateLimitPerDay:    10000,
	}
}

// MaxMessageSizeLimit is the maximum allowed message size (100MB)
const MaxMessageSizeLimit = 104857600

// DefaultMessageSize is the standard message size limit (25MB)
const DefaultMessageSize = 26214400

// ValidatePolicies validates domain policies and returns any issues
func (p *DomainPolicies) Validate() error {
	if p.MaxMessageSize > MaxMessageSizeLimit {
		return fmt.Errorf("max_message_size %d exceeds maximum allowed %d", p.MaxMessageSize, MaxMessageSizeLimit)
	}
	if p.MaxMessageSize <= 0 {
		p.MaxMessageSize = DefaultMessageSize
	}
	if p.RateLimitPerHour < 0 {
		return fmt.Errorf("rate_limit_per_hour cannot be negative")
	}
	if p.RateLimitPerDay < 0 {
		return fmt.Errorf("rate_limit_per_day cannot be negative")
	}
	if p.RateLimitPerDay > 0 && p.RateLimitPerHour > 0 && p.RateLimitPerHour*24 > p.RateLimitPerDay {
		// Warn but don't error - daily limit will be the effective cap
	}
	return nil
}

// DKIMKey represents a DKIM signing key for a domain
type DKIMKey struct {
	ID           string          `json:"id"`
	DomainID     string          `json:"domain_id"`
	Domain       string          `json:"domain"`
	Selector     string          `json:"selector"`
	PrivateKey   *rsa.PrivateKey `json:"-"`
	PublicKey    *rsa.PublicKey  `json:"-"`
	PublicKeyPEM string          `json:"public_key_pem"`
	Algorithm    string          `json:"algorithm"` // rsa-sha256
	KeySize      int             `json:"key_size"`
	IsActive     bool            `json:"is_active"`
	ExpiresAt    *time.Time      `json:"expires_at"`
	RotatedAt    *time.Time      `json:"rotated_at"`
	CreatedAt    time.Time       `json:"created_at"`
}

// Mailbox represents a user mailbox
type Mailbox struct {
	ID                string     `json:"id"`
	UserID            string     `json:"user_id"`
	DomainID          string     `json:"domain_id"`
	OrganizationID    string     `json:"organization_id"`
	Email             string     `json:"email"`
	LocalPart         string     `json:"local_part"`
	Domain            string     `json:"domain"`
	DisplayName       string     `json:"display_name"`
	Status            string     `json:"status"`
	QuotaBytes        int64      `json:"quota_bytes"`
	UsedBytes         int64      `json:"used_bytes"`
	StorageQuotaBytes int64      `json:"storage_quota_bytes"`
	StorageUsedBytes  int64      `json:"storage_used_bytes"`
	AutoReplyEnabled  bool       `json:"auto_reply_enabled"`
	AutoReplySubject  string     `json:"auto_reply_subject"`
	AutoReplyBody     string     `json:"auto_reply_body"`
	AutoReplyStart    *time.Time `json:"auto_reply_start"`
	AutoReplyEnd      *time.Time `json:"auto_reply_end"`
	ForwardEnabled    bool       `json:"forward_enabled"`
	ForwardAddress    string     `json:"forward_address"`
	ForwardKeepCopy   bool       `json:"forward_keep_copy"`
	IsActive          bool       `json:"is_active"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// Alias represents an email alias
type Alias struct {
	ID             string    `json:"id"`
	DomainID       string    `json:"domain_id"`
	OrganizationID string    `json:"organization_id"`
	SourceEmail    string    `json:"source_email"`
	TargetEmail    string    `json:"target_email"`
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
}

// DistributionList represents a distribution list / group
type DistributionList struct {
	ID             string    `json:"id"`
	DomainID       string    `json:"domain_id"`
	OrganizationID string    `json:"organization_id"`
	Email          string    `json:"email"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Members        []string  `json:"members"`
	MembersOnly    bool      `json:"members_only"`
	Moderated      bool      `json:"moderated"`
	Moderators     []string  `json:"moderators"`
	AllowExternal  bool      `json:"allow_external"`
	IsActive       bool      `json:"is_active"`
	CreatedAt      time.Time `json:"created_at"`
}

// RoutingRule represents a domain routing rule
type RoutingRule struct {
	ID             string            `json:"id"`
	DomainID       string            `json:"domain_id"`
	OrganizationID string            `json:"organization_id"`
	Priority       int               `json:"priority"`
	Name           string            `json:"name"`
	Description    string            `json:"description"`
	Conditions     *RuleConditions   `json:"conditions"`
	Actions        *RuleActions      `json:"actions"`
	IsActive       bool              `json:"is_active"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
}

// RuleConditions defines when a routing rule applies
type RuleConditions struct {
	SenderPattern     string   `json:"sender_pattern"`
	RecipientPattern  string   `json:"recipient_pattern"`
	SubjectPattern    string   `json:"subject_pattern"`
	HeaderName        string   `json:"header_name"`
	HeaderPattern     string   `json:"header_pattern"`
	SenderDomains     []string `json:"sender_domains"`
	RecipientDomains  []string `json:"recipient_domains"`
	HasAttachment     *bool    `json:"has_attachment"`
	MessageSizeMin    *int64   `json:"message_size_min"`
	MessageSizeMax    *int64   `json:"message_size_max"`
	SizeMin           *int64   `json:"size_min"`
	SizeMax           *int64   `json:"size_max"`
}

// RuleActions defines what to do when a rule matches
type RuleActions struct {
	Action            string            `json:"action"` // forward, redirect, reject, deliver, bcc
	Type              string            `json:"type"`
	Target            string            `json:"target"`
	ForwardTo         []string          `json:"forward_to"`
	RedirectTo        string            `json:"redirect_to"`
	BCCTo             []string          `json:"bcc_to"`
	RejectMessage     string            `json:"reject_message"`
	AddHeaders        map[string]string `json:"add_headers"`
	AddHeaderName     string            `json:"add_header_name"`
	AddHeaderValue    string            `json:"add_header_value"`
	ModifySubject     string            `json:"modify_subject"`
	RewriteFrom       string            `json:"rewrite_from"`
	RewriteTo         string            `json:"rewrite_to"`
	QuarantineReason  string            `json:"quarantine_reason"`
	StopProcessing    bool              `json:"stop_processing"`
}

// UserDomainPermission represents a user's permission to send from a domain
type UserDomainPermission struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	DomainID       string    `json:"domain_id"`
	OrganizationID         string    `json:"organization_id"`
	CanSend                bool      `json:"can_send"`
	CanSendAs              bool      `json:"can_send_as"`
	CanReceive             bool      `json:"can_receive"`
	IsAdmin                bool      `json:"is_admin"`
	DailySendLimit         int       `json:"daily_send_limit"`
	AllowedSendAsAddresses []string  `json:"allowed_send_as_addresses"`
	CreatedAt              time.Time `json:"created_at"`
}

// RecipientLookupResult represents the result of looking up a recipient
type RecipientLookupResult struct {
	Found            bool
	Type             string // mailbox, alias, distribution_list, catch_all
	Mailbox          *Mailbox
	Alias            *Alias
	DistributionList *DistributionList
	Domain           *Domain
	FinalRecipients  []string
}

// SenderPermissionResult represents the result of checking sender permissions
type SenderPermissionResult struct {
	Allowed     bool
	Domain      *Domain
	DKIMKey     *DKIMKey
	Permission  *UserDomainPermission
	RateLimited bool
	Reason      string
}

// Message represents an email message for queue processing
type Message struct {
	ID               string            `json:"id"`
	OrganizationID   string            `json:"organization_id"`
	DomainID         string            `json:"domain_id"`
	FromDomain       string            `json:"from_domain"`
	From             string            `json:"from"`
	FromAddress      string            `json:"from_address"`
	To               []string          `json:"to"`
	Recipients       []string          `json:"recipients"`
	Cc               []string          `json:"cc"`
	Bcc              []string          `json:"bcc"`
	Subject          string            `json:"subject"`
	Headers          map[string]string `json:"headers"`
	RawMessage       []byte            `json:"-"`
	RawMessagePath   string            `json:"raw_message_path"`
	Size             int64             `json:"size"`
	BodySize         int64             `json:"body_size"`
	Priority         int               `json:"priority"`
	IsInternal       bool              `json:"is_internal"`
	IsCrossDomain    bool              `json:"is_cross_domain"`
	RequiresTLS      bool              `json:"requires_tls"`
	DKIMSigned       bool              `json:"dkim_signed"`
	SPFResult        string            `json:"spf_result"`
	DKIMResult       string            `json:"dkim_result"`
	DMARCResult      string            `json:"dmarc_result"`
	SpamScore        float64           `json:"spam_score"`
	QueuedAt         time.Time         `json:"queued_at"`
	ScheduledAt      *time.Time        `json:"scheduled_at"`
	Attempts         int               `json:"attempts"`
	RetryCount       int               `json:"retry_count"`
	MaxRetries       int               `json:"max_retries"`
	LastAttemptAt    *time.Time        `json:"last_attempt_at"`
	NextAttemptAt    *time.Time        `json:"next_attempt_at"`
	NextRetryAt      *time.Time        `json:"next_retry_at"`
	Status           MessageStatus     `json:"status"`
	ErrorMessage     string            `json:"error_message"`
	LastError        string            `json:"last_error"`
	DeliveredAt      *time.Time        `json:"delivered_at"`
	FailedAt         *time.Time        `json:"failed_at"`
	CreatedAt        time.Time         `json:"created_at"`
}

// MessageStatus represents the status of a message in the queue
type MessageStatus string

// MessageStatus constants
const (
	MessageStatusQueued     MessageStatus = "queued"
	MessageStatusProcessing MessageStatus = "processing"
	MessageStatusDelivered  MessageStatus = "delivered"
	MessageStatusBounced    MessageStatus = "bounced"
	MessageStatusDeferred   MessageStatus = "deferred"
	MessageStatusFailed     MessageStatus = "failed"

	// Aliases for backward compatibility
	StatusPending    MessageStatus = "pending"
	StatusQueued     MessageStatus = "queued"
	StatusProcessing MessageStatus = "processing"
	StatusDelivered  MessageStatus = "delivered"
	StatusBounced    MessageStatus = "bounced"
	StatusDeferred   MessageStatus = "deferred"
	StatusFailed     MessageStatus = "failed"
)
