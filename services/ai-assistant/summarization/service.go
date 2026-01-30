package summarization

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/rs/zerolog"

	"github.com/enterprise-email/ai-assistant/provider"
)

// Service handles email summarization
type Service struct {
	router         *provider.Router
	cache          *redis.Client
	cacheTTL       time.Duration
	tldrThreshold  int // Characters before TL;DR kicks in
	logger         zerolog.Logger
}

// ServiceConfig contains summarization service configuration
type ServiceConfig struct {
	CacheTTL      time.Duration
	TLDRThreshold int // Default: 500 characters
}

// NewService creates a new summarization service
func NewService(router *provider.Router, cache *redis.Client, cfg ServiceConfig, logger zerolog.Logger) *Service {
	threshold := cfg.TLDRThreshold
	if threshold <= 0 {
		threshold = 500
	}
	return &Service{
		router:        router,
		cache:         cache,
		cacheTTL:      cfg.CacheTTL,
		tldrThreshold: threshold,
		logger:        logger.With().Str("component", "summarization").Logger(),
	}
}

// ============================================================
// SINGLE EMAIL SUMMARY
// ============================================================

// EmailSummaryRequest contains data for email summarization
type EmailSummaryRequest struct {
	EmailID     string `json:"email_id"`
	Subject     string `json:"subject"`
	Body        string `json:"body"`
	FromAddress string `json:"from_address"`
	FromName    string `json:"from_name"`
	Date        string `json:"date"`
	UserID      string `json:"user_id"`
	OrgID       string `json:"org_id"`
	SkipCache   bool   `json:"skip_cache"`
}

// EmailSummaryResponse contains summarization result
type EmailSummaryResponse struct {
	EmailID     string       `json:"email_id"`
	Summary     string       `json:"summary"`       // 1-2 sentence summary
	TLDR        string       `json:"tldr"`          // One-liner for long emails
	ActionItems []ActionItem `json:"action_items"`  // Extracted todos
	KeyPoints   []string     `json:"key_points"`    // Bullet points
	Sentiment   string       `json:"sentiment"`     // positive/neutral/negative
	NeedsTLDR   bool         `json:"needs_tldr"`    // Original was long
	Model       string       `json:"model"`
	Provider    string       `json:"provider"`
	Cached      bool         `json:"cached"`
	LatencyMs   int64        `json:"latency_ms"`
}

// ActionItem represents an extracted action item
type ActionItem struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	DueDate     string `json:"due_date,omitempty"`
	Priority    string `json:"priority"` // high/medium/low
	Assignee    string `json:"assignee,omitempty"`
}

// SummarizeEmail generates a summary for a single email
func (s *Service) SummarizeEmail(ctx context.Context, req *EmailSummaryRequest) (*EmailSummaryResponse, error) {
	start := time.Now()

	// Check if TL;DR is needed
	needsTLDR := len(req.Body) > s.tldrThreshold

	// Check cache
	cacheKey := s.generateCacheKey("email", req.EmailID, req.Body)
	if !req.SkipCache && s.cache != nil {
		if cached, err := s.getCachedResponse(ctx, cacheKey); err == nil && cached != nil {
			cached.Cached = true
			cached.LatencyMs = time.Since(start).Milliseconds()
			return cached, nil
		}
	}

	// Build prompt
	systemPrompt := `You are an expert email summarizer. Analyze the email and provide:
1. A brief 1-2 sentence summary
2. A one-line TL;DR (max 100 characters)
3. Key points as bullet items (max 5)
4. Any action items with priority (high/medium/low) and due dates if mentioned
5. Overall sentiment (positive/neutral/negative)

Output as JSON:
{
  "summary": "Brief summary...",
  "tldr": "One-liner...",
  "key_points": ["Point 1", "Point 2"],
  "action_items": [{"description": "Task...", "priority": "high", "due_date": "2024-01-15"}],
  "sentiment": "neutral"
}`

	userPrompt := fmt.Sprintf(`Summarize this email:

From: %s <%s>
Subject: %s
Date: %s

%s`, req.FromName, req.FromAddress, req.Subject, req.Date, truncateText(req.Body, 4000))

	completionReq := &provider.CompletionRequest{
		Messages: []provider.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		MaxTokens:   800,
		Temperature: 0.3, // Low temperature for factual summarization
	}

	result, err := s.router.CompleteWithFallback(ctx, completionReq)
	if err != nil {
		return nil, fmt.Errorf("failed to generate summary: %w", err)
	}

	// Parse response
	response, err := s.parseEmailSummaryResponse(result.Content, req.EmailID)
	if err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	response.NeedsTLDR = needsTLDR
	response.Model = result.Model
	response.Provider = result.Provider
	response.Cached = false
	response.LatencyMs = time.Since(start).Milliseconds()

	// Cache response
	if s.cache != nil && !req.SkipCache {
		go s.cacheResponse(context.Background(), cacheKey, response)
	}

	return response, nil
}

