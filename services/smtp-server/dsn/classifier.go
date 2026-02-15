package dsn

import (
	"regexp"
	"strconv"
	"strings"
)

// BounceCategory provides higher-level categorization of bounce reasons
type BounceCategory string

const (
	CategoryAddressFailure BounceCategory = "address_failure"   // Bad address, no such user
	CategoryMailboxFull    BounceCategory = "mailbox_full"       // Quota exceeded
	CategoryContentReject  BounceCategory = "content_rejection"  // Content/policy rejection
	CategoryNetworkFailure BounceCategory = "network_failure"    // DNS, connection issues
	CategoryProtocolError  BounceCategory = "protocol_error"     // SMTP protocol issues
	CategorySpamReject     BounceCategory = "spam_rejection"     // Rejected as spam
	CategoryAuthFailure    BounceCategory = "auth_failure"       // Authentication/authorization failure
	CategoryRateLimit      BounceCategory = "rate_limit"         // Rate limiting / throttling
	CategoryServerError    BounceCategory = "server_error"       // Remote server error
	CategoryUnknown        BounceCategory = "unknown"            // Unclassifiable
)

// BounceClassification provides detailed classification of a bounce
type BounceClassification struct {
	// BounceType indicates hard, soft, policy, or network bounce
	BounceType BounceType `json:"bounce_type"`

	// Category provides higher-level bounce categorization
	Category BounceCategory `json:"category"`

	// StatusCode is the RFC 3463 enhanced status code
	StatusCode StatusCode `json:"status_code"`

	// SMTPCode is the original 3-digit SMTP response code
	SMTPCode int `json:"smtp_code"`

	// IsPermanent indicates if retrying is pointless
	IsPermanent bool `json:"is_permanent"`

	// ShouldRetry indicates if the message should be retried
	ShouldRetry bool `json:"should_retry"`

	// Description is a human-readable description of the bounce
	Description string `json:"description"`

	// RecommendedAction suggests what to do (e.g., "remove_address", "retry_later", "notify_admin")
	RecommendedAction string `json:"recommended_action"`
}

// Classifier analyzes SMTP error responses to classify bounces
type Classifier struct {
	// Custom rules can be added for specific provider patterns
	customRules []classifierRule
}

type classifierRule struct {
	pattern  *regexp.Regexp
	category BounceCategory
	bounce   BounceType
}

// NewClassifier creates a new bounce classifier
func NewClassifier() *Classifier {
	return &Classifier{
		customRules: defaultCustomRules(),
	}
}

// Classify analyzes an SMTP error response and returns a detailed classification
func (c *Classifier) Classify(smtpCode int, message string) BounceClassification {
	// First check custom pattern rules (for provider-specific messages)
	if result, matched := c.matchCustomRules(message); matched {
		result.SMTPCode = smtpCode
		result.IsPermanent = result.BounceType == BounceHard || result.BounceType == BouncePolicy
		result.ShouldRetry = !result.IsPermanent
		return result
	}

	// Use the status classifier from types.go
	statusCode, bounceType := ClassifyStatus(smtpCode, message)

	classification := BounceClassification{
		BounceType: bounceType,
		StatusCode: statusCode,
		SMTPCode:   smtpCode,
		IsPermanent: bounceType == BounceHard || bounceType == BouncePolicy,
		ShouldRetry: bounceType == BounceSoft || bounceType == BounceNetwork,
	}

	// Determine category from message content
	classification.Category = categorizeMessage(smtpCode, message)

	// Set description and recommended action
	classification.Description = describeClassification(classification)
	classification.RecommendedAction = recommendAction(classification)

	return classification
}

// ClassifyEnhancedStatus classifies from an RFC 3463 enhanced status code string (e.g., "5.1.1")
func (c *Classifier) ClassifyEnhancedStatus(enhancedCode string, message string) BounceClassification {
	parts := strings.Split(enhancedCode, ".")
	if len(parts) != 3 {
		return BounceClassification{
			BounceType:        BounceHard,
			Category:          CategoryUnknown,
			StatusCode:        StatusCode{5, 0, 0},
			IsPermanent:       true,
			ShouldRetry:       false,
			Description:       "Unknown error: " + message,
			RecommendedAction: "notify_admin",
		}
	}

	class, _ := strconv.Atoi(parts[0])
	subject, _ := strconv.Atoi(parts[1])
	detail, _ := strconv.Atoi(parts[2])

	code := StatusCode{Class: class, Subject: subject, Detail: detail}

	var bounceType BounceType
	switch class {
	case 2:
		bounceType = "" // Success, no bounce
	case 4:
		bounceType = BounceSoft
	case 5:
		bounceType = BounceHard
	}

	// More specific classification based on subject/detail
	category := categorizeStatusCode(code)
	if category == CategorySpamReject || category == CategoryContentReject {
		bounceType = BouncePolicy
	}

	classification := BounceClassification{
		BounceType:  bounceType,
		Category:    category,
		StatusCode:  code,
		IsPermanent: class == 5,
		ShouldRetry: class == 4,
	}

	classification.Description = describeClassification(classification)
	classification.RecommendedAction = recommendAction(classification)

	return classification
}

