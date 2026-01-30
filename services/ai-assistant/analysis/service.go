package analysis

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

// Service handles email analysis
type Service struct {
	router      *provider.Router
	cache       *redis.Client
	cacheTTL    time.Duration
	maxBodyLen  int
	logger      zerolog.Logger
}

// ServiceConfig contains analysis service configuration
type ServiceConfig struct {
	CacheTTL   time.Duration
	MaxBodyLen int
}

// NewService creates a new analysis service
func NewService(router *provider.Router, cache *redis.Client, cfg ServiceConfig, logger zerolog.Logger) *Service {
	return &Service{
		router:     router,
		cache:      cache,
		cacheTTL:   cfg.CacheTTL,
		maxBodyLen: cfg.MaxBodyLen,
		logger:     logger.With().Str("component", "analysis").Logger(),
	}
}

// AnalysisRequest represents an email analysis request
type AnalysisRequest struct {
	// Email content
	EmailID     string   `json:"email_id"`
	Subject     string   `json:"subject"`
	Body        string   `json:"body"`
	FromAddress string   `json:"from_address"`
	FromName    string   `json:"from_name"`
	ToAddresses []string `json:"to_addresses"`
	CcAddresses []string `json:"cc_addresses"`
	Date        string   `json:"date"`
	HasAttachments bool  `json:"has_attachments"`

	// User context
	UserID    string `json:"user_id"`
	OrgID     string `json:"org_id"`
	UserName  string `json:"user_name"`
	UserEmail string `json:"user_email"`

	// Analysis options
	ExtractActionItems bool `json:"extract_action_items"`
	DetectQuestions    bool `json:"detect_questions"`
	SkipCache          bool `json:"skip_cache"`
}

// AnalysisResponse represents the analysis result
type AnalysisResponse struct {
	// Basic analysis
	Summary   string  `json:"summary"`
	Sentiment string  `json:"sentiment"` // positive, neutral, negative, mixed
	Priority  float64 `json:"priority"`  // 0.0 - 1.0

	// Intent detection
	Intent   string `json:"intent"`   // inquiry, request, complaint, feedback, etc.
	Category string `json:"category"` // auto-detected category

	// Action extraction
	ActionItems []ActionItem `json:"action_items,omitempty"`

	// Question detection
	QuestionsAsked []string `json:"questions_asked,omitempty"`

	// Response analysis
	RequiresResponse  bool       `json:"requires_response"`
	SuggestedDeadline *time.Time `json:"suggested_deadline,omitempty"`

	// Topics
	Topics []string `json:"topics,omitempty"`

	// Metadata
	Model      string `json:"model"`
	Provider   string `json:"provider"`
	Confidence float64 `json:"confidence"`
	Cached     bool   `json:"cached"`
	LatencyMs  int64  `json:"latency_ms"`
}

// ActionItem represents an extracted action item
type ActionItem struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	DueDate     string `json:"due_date,omitempty"`
	Priority    string `json:"priority"` // low, medium, high
	Assignee    string `json:"assignee,omitempty"`
}