// parseEmailSummaryResponse parses LLM response for email summary
func (s *Service) parseEmailSummaryResponse(content string, emailID string) (*EmailSummaryResponse, error) {
	jsonStr := extractJSON(content)
	if jsonStr == "" {
		// Fallback: use raw content as summary
		return &EmailSummaryResponse{
			EmailID:     emailID,
			Summary:     content,
			TLDR:        truncateText(content, 100),
			ActionItems: []ActionItem{},
			KeyPoints:   []string{},
			Sentiment:   "neutral",
		}, nil
	}

	var parsed struct {
		Summary     string `json:"summary"`
		TLDR        string `json:"tldr"`
		KeyPoints   []string `json:"key_points"`
		ActionItems []struct {
			Description string `json:"description"`
			Priority    string `json:"priority"`
			DueDate     string `json:"due_date"`
		} `json:"action_items"`
		Sentiment string `json:"sentiment"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return nil, err
	}

	// Convert action items
	actionItems := make([]ActionItem, len(parsed.ActionItems))
	for i, item := range parsed.ActionItems {
		actionItems[i] = ActionItem{
			ID:          fmt.Sprintf("%s-action-%d", emailID, i+1),
			Description: item.Description,
			Priority:    item.Priority,
			DueDate:     item.DueDate,
		}
	}

	return &EmailSummaryResponse{
		EmailID:     emailID,
		Summary:     parsed.Summary,
		TLDR:        parsed.TLDR,
		KeyPoints:   parsed.KeyPoints,
		ActionItems: actionItems,
		Sentiment:   parsed.Sentiment,
	}, nil
}

// ============================================================
// THREAD SUMMARY
// ============================================================

// ThreadSummaryRequest contains data for thread summarization
type ThreadSummaryRequest struct {
	ThreadID string           `json:"thread_id"`
	Subject  string           `json:"subject"`
	Messages []ThreadMessage  `json:"messages"`
	UserID   string           `json:"user_id"`
	OrgID    string           `json:"org_id"`
	SkipCache bool            `json:"skip_cache"`
}

// ThreadMessage represents a message in the thread
type ThreadMessage struct {
	ID          string `json:"id"`
	FromAddress string `json:"from_address"`
	FromName    string `json:"from_name"`
	Body        string `json:"body"`
	Date        string `json:"date"`
	IsFromUser  bool   `json:"is_from_user"`
}

// ThreadSummaryResponse contains thread summary result
type ThreadSummaryResponse struct {
	ThreadID       string       `json:"thread_id"`
	Summary        string       `json:"summary"`        // Overall thread summary
	Participants   []string     `json:"participants"`   // People in the thread
	MessageCount   int          `json:"message_count"`
	KeyDecisions   []string     `json:"key_decisions"`  // Decisions made
	OpenQuestions  []string     `json:"open_questions"` // Unresolved questions
	ActionItems    []ActionItem `json:"action_items"`
	Timeline       []TimelineEvent `json:"timeline"`    // Key events
	CurrentStatus  string       `json:"current_status"` // ongoing/resolved/pending
	Model          string       `json:"model"`
	Provider       string       `json:"provider"`
	Cached         bool         `json:"cached"`
	LatencyMs      int64        `json:"latency_ms"`
}

// TimelineEvent represents a key event in thread timeline
type TimelineEvent struct {
	Date        string `json:"date"`
	Description string `json:"description"`
	Actor       string `json:"actor"`
}

// SummarizeThread generates a summary for an email thread
func (s *Service) SummarizeThread(ctx context.Context, req *ThreadSummaryRequest) (*ThreadSummaryResponse, error) {
	start := time.Now()

	// Build content hash for caching
	var contentBuilder strings.Builder
	for _, msg := range req.Messages {
		contentBuilder.WriteString(msg.ID)
		contentBuilder.WriteString(msg.Body)
	}

	cacheKey := s.generateCacheKey("thread", req.ThreadID, contentBuilder.String())
	if !req.SkipCache && s.cache != nil {
		if cached, err := s.getCachedThreadResponse(ctx, cacheKey); err == nil && cached != nil {
			cached.Cached = true
			cached.LatencyMs = time.Since(start).Milliseconds()
			return cached, nil
		}
	}

	// Extract participants
	participantMap := make(map[string]bool)
	for _, msg := range req.Messages {
		participantMap[msg.FromName] = true
	}
	participants := make([]string, 0, len(participantMap))
	for p := range participantMap {
		participants = append(participants, p)
	}

	// Build prompt
	systemPrompt := `You are an expert at summarizing email threads. Analyze the conversation and provide:
1. A comprehensive summary of the entire thread (2-3 sentences)
2. Key decisions that were made
3. Questions that remain open/unanswered
4. Action items with assignees if clear
5. A timeline of key events
6. Current status (ongoing/resolved/pending)

Output as JSON:
{
  "summary": "Thread summary...",
  "key_decisions": ["Decision 1", "Decision 2"],
  "open_questions": ["Question 1"],
  "action_items": [{"description": "Task...", "priority": "high", "assignee": "John"}],
  "timeline": [{"date": "Jan 15", "description": "Event...", "actor": "John"}],
  "current_status": "ongoing"
}`

	// Build conversation context
	var convoBuilder strings.Builder
	convoBuilder.WriteString(fmt.Sprintf("Subject: %s\n\n", req.Subject))
	convoBuilder.WriteString("=== Conversation Thread ===\n\n")

	for i, msg := range req.Messages {
		direction := "→" // Incoming
		if msg.IsFromUser {
			direction = "←" // Outgoing
		}
		convoBuilder.WriteString(fmt.Sprintf("[%d] %s %s (%s):\n%s\n\n",
			i+1, direction, msg.FromName, msg.Date, truncateText(msg.Body, 800)))
	}

	completionReq := &provider.CompletionRequest{
		Messages: []provider.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: convoBuilder.String()},
		},
		MaxTokens:   1200,
		Temperature: 0.3,
	}

	result, err := s.router.CompleteWithFallback(ctx, completionReq)
	if err != nil {
		return nil, fmt.Errorf("failed to generate thread summary: %w", err)
	}

	// Parse response
	response, err := s.parseThreadSummaryResponse(result.Content, req.ThreadID)
	if err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	response.Participants = participants
	response.MessageCount = len(req.Messages)
	response.Model = result.Model
	response.Provider = result.Provider
	response.Cached = false
	response.LatencyMs = time.Since(start).Milliseconds()

	// Cache response
	if s.cache != nil && !req.SkipCache {
		go s.cacheThreadResponse(context.Background(), cacheKey, response)
	}

	return response, nil
}

// parseThreadSummaryResponse parses LLM response for thread summary
func (s *Service) parseThreadSummaryResponse(content string, threadID string) (*ThreadSummaryResponse, error) {
	jsonStr := extractJSON(content)
	if jsonStr == "" {
		return &ThreadSummaryResponse{
			ThreadID:      threadID,
			Summary:       content,
			CurrentStatus: "unknown",
		}, nil
	}

	var parsed struct {
		Summary       string `json:"summary"`
		KeyDecisions  []string `json:"key_decisions"`
		OpenQuestions []string `json:"open_questions"`
		ActionItems   []struct {
			Description string `json:"description"`
			Priority    string `json:"priority"`
			Assignee    string `json:"assignee"`
		} `json:"action_items"`
		Timeline []struct {
			Date        string `json:"date"`
			Description string `json:"description"`
			Actor       string `json:"actor"`
		} `json:"timeline"`
		CurrentStatus string `json:"current_status"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return nil, err
	}

	// Convert action items
	actionItems := make([]ActionItem, len(parsed.ActionItems))
	for i, item := range parsed.ActionItems {
		actionItems[i] = ActionItem{
			ID:          fmt.Sprintf("%s-action-%d", threadID, i+1),
			Description: item.Description,
			Priority:    item.Priority,
			Assignee:    item.Assignee,
		}
	}

	// Convert timeline
	timeline := make([]TimelineEvent, len(parsed.Timeline))
	for i, event := range parsed.Timeline {
		timeline[i] = TimelineEvent{
			Date:        event.Date,
			Description: event.Description,
			Actor:       event.Actor,
		}
	}

	return &ThreadSummaryResponse{
		ThreadID:      threadID,
		Summary:       parsed.Summary,
		KeyDecisions:  parsed.KeyDecisions,
		OpenQuestions: parsed.OpenQuestions,
		ActionItems:   actionItems,
		Timeline:      timeline,
		CurrentStatus: parsed.CurrentStatus,
	}, nil
}

