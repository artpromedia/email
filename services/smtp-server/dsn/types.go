// Package dsn provides Delivery Status Notification (DSN) handling per RFC 3461-3464
package dsn

import (
	"fmt"
	"strings"
	"time"
)

// BounceType classifies the nature of the delivery failure
type BounceType string

const (
	// BounceHard indicates a permanent failure - address doesn't exist, domain invalid, etc.
	BounceHard BounceType = "hard"

	// BounceSoft indicates a temporary failure - mailbox full, server busy, etc.
	BounceSoft BounceType = "soft"

	// BouncePolicy indicates rejection due to policy - content filtering, sender blocked, etc.
	BouncePolicy BounceType = "policy"

	// BounceNetwork indicates network-level failure - connection timeout, DNS failure, etc.
	BounceNetwork BounceType = "network"
)

// Action represents the delivery action taken per RFC 3464
type Action string

const (
	ActionFailed    Action = "failed"    // Delivery failed permanently
	ActionDelayed   Action = "delayed"   // Delivery delayed, will retry
	ActionDelivered Action = "delivered" // Successfully delivered
	ActionRelayed   Action = "relayed"   // Relayed to another MTA
	ActionExpanded  Action = "expanded"  // Expanded to multiple recipients
)

// DSNReport contains the full delivery status notification
type DSNReport struct {
	// ReportingMTA is the hostname of the MTA generating this report
	ReportingMTA string `json:"reporting_mta"`

	// ArrivalDate is when the original message was received
	ArrivalDate time.Time `json:"arrival_date"`

	// OriginalEnvelopeID is the ENVID from the original MAIL FROM
	OriginalEnvelopeID string `json:"original_envelope_id,omitempty"`

	// OriginalMessageID is the Message-ID header from the original
	OriginalMessageID string `json:"original_message_id,omitempty"`

	// FinalRecipients contains status for each recipient
	FinalRecipients []RecipientStatus `json:"final_recipients"`

	// OriginalHeaders contains the headers from the original message
	OriginalHeaders string `json:"original_headers,omitempty"`

	// OriginalMessage contains the full original message (if small enough)
	OriginalMessage []byte `json:"-"`

	// GeneratedAt is when this DSN was created
	GeneratedAt time.Time `json:"generated_at"`
}

// RecipientStatus contains delivery status for a single recipient per RFC 3464
type RecipientStatus struct {
	// OriginalRecipient is the original recipient address as given
	OriginalRecipient string `json:"original_recipient,omitempty"`

	// FinalRecipient is the actual recipient address after any forwarding
	FinalRecipient string `json:"final_recipient"`

	// Action taken for this recipient
	Action Action `json:"action"`

	// Status is the RFC 3463 enhanced status code (e.g., "5.1.1")
	Status string `json:"status"`

	// BounceType classifies the failure for internal use
	BounceType BounceType `json:"bounce_type,omitempty"`

	// RemoteMTA is the hostname of the remote server (if applicable)
	RemoteMTA string `json:"remote_mta,omitempty"`

	// DiagnosticCode contains the SMTP response from the remote server
	DiagnosticCode string `json:"diagnostic_code,omitempty"`

	// LastAttemptDate is when delivery was last attempted
	LastAttemptDate time.Time `json:"last_attempt_date,omitempty"`

	// WillRetryUntil indicates when retries will stop (for soft bounces)
	WillRetryUntil *time.Time `json:"will_retry_until,omitempty"`
}

// StatusCode represents an RFC 3463 enhanced mail status code
type StatusCode struct {
	Class   int // 2=Success, 4=Temporary failure, 5=Permanent failure
	Subject int // Category of the status
	Detail  int // Specific condition
}

