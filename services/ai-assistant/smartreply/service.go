package smartreply

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

	"github.com/oonrumail/ai-assistant/provider"
)

// Tone represents the reply tone
type Tone string

const (
	ToneProfessional Tone = "professional"
	ToneFriendly     Tone = "friendly"
	ToneConcise      Tone = "concise"
	ToneFormal       Tone = "formal"
	ToneCasual       Tone = "casual"
)

// Service handles smart reply generation
type Service struct {
	router   *provider.Router
	cache    *redis.Client
	cacheTTL time.Duration
	logger   zerolog.Logger
}

// ServiceConfig contains smart reply service configuration
type ServiceConfig struct {
	CacheTTL time.Duration
}

// NewService creates a new smart reply service
func NewService(router *provider.Router, cache *redis.Client, cfg ServiceConfig, logger zerolog.Logger) *Service {
	return &Service{
		router:   router,
		cache:    cache,
		cacheTTL: cfg.CacheTTL,
		logger:   logger.With().Str("component", "smartreply").Logger(),
	}
}

// SmartReplyRequest represents a smart reply request
type SmartReplyRequest struct {
	// Email content
	EmailID     string   `json:"email_id"`
	Subject     string   `json:"subject"`
	Body        string   `json:"body"`
	FromAddress string   `json:"from_address"`
	FromName    string   `json:"from_name"`
	ToAddresses []string `json:"to_addresses"`
	Date        string   `json:"date"`

	// Thread context
	ThreadID       string         `json:"thread_id,omitempty"`
	ThreadMessages []ThreadMessage `json:"thread_messages,omitempty"`

	// User context
	UserID        string `json:"user_id"`
	OrgID         string `json:"org_id"`
	UserName      string `json:"user_name"`
	UserEmail     string `json:"user_email"`
	UserSignature string `json:"user_signature,omitempty"`

	// Style preferences
	UserStyleSamples []string `json:"user_style_samples,omitempty"` // Previous replies for style matching
	CustomInstructions string `json:"custom_instructions,omitempty"`
	PreferredTone    Tone    `json:"preferred_tone,omitempty"`

	// Options
	NumSuggestions int  `json:"num_suggestions"` // Default 3
	QuickReply     bool `json:"quick_reply"`     // Short mobile-friendly replies
	SkipCache      bool `json:"skip_cache"`
}

// ThreadMessage represents a message in the email thread
type ThreadMessage struct {
	ID          string `json:"id"`
	FromAddress string `json:"from_address"`
	FromName    string `json:"from_name"`
	Body        string `json:"body"`
	Date        string `json:"date"`
	IsFromUser  bool   `json:"is_from_user"`
}

// SmartReplyResponse contains generated reply suggestions
type SmartReplyResponse struct {
	EmailID     string            `json:"email_id"`
	Suggestions []ReplySuggestion `json:"suggestions"`
	Model       string            `json:"model"`
	Provider    string            `json:"provider"`
	Cached      bool              `json:"cached"`
	LatencyMs   int64             `json:"latency_ms"`
}

// ReplySuggestion represents a single reply suggestion
type ReplySuggestion struct {
	ID              string  `json:"id"`
	Content         string  `json:"content"`
	Tone            Tone    `json:"tone"`
	ConfidenceScore float64 `json:"confidence_score"`
	IsQuickReply    bool    `json:"is_quick_reply"` // Short enough for mobile
	PreviewText     string  `json:"preview_text"`   // First ~50 chars
	WordCount       int     `json:"word_count"`
}