// ============================================================
// DAILY INBOX SUMMARY
// ============================================================

// DailySummaryRequest contains data for daily summary
type DailySummaryRequest struct {
	UserID    string         `json:"user_id"`
	OrgID     string         `json:"org_id"`
	Date      string         `json:"date"` // YYYY-MM-DD format
	Emails    []EmailDigest  `json:"emails"`
	SkipCache bool           `json:"skip_cache"`
}

// EmailDigest contains minimal email data for daily summary
type EmailDigest struct {
	ID          string  `json:"id"`
	Subject     string  `json:"subject"`
	FromName    string  `json:"from_name"`
	FromAddress string  `json:"from_address"`
	Preview     string  `json:"preview"` // First ~200 chars
	Priority    float64 `json:"priority"`
	Sentiment   string  `json:"sentiment"`
	HasAction   bool    `json:"has_action"`
	ReceivedAt  string  `json:"received_at"`
}

// DailySummaryResponse contains daily inbox summary
type DailySummaryResponse struct {
	UserID          string           `json:"user_id"`
	Date            string           `json:"date"`
	TotalEmails     int              `json:"total_emails"`
	UnreadCount     int              `json:"unread_count"`
	Summary         string           `json:"summary"`         // Overall day summary
	HighPriority    []EmailHighlight `json:"high_priority"`   // Urgent items
	ActionRequired  []EmailHighlight `json:"action_required"` // Need response
	KeyTopics       []TopicCluster   `json:"key_topics"`      // Grouped by topic
	SenderBreakdown []SenderSummary  `json:"sender_breakdown"`
	Recommendations []string         `json:"recommendations"` // Suggested actions
	Model           string           `json:"model"`
	Provider        string           `json:"provider"`
	LatencyMs       int64            `json:"latency_ms"`
}

