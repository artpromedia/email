package domain

import (
	"crypto/rsa"
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
	DKIMVerified   bool         `json:"dkim_verified"`
	DMARCVerified  bool         `json:"dmarc_verified"`
	Policies       *DomainPolicies `json:"policies"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
}

// DomainPolicies holds domain-specific policies
type DomainPolicies struct {
	MaxMessageSize      int64    `json:"max_message_size"`
	RequireTLS          bool     `json:"require_tls"`
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
		MaxMessageSize:     52428800, // 50MB
		RequireTLS:         false,
		RejectUnknownUsers: true,
		SpamThreshold:      5.0,
		VirusScanEnabled:   true,
		GreylistingEnabled: false,
		RateLimitPerHour:   1000,
		RateLimitPerDay:    10000,
	}
}

// DKIMKey represents a DKIM signing key for a domain
type DKIMKey struct {
	ID           string          `json:"id"`
	DomainID     string          `json:"domain_id"`
	Domain       string          `json:"domain"`
	Selector     string          `json:"selector"`
	PrivateKey   *rsa.PrivateKey `json:"-"`
	PublicKeyPEM string          `json:"public_key_pem"`
	Algorithm    string          `json:"algorithm"` // rsa-sha256
	KeySize      int             `json:"key_size"`
	IsActive     bool            `json:"is_active"`
	ExpiresAt    *time.Time      `json:"expires_at"`
	CreatedAt    time.Time       `json:"created_at"`
}

// Mailbox represents a user mailbox
type Mailbox struct {
	ID             string       `json:"id"`
	UserID         string       `json:"user_id"`
	DomainID       string       `json:"domain_id"`
	OrganizationID string       `json:"organization_id"`
	Email          string       `json:"email"`
	LocalPart      string       `json:"local_part"`
	Domain         string       `json:"domain"`
	DisplayName    string       `json:"display_name"`
	Status         string       `json:"status"`
	QuotaBytes     int64        `json:"quota_bytes"`
	UsedBytes      int64        `json:"used_bytes"`
	IsActive       bool         `json:"is_active"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
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
}

// RuleConditions defines when a routing rule applies
type RuleConditions struct {
	SenderPattern     string   `json:"sender_pattern"`
	RecipientPattern  string   `json:"recipient_pattern"`
	SubjectPattern    string   `json:"subject_pattern"`
	SenderDomains     []string `json:"sender_domains"`
	RecipientDomains  []string `json:"recipient_domains"`
	HasAttachment     *bool    `json:"has_attachment"`
	MessageSizeMin    *int64   `json:"message_size_min"`
	MessageSizeMax    *int64   `json:"message_size_max"`
}

// RuleActions defines what to do when a rule matches
type RuleActions struct {
	Action          string   `json:"action"` // forward, redirect, reject, deliver, bcc
	ForwardTo       []string `json:"forward_to"`
	RedirectTo      string   `json:"redirect_to"`
	BCCTo           []string `json:"bcc_to"`
	RejectMessage   string   `json:"reject_message"`
	AddHeaders      map[string]string `json:"add_headers"`
	ModifySubject   string   `json:"modify_subject"`
	StopProcessing  bool     `json:"stop_processing"`
}

// UserDomainPermission represents a user's permission to send from a domain
type UserDomainPermission struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	DomainID       string    `json:"domain_id"`
	OrganizationID string    `json:"organization_id"`
	CanSend        bool      `json:"can_send"`
	CanReceive     bool      `json:"can_receive"`
	IsAdmin        bool      `json:"is_admin"`
	CreatedAt      time.Time `json:"created_at"`
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
	FromDomain       string            `json:"from_domain"`
	From             string            `json:"from"`
	To               []string          `json:"to"`
	Cc               []string          `json:"cc"`
	Bcc              []string          `json:"bcc"`
	Subject          string            `json:"subject"`
	Headers          map[string]string `json:"headers"`
	RawMessage       []byte            `json:"-"`
	Size             int64             `json:"size"`
	IsInternal       bool              `json:"is_internal"`
	IsCrossDomain    bool              `json:"is_cross_domain"`
	RequiresTLS      bool              `json:"requires_tls"`
	DKIMSigned       bool              `json:"dkim_signed"`
	SPFResult        string            `json:"spf_result"`
	DKIMResult       string            `json:"dkim_result"`
	DMARCResult      string            `json:"dmarc_result"`
	SpamScore        float64           `json:"spam_score"`
	QueuedAt         time.Time         `json:"queued_at"`
	Attempts         int               `json:"attempts"`
	LastAttemptAt    *time.Time        `json:"last_attempt_at"`
	NextAttemptAt    *time.Time        `json:"next_attempt_at"`
	Status           string            `json:"status"`
	ErrorMessage     string            `json:"error_message"`
	DeliveredAt      *time.Time        `json:"delivered_at"`
}

// MessageStatus constants
const (
	MessageStatusQueued     = "queued"
	MessageStatusProcessing = "processing"
	MessageStatusDelivered  = "delivered"
	MessageStatusBounced    = "bounced"
	MessageStatusDeferred   = "deferred"
	MessageStatusFailed     = "failed"
)