// Analyze performs email analysis
func (s *Service) Analyze(ctx context.Context, req *AnalysisRequest) (*AnalysisResponse, error) {
	start := time.Now()

	// Generate cache key
	cacheKey := s.generateCacheKey(req)

	// Check cache unless explicitly skipped
	if !req.SkipCache {
		if cached, err := s.getFromCache(ctx, cacheKey); err == nil {
			cached.Cached = true
			cached.LatencyMs = time.Since(start).Milliseconds()
			return cached, nil
		}
	}

	// Truncate body if needed
	body := req.Body
	if len(body) > s.maxBodyLen {
		body = body[:s.maxBodyLen] + "\n...[truncated]"
	}

	// Build the prompt
	prompt := s.buildAnalysisPrompt(req, body)

	// Create completion request
	compReq := &provider.CompletionRequest{
		SystemPrompt: analysisSystemPrompt,
		Messages: []provider.Message{
			{Role: provider.RoleUser, Content: prompt},
		},
		MaxTokens:   2000,
		Temperature: 0.2,
		Metadata: provider.RequestMetadata{
			OrgID:   req.OrgID,
			UserID:  req.UserID,
			EmailID: req.EmailID,
			Feature: "analysis",
		},
	}

	// Get completion with fallback
	compResp, err := s.router.CompleteWithFallback(ctx, compReq, "analysis")
	if err != nil {
		return nil, fmt.Errorf("failed to analyze email: %w", err)
	}

	// Parse response
	result, err := s.parseAnalysisResponse(compResp.Content)
	if err != nil {
		s.logger.Warn().Err(err).Msg("Failed to parse analysis response, using fallback")
		result = s.createFallbackResponse(req)
	}

	// Add metadata
	result.Model = compResp.Model
	result.Provider = compResp.Provider
	result.Cached = false
	result.LatencyMs = time.Since(start).Milliseconds()

	// Cache result
	if err := s.setInCache(ctx, cacheKey, result); err != nil {
		s.logger.Warn().Err(err).Msg("Failed to cache analysis result")
	}

	return result, nil
}

// buildAnalysisPrompt creates the analysis prompt
func (s *Service) buildAnalysisPrompt(req *AnalysisRequest, body string) string {
	var sb strings.Builder

	sb.WriteString("Analyze the following email and provide structured analysis.\n\n")
	sb.WriteString("EMAIL METADATA:\n")
	sb.WriteString(fmt.Sprintf("From: %s <%s>\n", req.FromName, req.FromAddress))
	sb.WriteString(fmt.Sprintf("To: %s\n", strings.Join(req.ToAddresses, ", ")))
	if len(req.CcAddresses) > 0 {
		sb.WriteString(fmt.Sprintf("CC: %s\n", strings.Join(req.CcAddresses, ", ")))
	}
	sb.WriteString(fmt.Sprintf("Date: %s\n", req.Date))
	sb.WriteString(fmt.Sprintf("Subject: %s\n", req.Subject))
	if req.HasAttachments {
		sb.WriteString("Has Attachments: Yes\n")
	}
	sb.WriteString(fmt.Sprintf("\nRecipient context: %s <%s>\n", req.UserName, req.UserEmail))
	sb.WriteString("\nEMAIL BODY:\n")
	sb.WriteString(body)
	sb.WriteString("\n\n")

	sb.WriteString("Provide analysis in the following JSON format:\n")
	sb.WriteString(`{
  "summary": "2-3 sentence summary of the email",
  "sentiment": "positive|neutral|negative|mixed",
  "priority": 0.0-1.0,
  "intent": "inquiry|request|complaint|feedback|scheduling|follow_up|introduction|notification|promotion|other",
  "category": "auto-detected category",
  "requires_response": true|false,
  "suggested_deadline": "ISO date or null",
  "topics": ["topic1", "topic2"],
  "confidence": 0.0-1.0`)

	if req.ExtractActionItems {
		sb.WriteString(`,
  "action_items": [
    {"id": "1", "description": "action description", "priority": "low|medium|high", "due_date": "ISO date or null"}
  ]`)
	}

	if req.DetectQuestions {
		sb.WriteString(`,
  "questions_asked": ["question 1?", "question 2?"]`)
	}

	sb.WriteString("\n}")

	return sb.String()
}