// AddCustomRule adds a provider-specific pattern rule
func (c *Classifier) AddCustomRule(pattern string, category BounceCategory, bounce BounceType) error {
	re, err := regexp.Compile("(?i)" + pattern)
	if err != nil {
		return err
	}
	c.customRules = append(c.customRules, classifierRule{
		pattern:  re,
		category: category,
		bounce:   bounce,
	})
	return nil
}

// matchCustomRules checks if the message matches any custom provider-specific rules
func (c *Classifier) matchCustomRules(message string) (BounceClassification, bool) {
	for _, rule := range c.customRules {
		if rule.pattern.MatchString(message) {
			return BounceClassification{
				BounceType: rule.bounce,
				Category:   rule.category,
			}, true
		}
	}
	return BounceClassification{}, false
}

// categorizeMessage determines the bounce category from the error message content
func categorizeMessage(smtpCode int, message string) BounceCategory {
	lower := strings.ToLower(message)

	// Address-related failures
	if containsAny(lower, "user unknown", "no such user", "mailbox not found",
		"recipient rejected", "address rejected", "does not exist",
		"invalid recipient", "unknown user", "no mailbox") {
		return CategoryAddressFailure
	}

	// Mailbox full / quota
	if containsAny(lower, "mailbox full", "over quota", "quota exceeded",
		"insufficient storage", "storage limit", "mailbox is full") {
		return CategoryMailboxFull
	}

	// Spam rejection
	if containsAny(lower, "spam", "spamhaus", "barracuda", "blacklist",
		"blocklist", "dnsbl", "rbl", "spf fail", "dkim fail",
		"dmarc fail", "reputation") {
		return CategorySpamReject
	}

	// Content rejection
	if containsAny(lower, "content rejected", "message rejected", "policy",
		"prohibited", "attachment", "virus", "malware", "phishing") {
		return CategoryContentReject
	}

	// Auth failures
	if containsAny(lower, "authentication", "relay denied", "not authorized",
		"relay access denied", "not permitted", "authentication required") {
		return CategoryAuthFailure
	}

	// Rate limiting
	if containsAny(lower, "rate limit", "too many", "throttl",
		"try again later", "too many connections", "too many messages") {
		return CategoryRateLimit
	}

	// Network failures
	if containsAny(lower, "connection timeout", "connection refused",
		"network unreachable", "dns", "mx lookup", "no route") {
		return CategoryNetworkFailure
	}

	// Protocol errors
	if containsAny(lower, "protocol error", "syntax error", "command not recognized",
		"command sequence", "tls required") {
		return CategoryProtocolError
	}

	// Server errors
	if smtpCode >= 500 && smtpCode < 600 {
		return CategoryServerError
	}
	if smtpCode >= 400 && smtpCode < 500 {
		return CategoryServerError
	}

	return CategoryUnknown
}

// categorizeStatusCode determines category from an enhanced status code
func categorizeStatusCode(code StatusCode) BounceCategory {
	switch code.Subject {
	case 1: // Addressing
		return CategoryAddressFailure
	case 2: // Mailbox
		if code.Detail == 2 || code.Detail == 3 {
			return CategoryMailboxFull
		}
		return CategoryAddressFailure
	case 3: // Mail system
		if code.Detail == 4 {
			return CategoryMailboxFull // message too large
		}
		return CategoryServerError
	case 4: // Network/routing
		return CategoryNetworkFailure
	case 5: // Protocol
		return CategoryProtocolError
	case 6: // Media/content
		return CategoryContentReject
	case 7: // Security/policy
		if code.Detail == 1 {
			return CategoryAuthFailure
		}
		return CategorySpamReject
	}
	return CategoryUnknown
}

// describeClassification generates a human-readable description
func describeClassification(c BounceClassification) string {
	switch c.Category {
	case CategoryAddressFailure:
		return "The recipient address does not exist or is not accepting mail"
	case CategoryMailboxFull:
		if c.IsPermanent {
			return "The recipient's mailbox is full and cannot accept new messages"
		}
		return "The recipient's mailbox is temporarily full; delivery will be retried"
	case CategoryContentReject:
		return "The message was rejected due to content policy restrictions"
	case CategorySpamReject:
		return "The message was rejected as suspected spam or due to sender reputation"
	case CategoryNetworkFailure:
		return "A network error prevented delivery; the destination may be temporarily unreachable"
	case CategoryProtocolError:
		return "An SMTP protocol error occurred during delivery"
	case CategoryAuthFailure:
		return "The sending server is not authorized to relay mail to this destination"
	case CategoryRateLimit:
		return "Delivery was throttled due to rate limiting; will retry later"
	case CategoryServerError:
		if c.IsPermanent {
			return "The remote server permanently rejected the message"
		}
		return "The remote server encountered a temporary error"
	default:
		return "An unclassified delivery error occurred"
	}
}