// GenerateReplies generates smart reply suggestions
func (s *Service) GenerateReplies(ctx context.Context, req *SmartReplyRequest) (*SmartReplyResponse, error) {
	start := time.Now()

	// Set defaults
	if req.NumSuggestions <= 0 {
		req.NumSuggestions = 3
	}
	if req.NumSuggestions > 5 {
		req.NumSuggestions = 5
	}

	// Check cache
	cacheKey := s.generateCacheKey(req)
	if !req.SkipCache && s.cache != nil {
		if cached, err := s.getCachedResponse(ctx, cacheKey); err == nil && cached != nil {
			cached.Cached = true
			cached.LatencyMs = time.Since(start).Milliseconds()
			return cached, nil
		}
	}

	// Build prompt
	prompt := s.buildPrompt(req)

	// Generate completions with provider router
	completionReq := &provider.CompletionRequest{
		Messages: []provider.Message{
			{Role: "system", Content: s.buildSystemPrompt(req)},
			{Role: "user", Content: prompt},
		},
		MaxTokens:   1500,
		Temperature: 0.7, // Slightly creative for variety
	}

	result, err := s.router.CompleteWithFallback(ctx, completionReq)
	if err != nil {
		return nil, fmt.Errorf("failed to generate replies: %w", err)
	}

	// Parse response
	suggestions, err := s.parseResponse(result.Content, req)
	if err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	response := &SmartReplyResponse{
		EmailID:     req.EmailID,
		Suggestions: suggestions,
		Model:       result.Model,
		Provider:    result.Provider,
		Cached:      false,
		LatencyMs:   time.Since(start).Milliseconds(),
	}

	// Cache response
	if s.cache != nil && !req.SkipCache {
		go s.cacheResponse(context.Background(), cacheKey, response)
	}

	return response, nil
}

// buildSystemPrompt creates the system prompt for smart reply
func (s *Service) buildSystemPrompt(req *SmartReplyRequest) string {
	var sb strings.Builder

	sb.WriteString(`You are an expert email assistant helping to write reply suggestions. Generate exactly `)
	sb.WriteString(fmt.Sprintf("%d", req.NumSuggestions))
	sb.WriteString(` different reply options with varying tones.

Guidelines:
- Each reply should be a complete, ready-to-send response
- Maintain the user's voice and communication style
- Be helpful, clear, and appropriately formal/informal based on context
- Address all questions or requests in the original email
- Keep replies concise but complete
`)

	if req.QuickReply {
		sb.WriteString(`
IMPORTANT: Generate SHORT replies suitable for mobile (max 2-3 sentences each).
Focus on the essential response without lengthy explanations.
`)
	}

	if req.CustomInstructions != "" {
		sb.WriteString(fmt.Sprintf("\nUser's custom instructions: %s\n", req.CustomInstructions))
	}

	if len(req.UserStyleSamples) > 0 {
		sb.WriteString("\nUser's writing style samples (match this style):\n")
		for i, sample := range req.UserStyleSamples {
			if i >= 3 {
				break // Max 3 samples
			}
			sb.WriteString(fmt.Sprintf("Sample %d: %s\n", i+1, truncateText(sample, 200)))
		}
	}

	sb.WriteString(`
Output format (JSON array):
[
  {
    "content": "Full reply text",
    "tone": "professional|friendly|concise",
    "confidence": 0.95
  }
]

Ensure each suggestion has a different tone: professional, friendly, and concise.
`)

	return sb.String()
}

// buildPrompt creates the user prompt with email context
func (s *Service) buildPrompt(req *SmartReplyRequest) string {
	var sb strings.Builder

	sb.WriteString("Generate reply suggestions for this email:\n\n")
	sb.WriteString(fmt.Sprintf("From: %s <%s>\n", req.FromName, req.FromAddress))
	sb.WriteString(fmt.Sprintf("To: %s\n", strings.Join(req.ToAddresses, ", ")))
	sb.WriteString(fmt.Sprintf("Subject: %s\n", req.Subject))
	sb.WriteString(fmt.Sprintf("Date: %s\n", req.Date))
	sb.WriteString(fmt.Sprintf("\n--- Email Body ---\n%s\n--- End ---\n", truncateText(req.Body, 3000)))

	// Include thread context if available
	if len(req.ThreadMessages) > 0 {
		sb.WriteString("\n--- Thread Context (recent messages) ---\n")
		// Include last 3 messages max
		start := 0
		if len(req.ThreadMessages) > 3 {
			start = len(req.ThreadMessages) - 3
		}
		for _, msg := range req.ThreadMessages[start:] {
			direction := "Received"
			if msg.IsFromUser {
				direction = "Sent"
			}
			sb.WriteString(fmt.Sprintf("\n[%s] From: %s\n%s\n", direction, msg.FromName, truncateText(msg.Body, 500)))
		}
		sb.WriteString("--- End Thread ---\n")
	}

	sb.WriteString(fmt.Sprintf("\nReplying as: %s <%s>\n", req.UserName, req.UserEmail))

	if req.UserSignature != "" {
		sb.WriteString(fmt.Sprintf("\n(Signature to append: %s)\n", truncateText(req.UserSignature, 200)))
	}

	return sb.String()
}

