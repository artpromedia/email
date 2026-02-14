package autoreply

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/rs/zerolog"

	"github.com/oonrumail/ai-assistant/provider"
)

// Mode represents the auto-reply mode
type Mode string

const (
	ModeOff      Mode = "off"
	ModeSuggest  Mode = "suggest"   // Show suggestion, user approves
	ModeDraft    Mode = "draft"     // Create draft, user reviews
	ModeAutoSend Mode = "auto_send" // Send automatically
)

// Service handles auto-reply agent functionality
type Service struct {
	router *provider.Router
	cache  *redis.Client
	logger zerolog.Logger
}

// ServiceConfig contains auto-reply service configuration
type ServiceConfig struct {
	DefaultCooldownMinutes int
	MaxRepliesPerDay       int
}

// NewService creates a new auto-reply service
func NewService(router *provider.Router, cache *redis.Client, cfg ServiceConfig, logger zerolog.Logger) *Service {
	return &Service{
		router: router,
		cache:  cache,
		logger: logger.With().Str("component", "autoreply").Logger(),
	}
}

// ============================================================
// RULE EVALUATION
// ============================================================

// Rule represents an auto-reply rule
type Rule struct {
	ID          string     `json:"id"`
	UserID      string     `json:"user_id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	IsActive    bool       `json:"is_active"`
	Priority    int        `json:"priority"`
	Conditions  Conditions `json:"conditions"`
	Action      Action     `json:"action"`
	Safeguards  Safeguards `json:"safeguards"`
	Template    string     `json:"template,omitempty"`
	AIPrompt    string     `json:"ai_prompt,omitempty"`
}

// Conditions define when a rule triggers
type Conditions struct {
	// Sender conditions
	FromDomains   []string `json:"from_domains,omitempty"`
	FromAddresses []string `json:"from_addresses,omitempty"`
	ExcludeVIPs   bool     `json:"exclude_vips"`

	// Content conditions
	SubjectContains   []string `json:"subject_contains,omitempty"`
	SubjectNotContains []string `json:"subject_not_contains,omitempty"`
	BodyContains      []string `json:"body_contains,omitempty"`

	// AI-detected conditions
	Intent       []string `json:"intent,omitempty"`       // inquiry, request, etc.
	MinPriority  float64  `json:"min_priority,omitempty"` // 0.0 - 1.0
	MaxPriority  float64  `json:"max_priority,omitempty"`
	Sentiment    []string `json:"sentiment,omitempty"`    // positive, negative, etc.

	// Time conditions
	WorkingHoursOnly bool     `json:"working_hours_only"`
	TimeRange        *TimeRange `json:"time_range,omitempty"`
	DaysOfWeek       []int    `json:"days_of_week,omitempty"` // 0-6, Sunday=0

	// Misc conditions
	HasAttachment *bool `json:"has_attachment,omitempty"`
	IsFirstContact bool `json:"is_first_contact"` // Never received from this sender
}

// TimeRange defines allowed hours
type TimeRange struct {
	Start    string `json:"start"`    // HH:MM format
	End      string `json:"end"`      // HH:MM format
	Timezone string `json:"timezone"` // e.g., "America/New_York"
}

// Action defines what happens when rule triggers
type Action string

const (
	ActionReply   Action = "reply"
	ActionDraft   Action = "draft"
	ActionForward Action = "forward"
	ActionLabel   Action = "label"
	ActionArchive Action = "archive"
	ActionNotify  Action = "notify"
)

// Safeguards prevent auto-reply abuse
type Safeguards struct {
	MaxRepliesPerSender int      `json:"max_replies_per_sender"`
	MaxRepliesPerDay    int      `json:"max_replies_per_day"`
	CooldownMinutes     int      `json:"cooldown_minutes"`
	ExcludeDomains      []string `json:"exclude_domains"`
	ExcludeAddresses    []string `json:"exclude_addresses"`
	RequireApproval     bool     `json:"require_approval"`
	ApprovalTimeoutMin  int      `json:"approval_timeout_min"` // Auto-cancel if not approved
}

// EmailContext contains email data for rule evaluation
type EmailContext struct {
	EmailID        string    `json:"email_id"`
	FromAddress    string    `json:"from_address"`
	FromDomain     string    `json:"from_domain"`
	FromName       string    `json:"from_name"`
	ToAddress      string    `json:"to_address"`
	Subject        string    `json:"subject"`
	Body           string    `json:"body"`
	HasAttachments bool      `json:"has_attachments"`
	ReceivedAt     time.Time `json:"received_at"`

	// AI analysis results
	Intent    string  `json:"intent,omitempty"`
	Priority  float64 `json:"priority,omitempty"`
	Sentiment string  `json:"sentiment,omitempty"`

	// Historical context
	IsFirstContact  bool `json:"is_first_contact"`
	IsVIPSender     bool `json:"is_vip_sender"`
	PreviousReplies int  `json:"previous_replies_today"`
}

// EvaluationResult contains rule evaluation outcome
type EvaluationResult struct {
	Matched       bool     `json:"matched"`
	MatchedRuleID string   `json:"matched_rule_id,omitempty"`
	RuleName      string   `json:"rule_name,omitempty"`
	Action        Action   `json:"action,omitempty"`
	BlockedReason string   `json:"blocked_reason,omitempty"`
	SafeguardHit  string   `json:"safeguard_hit,omitempty"`
	CanProceed    bool     `json:"can_proceed"`
}

// EvaluateRules checks if any rule matches the email
func (s *Service) EvaluateRules(ctx context.Context, email *EmailContext, rules []Rule) (*EvaluationResult, error) {
	// Sort rules by priority (higher first)
	sortedRules := sortRulesByPriority(rules)

	for _, rule := range sortedRules {
		if !rule.IsActive {
			continue
		}

		matched, reason := s.matchesConditions(&rule, email)
		if !matched {
			continue
		}

		// Check safeguards
		blocked, safeguardReason := s.checkSafeguards(ctx, &rule, email)
		if blocked {
			return &EvaluationResult{
				Matched:       true,
				MatchedRuleID: rule.ID,
				RuleName:      rule.Name,
				Action:        rule.Action,
				CanProceed:    false,
				SafeguardHit:  safeguardReason,
			}, nil
		}

		s.logger.Info().
			Str("rule_id", rule.ID).
			Str("rule_name", rule.Name).
			Str("email_id", email.EmailID).
			Str("match_reason", reason).
			Msg("Rule matched")

		return &EvaluationResult{
			Matched:       true,
			MatchedRuleID: rule.ID,
			RuleName:      rule.Name,
			Action:        rule.Action,
			CanProceed:    true,
		}, nil
	}

	return &EvaluationResult{
		Matched:    false,
		CanProceed: false,
	}, nil
}

// matchesConditions checks if email matches rule conditions
func (s *Service) matchesConditions(rule *Rule, email *EmailContext) (bool, string) {
	c := rule.Conditions

	// VIP exclusion
	if c.ExcludeVIPs && email.IsVIPSender {
		return false, ""
	}

	// From domain check
	if len(c.FromDomains) > 0 {
		if !containsIgnoreCase(c.FromDomains, email.FromDomain) {
			return false, ""
		}
	}

	// From address check
	if len(c.FromAddresses) > 0 {
		if !containsIgnoreCase(c.FromAddresses, email.FromAddress) {
			return false, ""
		}
	}

	// Subject contains
	if len(c.SubjectContains) > 0 {
		if !containsAnyIgnoreCase(email.Subject, c.SubjectContains) {
			return false, ""
		}
	}

	// Subject NOT contains
	if len(c.SubjectNotContains) > 0 {
		if containsAnyIgnoreCase(email.Subject, c.SubjectNotContains) {
			return false, ""
		}
	}

	// Body contains
	if len(c.BodyContains) > 0 {
		if !containsAnyIgnoreCase(email.Body, c.BodyContains) {
			return false, ""
		}
	}

	// Intent check
	if len(c.Intent) > 0 && email.Intent != "" {
		if !containsIgnoreCase(c.Intent, email.Intent) {
			return false, ""
		}
	}

	// Priority range
	if c.MinPriority > 0 && email.Priority < c.MinPriority {
		return false, ""
	}
	if c.MaxPriority > 0 && email.Priority > c.MaxPriority {
		return false, ""
	}

	// Sentiment check
	if len(c.Sentiment) > 0 && email.Sentiment != "" {
		if !containsIgnoreCase(c.Sentiment, email.Sentiment) {
			return false, ""
		}
	}

	// Working hours check
	if c.WorkingHoursOnly {
		if !s.isWorkingHours(email.ReceivedAt, c.TimeRange) {
			return false, ""
		}
	}

	// Day of week check
	if len(c.DaysOfWeek) > 0 {
		currentDay := int(email.ReceivedAt.Weekday())
		if !containsInt(c.DaysOfWeek, currentDay) {
			return false, ""
		}
	}

	// Attachment check
	if c.HasAttachment != nil {
		if *c.HasAttachment != email.HasAttachments {
			return false, ""
		}
	}

	// First contact check
	if c.IsFirstContact && !email.IsFirstContact {
		return false, ""
	}

	return true, "all conditions matched"
}

// checkSafeguards verifies safeguards aren't violated
func (s *Service) checkSafeguards(ctx context.Context, rule *Rule, email *EmailContext) (bool, string) {
	sg := rule.Safeguards

	// Check excluded domains
	if containsIgnoreCase(sg.ExcludeDomains, email.FromDomain) {
		return true, "sender domain excluded"
	}

	// Check excluded addresses
	if containsIgnoreCase(sg.ExcludeAddresses, email.FromAddress) {
		return true, "sender address excluded"
	}

	// Check daily limit
	if sg.MaxRepliesPerDay > 0 && email.PreviousReplies >= sg.MaxRepliesPerDay {
		return true, fmt.Sprintf("daily limit reached (%d)", sg.MaxRepliesPerDay)
	}

	// Check per-sender limit (via Redis)
	if s.cache != nil && sg.MaxRepliesPerSender > 0 {
		key := fmt.Sprintf("autoreply:sender:%s:%s", rule.UserID, email.FromAddress)
		count, _ := s.cache.Get(ctx, key).Int()
		if count >= sg.MaxRepliesPerSender {
			return true, fmt.Sprintf("per-sender limit reached (%d)", sg.MaxRepliesPerSender)
		}
	}

	// Check cooldown (via Redis)
	if s.cache != nil && sg.CooldownMinutes > 0 {
		key := fmt.Sprintf("autoreply:cooldown:%s:%s", rule.UserID, email.FromAddress)
		exists, _ := s.cache.Exists(ctx, key).Result()
		if exists > 0 {
			return true, fmt.Sprintf("cooldown active (%d min)", sg.CooldownMinutes)
		}
	}

	return false, ""
}

// RecordReply records an auto-reply for safeguard tracking
func (s *Service) RecordReply(ctx context.Context, userID, senderAddress string, rule *Rule) error {
	if s.cache == nil {
		return nil
	}

	// Increment per-sender counter (24h expiry)
	senderKey := fmt.Sprintf("autoreply:sender:%s:%s", userID, senderAddress)
	s.cache.Incr(ctx, senderKey)
	s.cache.Expire(ctx, senderKey, 24*time.Hour)

	// Set cooldown
	if rule.Safeguards.CooldownMinutes > 0 {
		cooldownKey := fmt.Sprintf("autoreply:cooldown:%s:%s", userID, senderAddress)
		s.cache.Set(ctx, cooldownKey, "1", time.Duration(rule.Safeguards.CooldownMinutes)*time.Minute)
	}

	return nil
}

// isWorkingHours checks if time is within working hours
func (s *Service) isWorkingHours(t time.Time, tr *TimeRange) bool {
	if tr == nil {
		// Default: 9 AM - 6 PM local time
		hour := t.Hour()
		return hour >= 9 && hour < 18
	}

	// Parse time range
	startParts := strings.Split(tr.Start, ":")
	endParts := strings.Split(tr.End, ":")
	if len(startParts) != 2 || len(endParts) != 2 {
		return true // Invalid format, allow
	}

	// Load timezone
	loc := time.Local
	if tr.Timezone != "" {
		if parsed, err := time.LoadLocation(tr.Timezone); err == nil {
			loc = parsed
		}
	}

	localTime := t.In(loc)
	currentMinutes := localTime.Hour()*60 + localTime.Minute()

	startMinutes := parseMinutes(tr.Start)
	endMinutes := parseMinutes(tr.End)

	return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

// ============================================================
// REPLY GENERATION
// ============================================================

// GenerateReplyRequest contains data for generating an auto-reply
type GenerateReplyRequest struct {
	Rule        *Rule        `json:"rule"`
	Email       *EmailContext `json:"email"`
	UserName    string       `json:"user_name"`
	UserEmail   string       `json:"user_email"`
	Signature   string       `json:"signature,omitempty"`
	TonePreference string    `json:"tone_preference,omitempty"`
}

// GenerateReplyResponse contains the generated reply
type GenerateReplyResponse struct {
	Content      string `json:"content"`
	Subject      string `json:"subject"` // Re: original subject
	ToAddress    string `json:"to_address"`
	RuleID       string `json:"rule_id"`
	RuleName     string `json:"rule_name"`
	Model        string `json:"model"`
	Provider     string `json:"provider"`
	NeedsApproval bool  `json:"needs_approval"`
	LatencyMs    int64  `json:"latency_ms"`
}

// GenerateReply generates an auto-reply based on rule
func (s *Service) GenerateReply(ctx context.Context, req *GenerateReplyRequest) (*GenerateReplyResponse, error) {
	start := time.Now()

	var content string
	var err error

	if req.Rule.Template != "" {
		// Use template with placeholders
		content = s.expandTemplate(req.Rule.Template, req)
	} else if req.Rule.AIPrompt != "" {
		// Generate with AI
		content, err = s.generateAIReply(ctx, req)
		if err != nil {
			return nil, fmt.Errorf("failed to generate AI reply: %w", err)
		}
	} else {
		return nil, fmt.Errorf("rule has no template or AI prompt")
	}

	// Append signature
	if req.Signature != "" {
		content = content + "\n\n" + req.Signature
	}

	// Determine subject
	subject := req.Email.Subject
	if !strings.HasPrefix(strings.ToLower(subject), "re:") {
		subject = "Re: " + subject
	}

	resp := &GenerateReplyResponse{
		Content:       content,
		Subject:       subject,
		ToAddress:     req.Email.FromAddress,
		RuleID:        req.Rule.ID,
		RuleName:      req.Rule.Name,
		Model:         "template",
		Provider:      "local",
		NeedsApproval: req.Rule.Safeguards.RequireApproval,
		LatencyMs:     time.Since(start).Milliseconds(),
	}

	return resp, nil
}

// expandTemplate replaces placeholders in template
func (s *Service) expandTemplate(template string, req *GenerateReplyRequest) string {
	replacements := map[string]string{
		"{{sender_name}}":    req.Email.FromName,
		"{{sender_email}}":   req.Email.FromAddress,
		"{{subject}}":        req.Email.Subject,
		"{{user_name}}":      req.UserName,
		"{{user_email}}":     req.UserEmail,
		"{{date}}":           time.Now().Format("January 2, 2006"),
		"{{time}}":           time.Now().Format("3:04 PM"),
	}

	result := template
	for placeholder, value := range replacements {
		result = strings.ReplaceAll(result, placeholder, value)
	}

	return result
}

// generateAIReply generates reply using AI
func (s *Service) generateAIReply(ctx context.Context, req *GenerateReplyRequest) (string, error) {
	systemPrompt := fmt.Sprintf(`You are an email assistant generating auto-replies.
Follow these instructions: %s

Guidelines:
- Be professional and helpful
- Keep the response concise
- Address the main points of the incoming email
- Don't make promises you can't keep
- Sign as: %s`, req.Rule.AIPrompt, req.UserName)

	userPrompt := fmt.Sprintf(`Generate a reply to this email:

From: %s <%s>
Subject: %s
Body:
%s

Generate only the reply body, no subject line.`,
		req.Email.FromName, req.Email.FromAddress,
		req.Email.Subject, truncateText(req.Email.Body, 2000))

	completionReq := &provider.CompletionRequest{
		Messages: []provider.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		MaxTokens:   500,
		Temperature: 0.5,
	}

	result, err := s.router.CompleteWithFallback(ctx, completionReq, "auto_reply")
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(result.Content), nil
}

// ============================================================
// AUDIT LOG
// ============================================================

// AuditEntry represents an auto-reply audit log entry
type AuditEntry struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	RuleID         string    `json:"rule_id"`
	RuleName       string    `json:"rule_name"`
	EmailID        string    `json:"email_id"`
	FromAddress    string    `json:"from_address"`
	Action         Action    `json:"action"`
	GeneratedReply string    `json:"generated_reply,omitempty"`
	WasSent        bool      `json:"was_sent"`
	RequiredReview bool      `json:"required_review"`
	WasApproved    *bool     `json:"was_approved,omitempty"`
	ErrorMessage   string    `json:"error_message,omitempty"`
	ProcessingMs   int64     `json:"processing_ms"`
	CreatedAt      time.Time `json:"created_at"`
}

// GetAuditLog retrieves audit log entries for a user
func (s *Service) GetAuditLog(ctx context.Context, userID string, limit int, offset int) ([]AuditEntry, error) {
	// This would typically query the database
	// For now, return empty slice - actual implementation depends on DB layer
	return []AuditEntry{}, nil
}

// GetDailyStats returns daily auto-reply statistics
func (s *Service) GetDailyStats(ctx context.Context, userID string) (map[string]interface{}, error) {
	stats := map[string]interface{}{
		"user_id":      userID,
		"date":         time.Now().Format("2006-01-02"),
		"total_sent":   0,
		"total_drafted": 0,
		"total_blocked": 0,
	}

	if s.cache != nil {
		// Get counts from Redis
		sentKey := fmt.Sprintf("autoreply:stats:%s:sent:%s", userID, time.Now().Format("2006-01-02"))
		draftKey := fmt.Sprintf("autoreply:stats:%s:draft:%s", userID, time.Now().Format("2006-01-02"))
		blockedKey := fmt.Sprintf("autoreply:stats:%s:blocked:%s", userID, time.Now().Format("2006-01-02"))

		if sent, err := s.cache.Get(ctx, sentKey).Int(); err == nil {
			stats["total_sent"] = sent
		}
		if draft, err := s.cache.Get(ctx, draftKey).Int(); err == nil {
			stats["total_drafted"] = draft
		}
		if blocked, err := s.cache.Get(ctx, blockedKey).Int(); err == nil {
			stats["total_blocked"] = blocked
		}
	}

	return stats, nil
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

func sortRulesByPriority(rules []Rule) []Rule {
	// Simple bubble sort for small arrays
	sorted := make([]Rule, len(rules))
	copy(sorted, rules)
	for i := 0; i < len(sorted)-1; i++ {
		for j := 0; j < len(sorted)-i-1; j++ {
			if sorted[j].Priority < sorted[j+1].Priority {
				sorted[j], sorted[j+1] = sorted[j+1], sorted[j]
			}
		}
	}
	return sorted
}

func containsIgnoreCase(slice []string, item string) bool {
	itemLower := strings.ToLower(item)
	for _, s := range slice {
		if strings.ToLower(s) == itemLower {
			return true
		}
	}
	return false
}

func containsAnyIgnoreCase(text string, items []string) bool {
	textLower := strings.ToLower(text)
	for _, item := range items {
		if strings.Contains(textLower, strings.ToLower(item)) {
			return true
		}
	}
	return false
}

func containsInt(slice []int, item int) bool {
	for _, v := range slice {
		if v == item {
			return true
		}
	}
	return false
}

func parseMinutes(timeStr string) int {
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		return 0
	}
	var hours, mins int
	fmt.Sscanf(parts[0], "%d", &hours)
	fmt.Sscanf(parts[1], "%d", &mins)
	return hours*60 + mins
}

func truncateText(text string, maxLen int) string {
	if len(text) <= maxLen {
		return text
	}
	return text[:maxLen] + "..."
}

// ValidateRule validates an auto-reply rule
func ValidateRule(rule *Rule) []string {
	var errors []string

	if rule.Name == "" {
		errors = append(errors, "rule name is required")
	}

	if rule.Action == "" {
		errors = append(errors, "action is required")
	}

	if rule.Action == ActionReply || rule.Action == ActionDraft {
		if rule.Template == "" && rule.AIPrompt == "" {
			errors = append(errors, "template or AI prompt required for reply/draft action")
		}
	}

	// Validate email patterns
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	for _, addr := range rule.Conditions.FromAddresses {
		if !emailRegex.MatchString(addr) {
			errors = append(errors, fmt.Sprintf("invalid email address: %s", addr))
		}
	}

	// Validate safeguards
	if rule.Safeguards.MaxRepliesPerDay > 1000 {
		errors = append(errors, "max replies per day cannot exceed 1000")
	}

	if rule.Safeguards.CooldownMinutes < 0 {
		errors = append(errors, "cooldown minutes cannot be negative")
	}

	return errors
}