// parseAnalysisResponse parses the LLM response into structured data
func (s *Service) parseAnalysisResponse(content string) (*AnalysisResponse, error) {
	// Find JSON in response
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start == -1 || end == -1 || end <= start {
		return nil, fmt.Errorf("no valid JSON found in response")
	}

	jsonStr := content[start : end+1]

	var raw struct {
		Summary           string       `json:"summary"`
		Sentiment         string       `json:"sentiment"`
		Priority          float64      `json:"priority"`
		Intent            string       `json:"intent"`
		Category          string       `json:"category"`
		RequiresResponse  bool         `json:"requires_response"`
		SuggestedDeadline *string      `json:"suggested_deadline"`
		Topics            []string     `json:"topics"`
		ActionItems       []ActionItem `json:"action_items"`
		QuestionsAsked    []string     `json:"questions_asked"`
		Confidence        float64      `json:"confidence"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &raw); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	result := &AnalysisResponse{
		Summary:          raw.Summary,
		Sentiment:        raw.Sentiment,
		Priority:         raw.Priority,
		Intent:           raw.Intent,
		Category:         raw.Category,
		RequiresResponse: raw.RequiresResponse,
		Topics:           raw.Topics,
		ActionItems:      raw.ActionItems,
		QuestionsAsked:   raw.QuestionsAsked,
		Confidence:       raw.Confidence,
	}

	// Parse deadline if present
	if raw.SuggestedDeadline != nil && *raw.SuggestedDeadline != "" {
		if t, err := time.Parse(time.RFC3339, *raw.SuggestedDeadline); err == nil {
			result.SuggestedDeadline = &t
		}
	}

	// Validate and normalize sentiment
	switch strings.ToLower(raw.Sentiment) {
	case "positive", "neutral", "negative", "mixed":
		result.Sentiment = strings.ToLower(raw.Sentiment)
	default:
		result.Sentiment = "neutral"
	}

	// Clamp priority
	if result.Priority < 0 {
		result.Priority = 0
	} else if result.Priority > 1 {
		result.Priority = 1
	}

	return result, nil
}

// createFallbackResponse creates a basic response when parsing fails
func (s *Service) createFallbackResponse(req *AnalysisRequest) *AnalysisResponse {
	return &AnalysisResponse{
		Summary:          fmt.Sprintf("Email from %s regarding: %s", req.FromAddress, req.Subject),
		Sentiment:        "neutral",
		Priority:         0.5,
		Intent:           "other",
		Category:         "general",
		RequiresResponse: false,
		Confidence:       0.3,
	}
}

// generateCacheKey creates a cache key based on content hash
func (s *Service) generateCacheKey(req *AnalysisRequest) string {
	data := fmt.Sprintf("%s:%s:%s:%t:%t",
		req.EmailID,
		req.Subject,
		req.Body,
		req.ExtractActionItems,
		req.DetectQuestions,
	)
	hash := sha256.Sum256([]byte(data))
	return "analysis:" + hex.EncodeToString(hash[:])
}

// getFromCache retrieves cached analysis
func (s *Service) getFromCache(ctx context.Context, key string) (*AnalysisResponse, error) {
	data, err := s.cache.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var result AnalysisResponse
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// setInCache stores analysis in cache
func (s *Service) setInCache(ctx context.Context, key string, result *AnalysisResponse) error {
	data, err := json.Marshal(result)
	if err != nil {
		return err
	}

	return s.cache.Set(ctx, key, data, s.cacheTTL).Err()
}

// InvalidateCache removes cached analysis for an email
func (s *Service) InvalidateCache(ctx context.Context, emailID string) error {
	pattern := "analysis:" + emailID + "*"
	iter := s.cache.Scan(ctx, 0, pattern, 100).Iterator()

	for iter.Next(ctx) {
		if err := s.cache.Del(ctx, iter.Val()).Err(); err != nil {
			s.logger.Warn().Err(err).Str("key", iter.Val()).Msg("Failed to delete cache key")
		}
	}

	return iter.Err()
}

const analysisSystemPrompt = `You are an email analysis assistant. Your task is to analyze emails and extract structured information.

Guidelines:
1. Provide concise, accurate summaries
2. Detect sentiment based on tone and language
3. Assess priority based on urgency indicators, sender importance, and content
4. Identify the primary intent of the email
5. Extract action items with clear descriptions
6. Identify direct questions that need answers
7. Be objective and professional

Priority scoring:
- 0.0-0.3: Low priority (newsletters, FYI, automated notifications)
- 0.3-0.6: Normal priority (general correspondence, updates)
- 0.6-0.8: High priority (time-sensitive, important requests)
- 0.8-1.0: Urgent (immediate action required, critical issues)

Always respond with valid JSON matching the requested format.`