// EmailHighlight represents a highlighted email
type EmailHighlight struct {
	EmailID   string `json:"email_id"`
	Subject   string `json:"subject"`
	FromName  string `json:"from_name"`
	Reason    string `json:"reason"`    // Why it's highlighted
	Urgency   string `json:"urgency"`   // high/medium/low
	ActionTip string `json:"action_tip"`
}

// TopicCluster represents emails grouped by topic
type TopicCluster struct {
	Topic     string   `json:"topic"`
	Count     int      `json:"count"`
	EmailIDs  []string `json:"email_ids"`
	Summary   string   `json:"summary"`
}

// SenderSummary represents emails from a sender
type SenderSummary struct {
	Name      string `json:"name"`
	Email     string `json:"email"`
	Count     int    `json:"count"`
	Important bool   `json:"important"`
}

// GenerateDailySummary creates a daily inbox summary
func (s *Service) GenerateDailySummary(ctx context.Context, req *DailySummaryRequest) (*DailySummaryResponse, error) {
	start := time.Now()

	if len(req.Emails) == 0 {
		return &DailySummaryResponse{
			UserID:      req.UserID,
			Date:        req.Date,
			TotalEmails: 0,
			Summary:     "No emails received today.",
			LatencyMs:   time.Since(start).Milliseconds(),
		}, nil
	}

	// Build sender breakdown
	senderMap := make(map[string]*SenderSummary)
	var highPriorityEmails []EmailDigest
	var actionEmails []EmailDigest

	for _, email := range req.Emails {
		// Track senders
		key := email.FromAddress
		if _, exists := senderMap[key]; !exists {
			senderMap[key] = &SenderSummary{
				Name:  email.FromName,
				Email: email.FromAddress,
			}
		}
		senderMap[key].Count++

		// Identify high priority
		if email.Priority >= 0.7 {
			highPriorityEmails = append(highPriorityEmails, email)
			senderMap[key].Important = true
		}

		// Identify action required
		if email.HasAction {
			actionEmails = append(actionEmails, email)
		}
	}

	// Convert sender map to slice
	senderBreakdown := make([]SenderSummary, 0, len(senderMap))
	for _, s := range senderMap {
		senderBreakdown = append(senderBreakdown, *s)
	}

	// Build prompt for AI summary
	systemPrompt := `You are an executive assistant summarizing a day's emails. Provide:
1. A concise overview of the day's email activity (2-3 sentences)
2. Group emails by topic/theme
3. Actionable recommendations for the user

Output as JSON:
{
  "summary": "Today you received...",
  "topics": [{"topic": "Project X", "summary": "3 emails about...", "email_ids": ["id1", "id2"]}],
  "recommendations": ["Reply to urgent request from...", "Review proposal by..."]
}`

	// Build email list for prompt
	var emailList strings.Builder
	emailList.WriteString(fmt.Sprintf("Date: %s\nTotal Emails: %d\n\n", req.Date, len(req.Emails)))
	for i, email := range req.Emails {
		if i >= 50 {
			emailList.WriteString(fmt.Sprintf("... and %d more emails\n", len(req.Emails)-50))
			break
		}
		priority := "normal"
		if email.Priority >= 0.7 {
			priority = "HIGH"
		} else if email.Priority >= 0.4 {
			priority = "medium"
		}
		emailList.WriteString(fmt.Sprintf("[%s] From: %s - %s\n   Preview: %s\n\n",
			priority, email.FromName, email.Subject, truncateText(email.Preview, 100)))
	}

	completionReq := &provider.CompletionRequest{
		Messages: []provider.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: emailList.String()},
		},
		MaxTokens:   1000,
		Temperature: 0.4,
	}

	result, err := s.router.CompleteWithFallback(ctx, completionReq)
	if err != nil {
		// Return basic summary on AI failure
		return &DailySummaryResponse{
			UserID:          req.UserID,
			Date:            req.Date,
			TotalEmails:     len(req.Emails),
			Summary:         fmt.Sprintf("You received %d emails today.", len(req.Emails)),
			SenderBreakdown: senderBreakdown,
			Model:           "fallback",
			Provider:        "local",
			LatencyMs:       time.Since(start).Milliseconds(),
		}, nil
	}

	// Parse AI response
	response := s.parseDailySummaryResponse(result.Content, req)
	response.TotalEmails = len(req.Emails)
	response.SenderBreakdown = senderBreakdown
	response.Model = result.Model
	response.Provider = result.Provider
	response.LatencyMs = time.Since(start).Milliseconds()

	// Add high priority highlights
	for _, email := range highPriorityEmails {
		response.HighPriority = append(response.HighPriority, EmailHighlight{
			EmailID:  email.ID,
			Subject:  email.Subject,
			FromName: email.FromName,
			Reason:   "High priority based on content analysis",
			Urgency:  "high",
		})
	}

	// Add action required highlights
	for _, email := range actionEmails {
		response.ActionRequired = append(response.ActionRequired, EmailHighlight{
			EmailID:  email.ID,
			Subject:  email.Subject,
			FromName: email.FromName,
			Reason:   "Contains action items",
			Urgency:  "medium",
		})
	}

	return response, nil
}