// recommendAction suggests what action to take for this bounce
func recommendAction(c BounceClassification) string {
	switch c.Category {
	case CategoryAddressFailure:
		return "remove_address" // Remove from mailing lists, notify sender
	case CategoryMailboxFull:
		if c.IsPermanent {
			return "notify_sender"
		}
		return "retry_later"
	case CategoryContentReject:
		return "notify_sender" // Sender needs to modify content
	case CategorySpamReject:
		return "check_reputation" // Check IP/domain reputation, SPF/DKIM/DMARC
	case CategoryNetworkFailure:
		return "retry_later"
	case CategoryProtocolError:
		return "notify_admin" // May need server configuration fix
	case CategoryAuthFailure:
		return "check_config" // Check relay/auth configuration
	case CategoryRateLimit:
		return "retry_later"
	case CategoryServerError:
		if c.IsPermanent {
			return "notify_admin"
		}
		return "retry_later"
	default:
		return "notify_admin"
	}
}

// defaultCustomRules returns classification rules for major email providers
func defaultCustomRules() []classifierRule {
	rules := []struct {
		pattern  string
		category BounceCategory
		bounce   BounceType
	}{
		// Google/Gmail patterns
		{`The email account that you tried to reach does not exist`, CategoryAddressFailure, BounceHard},
		{`try again later.*gsmtp`, CategoryRateLimit, BounceSoft},
		{`Our system has detected that this message is likely.*spam`, CategorySpamReject, BouncePolicy},

		// Microsoft/Outlook patterns
		{`Mailbox not found`, CategoryAddressFailure, BounceHard},
		{`Recipient rejected`, CategoryAddressFailure, BounceHard},
		{`Message rejected due to content restrictions`, CategoryContentReject, BouncePolicy},

		// Yahoo patterns
		{`delivery error.*this user doesn'?t have a yahoo.com account`, CategoryAddressFailure, BounceHard},
		{`temporarily deferred`, CategoryRateLimit, BounceSoft},

		// Generic provider patterns
		{`greylisted`, CategoryRateLimit, BounceSoft},
		{`Service unavailable.*client host.*blocked`, CategorySpamReject, BouncePolicy},
		{`Access denied.*sending limit`, CategoryRateLimit, BounceSoft},
	}

	compiled := make([]classifierRule, 0, len(rules))
	for _, r := range rules {
		re, err := regexp.Compile("(?i)" + r.pattern)
		if err != nil {
			continue // Skip invalid patterns
		}
		compiled = append(compiled, classifierRule{
			pattern:  re,
			category: r.category,
			bounce:   r.bounce,
		})
	}
	return compiled
}

// IsBounceMessage checks if an email appears to be a bounce/DSN message
// based on common indicators
func IsBounceMessage(from, subject string, headers map[string]string) bool {
	// Null sender (RFC 5321 bounce indicator)
	if from == "" || from == "<>" {
		return true
	}

	// Common bounce sender patterns
	lowerFrom := strings.ToLower(from)
	if strings.HasPrefix(lowerFrom, "mailer-daemon@") ||
		strings.HasPrefix(lowerFrom, "postmaster@") {
		return true
	}

	// Auto-Submitted header (RFC 3834)
	if autoSubmitted, ok := headers["Auto-Submitted"]; ok {
		if strings.ToLower(autoSubmitted) == "auto-replied" ||
			strings.ToLower(autoSubmitted) == "auto-generated" {
			return true
		}
	}

	// Content-Type: multipart/report
	if contentType, ok := headers["Content-Type"]; ok {
		if strings.Contains(strings.ToLower(contentType), "multipart/report") {
			return true
		}
	}

	// Subject patterns
	lowerSubject := strings.ToLower(subject)
	bounceSubjects := []string{
		"undelivered mail",
		"delivery status",
		"delivery failure",
		"mail delivery failed",
		"delivery notification",
		"returned mail",
		"undeliverable",
		"mail system error",
	}
	for _, pattern := range bounceSubjects {
		if strings.Contains(lowerSubject, pattern) {
			return true
		}
	}

	return false
}

// ExtractSMTPCode attempts to extract a 3-digit SMTP code from an error string
func ExtractSMTPCode(errMsg string) (int, bool) {
	re := regexp.MustCompile(`\b([2-5]\d{2})\b`)
	matches := re.FindStringSubmatch(errMsg)
	if len(matches) >= 2 {
		code, err := strconv.Atoi(matches[1])
		if err == nil {
			return code, true
		}
	}
	return 0, false
}

// ExtractEnhancedCode attempts to extract an RFC 3463 enhanced status code (e.g., "5.1.1")
func ExtractEnhancedCode(errMsg string) (string, bool) {
	re := regexp.MustCompile(`\b([245]\.\d{1,3}\.\d{1,3})\b`)
	matches := re.FindStringSubmatch(errMsg)
	if len(matches) >= 2 {
		return matches[1], true
	}
	return "", false
}