// parseResponse parses the LLM response into suggestions
func (s *Service) parseResponse(content string, req *SmartReplyRequest) ([]ReplySuggestion, error) {
	// Extract JSON from response
	jsonStr := extractJSON(content)
	if jsonStr == "" {
		return nil, fmt.Errorf("no valid JSON in response")
	}

	var rawSuggestions []struct {
		Content    string  `json:"content"`
		Tone       string  `json:"tone"`
		Confidence float64 `json:"confidence"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &rawSuggestions); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	suggestions := make([]ReplySuggestion, 0, len(rawSuggestions))
	for i, raw := range rawSuggestions {
		wordCount := len(strings.Fields(raw.Content))
		suggestion := ReplySuggestion{
			ID:              fmt.Sprintf("%s-reply-%d", req.EmailID, i+1),
			Content:         raw.Content,
			Tone:            Tone(raw.Tone),
			ConfidenceScore: raw.Confidence,
			IsQuickReply:    wordCount <= 50,
			PreviewText:     truncateText(raw.Content, 50),
			WordCount:       wordCount,
		}

		// Validate tone
		switch suggestion.Tone {
		case ToneProfessional, ToneFriendly, ToneConcise, ToneFormal, ToneCasual:
			// Valid
		default:
			suggestion.Tone = ToneProfessional
		}

		suggestions = append(suggestions, suggestion)
	}

	return suggestions, nil
}

// generateCacheKey creates a cache key for the request
func (s *Service) generateCacheKey(req *SmartReplyRequest) string {
	// Hash email content and options
	hasher := sha256.New()
	hasher.Write([]byte(req.EmailID))
	hasher.Write([]byte(req.Body))
	hasher.Write([]byte(fmt.Sprintf("%d", req.NumSuggestions)))
	hasher.Write([]byte(fmt.Sprintf("%v", req.QuickReply)))
	hasher.Write([]byte(req.CustomInstructions))
	hash := hex.EncodeToString(hasher.Sum(nil))[:16]
	return fmt.Sprintf("smartreply:%s:%s", req.EmailID, hash)
}

// getCachedResponse retrieves cached response
func (s *Service) getCachedResponse(ctx context.Context, key string) (*SmartReplyResponse, error) {
	data, err := s.cache.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var resp SmartReplyResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}

	return &resp, nil
}

// cacheResponse stores response in cache
func (s *Service) cacheResponse(ctx context.Context, key string, resp *SmartReplyResponse) {
	data, err := json.Marshal(resp)
	if err != nil {
		s.logger.Warn().Err(err).Msg("Failed to marshal response for caching")
		return
	}

	if err := s.cache.Set(ctx, key, data, s.cacheTTL).Err(); err != nil {
		s.logger.Warn().Err(err).Msg("Failed to cache response")
	}
}

// InvalidateCache invalidates cache for an email
func (s *Service) InvalidateCache(ctx context.Context, emailID string) error {
	if s.cache == nil {
		return nil
	}
	// Delete all cache entries for this email
	pattern := fmt.Sprintf("smartreply:%s:*", emailID)
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
	// Find JSON array in response
	start := strings.Index(content, "[")
	end := strings.LastIndex(content, "]")
	if start == -1 || end == -1 || end <= start {
		return ""
	}
	return content[start : end+1]
}