// parseDailySummaryResponse parses AI response
func (s *Service) parseDailySummaryResponse(content string, req *DailySummaryRequest) *DailySummaryResponse {
	response := &DailySummaryResponse{
		UserID: req.UserID,
		Date:   req.Date,
	}

	jsonStr := extractJSON(content)
	if jsonStr == "" {
		response.Summary = content
		return response
	}

	var parsed struct {
		Summary         string `json:"summary"`
		Topics          []struct {
			Topic    string   `json:"topic"`
			Summary  string   `json:"summary"`
			EmailIDs []string `json:"email_ids"`
		} `json:"topics"`
		Recommendations []string `json:"recommendations"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		response.Summary = content
		return response
	}

	response.Summary = parsed.Summary
	response.Recommendations = parsed.Recommendations

	for _, topic := range parsed.Topics {
		response.KeyTopics = append(response.KeyTopics, TopicCluster{
			Topic:    topic.Topic,
			Count:    len(topic.EmailIDs),
			EmailIDs: topic.EmailIDs,
			Summary:  topic.Summary,
		})
	}

	return response
}

// ============================================================
// CACHING HELPERS
// ============================================================

func (s *Service) generateCacheKey(prefix, id, content string) string {
	hasher := sha256.New()
	hasher.Write([]byte(content))
	hash := hex.EncodeToString(hasher.Sum(nil))[:16]
	return fmt.Sprintf("summary:%s:%s:%s", prefix, id, hash)
}

func (s *Service) getCachedResponse(ctx context.Context, key string) (*EmailSummaryResponse, error) {
	data, err := s.cache.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}
	var resp EmailSummaryResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (s *Service) cacheResponse(ctx context.Context, key string, resp *EmailSummaryResponse) {
	data, err := json.Marshal(resp)
	if err != nil {
		return
	}
	s.cache.Set(ctx, key, data, s.cacheTTL)
}

func (s *Service) getCachedThreadResponse(ctx context.Context, key string) (*ThreadSummaryResponse, error) {
	data, err := s.cache.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}
	var resp ThreadSummaryResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (s *Service) cacheThreadResponse(ctx context.Context, key string, resp *ThreadSummaryResponse) {
	data, err := json.Marshal(resp)
	if err != nil {
		return
	}
	s.cache.Set(ctx, key, data, s.cacheTTL)
}

// InvalidateCache invalidates cache for an email/thread
func (s *Service) InvalidateCache(ctx context.Context, prefix, id string) error {
	if s.cache == nil {
		return nil
	}
	pattern := fmt.Sprintf("summary:%s:%s:*", prefix, id)
	iter := s.cache.Scan(ctx, 0, pattern, 100).Iterator()
	for iter.Next(ctx) {
		s.cache.Del(ctx, iter.Val())
	}
	return iter.Err()
}

// Helper functions

func truncateText(text string, maxLen int) string {
	if len(text) <= maxLen {
		return text
	}
	return text[:maxLen] + "..."
}

func extractJSON(content string) string {
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start == -1 || end == -1 || end <= start {
		return ""
	}
	return content[start : end+1]
}