// Common status codes per RFC 3463
var (
	// Success codes (class 2)
	StatusSuccess = StatusCode{2, 0, 0} // Generic success

	// Permanent failure codes (class 5)
	StatusBadDestMailbox     = StatusCode{5, 1, 1} // Bad destination mailbox address
	StatusBadDestSystem      = StatusCode{5, 1, 2} // Bad destination system address
	StatusBadDestSyntax      = StatusCode{5, 1, 3} // Bad destination mailbox address syntax
	StatusDestAmbiguous      = StatusCode{5, 1, 4} // Destination mailbox address ambiguous
	StatusDestValid          = StatusCode{5, 1, 5} // Destination address valid
	StatusDestNoLongerAccept = StatusCode{5, 1, 6} // Destination mailbox moved, no forwarding

	StatusBadSenderMailbox = StatusCode{5, 1, 7} // Bad sender's mailbox address syntax
	StatusBadSenderSystem  = StatusCode{5, 1, 8} // Bad sender's system address

	StatusMessageTooLarge       = StatusCode{5, 3, 4} // Message too big for system
	StatusMailboxFull           = StatusCode{5, 2, 2} // Mailbox full
	StatusMessageLengthExceeded = StatusCode{5, 2, 3} // Message length exceeds limit

	StatusSecurityRejection = StatusCode{5, 7, 1} // Delivery not authorized, message refused

	// Temporary failure codes (class 4)
	StatusTempMailboxUnavail   = StatusCode{4, 2, 1} // Mailbox disabled, not accepting messages
	StatusTempMailboxFull      = StatusCode{4, 2, 2} // Mailbox full
	StatusTempSystemFull       = StatusCode{4, 3, 1} // Mail system full
	StatusTempSystemNotAccept  = StatusCode{4, 3, 2} // System not accepting network messages
	StatusTempSystemNotCapable = StatusCode{4, 3, 3} // System not capable of selected features
	StatusTempMessageTooLarge  = StatusCode{4, 3, 4} // Message too big for system
	StatusTempNetworkFailed    = StatusCode{4, 4, 1} // No answer from host
	StatusTempBadConnection    = StatusCode{4, 4, 2} // Bad connection
	StatusTempRoutingFailed    = StatusCode{4, 4, 4} // Unable to route
	StatusTempCongestion       = StatusCode{4, 4, 5} // Mail system congestion
)

// String returns the status code as a string (e.g., "5.1.1")
func (s StatusCode) String() string {
	return fmt.Sprintf("%d.%d.%d", s.Class, s.Subject, s.Detail)
}

// IsPermanent returns true if this is a permanent failure (class 5)
func (s StatusCode) IsPermanent() bool {
	return s.Class == 5
}

// IsTemporary returns true if this is a temporary failure (class 4)
func (s StatusCode) IsTemporary() bool {
	return s.Class == 4
}

// IsSuccess returns true if this is a success (class 2)
func (s StatusCode) IsSuccess() bool {
	return s.Class == 2
}

// ClassifyStatus determines the bounce type from an SMTP response code
func ClassifyStatus(smtpCode int, message string) (StatusCode, BounceType) {
	switch {
	// 5xx permanent failures
	case smtpCode == 550:
		if containsAny(message, "user unknown", "mailbox not found", "no such user", "recipient rejected") {
			return StatusBadDestMailbox, BounceHard
		}
		if containsAny(message, "spam", "blocked", "rejected", "policy") {
			return StatusSecurityRejection, BouncePolicy
		}
		return StatusBadDestMailbox, BounceHard

	case smtpCode == 551:
		return StatusDestNoLongerAccept, BounceHard

	case smtpCode == 552:
		if containsAny(message, "quota", "mailbox full", "over quota") {
			return StatusMailboxFull, BounceHard
		}
		return StatusMessageTooLarge, BounceHard

	case smtpCode == 553:
		return StatusBadDestSyntax, BounceHard

	case smtpCode == 554:
		return StatusSecurityRejection, BouncePolicy

	// 4xx temporary failures
	case smtpCode == 421:
		return StatusTempSystemNotAccept, BounceSoft

	case smtpCode == 450:
		return StatusTempMailboxUnavail, BounceSoft

	case smtpCode == 451:
		if containsAny(message, "try again", "try later") {
			return StatusTempCongestion, BounceSoft
		}
		return StatusTempSystemFull, BounceSoft

	case smtpCode == 452:
		if containsAny(message, "quota", "full") {
			return StatusTempMailboxFull, BounceSoft
		}
		return StatusTempSystemFull, BounceSoft

	default:
		if smtpCode >= 500 {
			return StatusCode{5, 0, 0}, BounceHard
		}
		if smtpCode >= 400 {
			return StatusCode{4, 0, 0}, BounceSoft
		}
		return StatusSuccess, ""
	}
}

// containsAny checks if the string contains any of the substrings (case-insensitive)
func containsAny(s string, substrs ...string) bool {
	lower := strings.ToLower(s)
	for _, substr := range substrs {
		if strings.Contains(lower, strings.ToLower(substr)) {
			return true
		}
	}
	return false
}
