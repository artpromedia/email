package draft

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/rs/zerolog"

	"github.com/oonrumail/ai-assistant/provider"
)

// ToneAdjustment represents tone modification options
type ToneAdjustment string

const (
	ToneFormal    ToneAdjustment = "formal"
	ToneCasual    ToneAdjustment = "casual"
	ToneShorter   ToneAdjustment = "shorter"
	ToneLonger    ToneAdjustment = "longer"
	TonePolite    ToneAdjustment = "polite"
	ToneDirect    ToneAdjustment = "direct"
	ToneFriendly  ToneAdjustment = "friendly"
	ToneAssertive ToneAdjustment = "assertive"
)

// Service handles draft assistance
type Service struct {
	router *provider.Router
	cache  *redis.Client
	logger zerolog.Logger
}

// ServiceConfig contains draft service configuration
type ServiceConfig struct {
	MaxSuggestionLength int
}

// NewService creates a new draft assistant service
func NewService(router *provider.Router, cache *redis.Client, cfg ServiceConfig, logger zerolog.Logger) *Service {
	return &Service{
		router: router,
		cache:  cache,
		logger: logger.With().Str("component", "draft").Logger(),
	}
}

// ============================================================
// INLINE SUGGESTIONS (Ghost Text)
// ============================================================

// InlineSuggestionRequest for ghost text completion
type InlineSuggestionRequest struct {
	// Current content
	CurrentText    string `json:"current_text"`     // Text typed so far
	CursorPosition int    `json:"cursor_position"`  // Where cursor is

	// Context
	Subject     string `json:"subject,omitempty"`
	Recipients  []string `json:"recipients,omitempty"`
	InReplyTo   *EmailContext `json:"in_reply_to,omitempty"`

	// User context
	UserID      string `json:"user_id"`
	OrgID       string `json:"org_id"`
	UserName    string `json:"user_name"`
	UserEmail   string `json:"user_email"`

	// Preferences
	TonePreference string `json:"tone_preference,omitempty"`
	MaxLength      int    `json:"max_length"` // Max chars to suggest
}

// EmailContext for reply context
type EmailContext struct {
	Subject     string `json:"subject"`
	Body        string `json:"body"`
	FromName    string `json:"from_name"`
	FromAddress string `json:"from_address"`
}

// InlineSuggestionResponse contains ghost text suggestion
type InlineSuggestionResponse struct {
	Suggestion     string `json:"suggestion"`       // Text to show as ghost
	FullCompletion string `json:"full_completion"`  // If user accepts
	Confidence     float64 `json:"confidence"`
	Model          string `json:"model"`
	Provider       string `json:"provider"`
	LatencyMs      int64  `json:"latency_ms"`
}

// GetInlineSuggestion generates ghost text for autocomplete
func (s *Service) GetInlineSuggestion(ctx context.Context, req *InlineSuggestionRequest) (*InlineSuggestionResponse, error) {
	start := time.Now()

	// Don't suggest if text is too short
	if len(req.CurrentText) < 10 {
		return &InlineSuggestionResponse{
			Suggestion: "",
			Confidence: 0,
			LatencyMs:  time.Since(start).Milliseconds(),
		}, nil
	}

	// Set defaults
	if req.MaxLength <= 0 {
		req.MaxLength = 100
	}

	systemPrompt := `You are an email writing assistant. Complete the user's sentence naturally.
Rules:
- Continue from exactly where they stopped
- Match their writing style and tone
- Keep it brief (1-2 sentences max)
- Don't repeat what they've already written
- Be contextually appropriate for email

Output ONLY the completion text, nothing else.`

	// Build context
	var contextBuilder strings.Builder
	if req.InReplyTo != nil {
		contextBuilder.WriteString(fmt.Sprintf("Replying to email from %s:\nSubject: %s\n\n",
			req.InReplyTo.FromName, req.InReplyTo.Subject))
	}
	if req.Subject != "" {
		contextBuilder.WriteString(fmt.Sprintf("Email subject: %s\n", req.Subject))
	}
	if len(req.Recipients) > 0 {
		contextBuilder.WriteString(fmt.Sprintf("To: %s\n", strings.Join(req.Recipients, ", ")))
	}
	contextBuilder.WriteString(fmt.Sprintf("\nUser is writing (complete this):\n%s", req.CurrentText))

	completionReq := &provider.CompletionRequest{
		Messages: []provider.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: contextBuilder.String()},
		},
		MaxTokens:   req.MaxLength / 4, // Rough token estimate
		Temperature: 0.7,
	}

	result, err := s.router.CompleteWithFallback(ctx, completionReq, "draft")
	if err != nil {
		return &InlineSuggestionResponse{
			Suggestion: "",
			Confidence: 0,
			LatencyMs:  time.Since(start).Milliseconds(),
		}, nil // Don't error, just return empty
	}

	suggestion := strings.TrimSpace(result.Content)

	// Limit suggestion length
	if len(suggestion) > req.MaxLength {
		// Cut at word boundary
		suggestion = truncateAtWord(suggestion, req.MaxLength)
	}

	return &InlineSuggestionResponse{
		Suggestion:     suggestion,
		FullCompletion: req.CurrentText + suggestion,
		Confidence:     0.8,
		Model:          result.Model,
		Provider:       result.Provider,
		LatencyMs:      time.Since(start).Milliseconds(),
	}, nil
}

// ============================================================
// HELP ME WRITE
// ============================================================

// HelpMeWriteRequest for full draft generation
type HelpMeWriteRequest struct {
	// What user wants
	Prompt      string `json:"prompt"`       // "Write an email to..." or "Help me explain..."
	CurrentText string `json:"current_text"` // Existing draft to improve

	// Context
	Subject     string `json:"subject,omitempty"`
	Recipients  []RecipientInfo `json:"recipients,omitempty"`
	InReplyTo   *EmailContext `json:"in_reply_to,omitempty"`

	// User context
	UserID           string `json:"user_id"`
	OrgID            string `json:"org_id"`
	UserName         string `json:"user_name"`
	UserEmail        string `json:"user_email"`
	UserSignature    string `json:"user_signature,omitempty"`
	CustomInstructions string `json:"custom_instructions,omitempty"`

	// Options
	TonePreference ToneAdjustment `json:"tone_preference,omitempty"`
	Length         string `json:"length,omitempty"` // short/medium/long
	IncludeGreeting bool `json:"include_greeting"`
	IncludeClosing  bool `json:"include_closing"`
}

// RecipientInfo contains recipient details
type RecipientInfo struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	Type    string `json:"type"` // to/cc/bcc
}

// HelpMeWriteResponse contains generated draft
type HelpMeWriteResponse struct {
	Subject   string `json:"subject,omitempty"` // Generated if not provided
	Body      string `json:"body"`
	Preview   string `json:"preview"`           // First 100 chars
	WordCount int    `json:"word_count"`
	Tone      string `json:"tone"`              // Detected tone
	Model     string `json:"model"`
	Provider  string `json:"provider"`
	LatencyMs int64  `json:"latency_ms"`
}

// HelpMeWrite generates a full email draft
func (s *Service) HelpMeWrite(ctx context.Context, req *HelpMeWriteRequest) (*HelpMeWriteResponse, error) {
	start := time.Now()

	// Build system prompt
	var systemBuilder strings.Builder
	systemBuilder.WriteString("You are an expert email writer. Help compose professional, clear emails.\n\n")

	// Tone instructions
	switch req.TonePreference {
	case ToneFormal:
		systemBuilder.WriteString("Tone: Formal and professional. Use proper salutations and closings.\n")
	case ToneCasual:
		systemBuilder.WriteString("Tone: Casual and friendly. Keep it conversational.\n")
	case ToneShorter:
		systemBuilder.WriteString("Tone: Very concise. Get to the point quickly.\n")
	case ToneFriendly:
		systemBuilder.WriteString("Tone: Warm and friendly while remaining professional.\n")
	case ToneAssertive:
		systemBuilder.WriteString("Tone: Confident and assertive without being aggressive.\n")
	default:
		systemBuilder.WriteString("Tone: Professional but approachable.\n")
	}

	// Length instructions
	switch req.Length {
	case "short":
		systemBuilder.WriteString("Length: Keep it brief, 2-3 sentences max.\n")
	case "long":
		systemBuilder.WriteString("Length: Detailed and comprehensive.\n")
	default:
		systemBuilder.WriteString("Length: Moderate, covering key points clearly.\n")
	}

	if req.CustomInstructions != "" {
		systemBuilder.WriteString(fmt.Sprintf("\nUser's style preferences: %s\n", req.CustomInstructions))
	}

	systemBuilder.WriteString("\nOutput ONLY the email body. Do not include subject line unless asked.")

	// Build user prompt
	var userBuilder strings.Builder
	userBuilder.WriteString(fmt.Sprintf("Task: %s\n\n", req.Prompt))

	if req.InReplyTo != nil {
		userBuilder.WriteString(fmt.Sprintf("This is a reply to:\nFrom: %s <%s>\nSubject: %s\nBody:\n%s\n\n",
			req.InReplyTo.FromName, req.InReplyTo.FromAddress,
			req.InReplyTo.Subject, truncateText(req.InReplyTo.Body, 1500)))
	}

	if req.Subject != "" {
		userBuilder.WriteString(fmt.Sprintf("Subject: %s\n", req.Subject))
	}

	if len(req.Recipients) > 0 {
		userBuilder.WriteString("Recipients:\n")
		for _, r := range req.Recipients {
			userBuilder.WriteString(fmt.Sprintf("- %s <%s> (%s)\n", r.Name, r.Email, r.Type))
		}
	}

	userBuilder.WriteString(fmt.Sprintf("\nSigning as: %s <%s>\n", req.UserName, req.UserEmail))

	if req.CurrentText != "" {
		userBuilder.WriteString(fmt.Sprintf("\nCurrent draft to improve:\n%s\n", req.CurrentText))
	}

	completionReq := &provider.CompletionRequest{
		Messages: []provider.Message{
			{Role: "system", Content: systemBuilder.String()},
			{Role: "user", Content: userBuilder.String()},
		},
		MaxTokens:   1500,
		Temperature: 0.6,
	}

	result, err := s.router.CompleteWithFallback(ctx, completionReq, "draft")
	if err != nil {
		return nil, fmt.Errorf("failed to generate draft: %w", err)
	}

	body := strings.TrimSpace(result.Content)

	// Add greeting if requested and not present
	if req.IncludeGreeting && !startsWithGreeting(body) {
		greeting := "Hi"
		if len(req.Recipients) > 0 && req.Recipients[0].Name != "" {
			firstName := strings.Split(req.Recipients[0].Name, " ")[0]
			greeting = fmt.Sprintf("Hi %s", firstName)
		}
		if req.TonePreference == ToneFormal {
			greeting = "Dear " + strings.TrimPrefix(greeting, "Hi ")
		}
		body = greeting + ",\n\n" + body
	}

	// Add closing if requested and not present
	if req.IncludeClosing && !endsWithClosing(body) {
		closing := "Best regards"
		if req.TonePreference == ToneCasual {
			closing = "Thanks"
		} else if req.TonePreference == ToneFormal {
			closing = "Sincerely"
		}
		body = body + "\n\n" + closing + ",\n" + req.UserName
	}

	// Append signature
	if req.UserSignature != "" {
		body = body + "\n\n" + req.UserSignature
	}

	return &HelpMeWriteResponse{
		Body:      body,
		Preview:   truncateText(body, 100),
		WordCount: len(strings.Fields(body)),
		Tone:      string(req.TonePreference),
		Model:     result.Model,
		Provider:  result.Provider,
		LatencyMs: time.Since(start).Milliseconds(),
	}, nil
}

// ============================================================
// TONE ADJUSTMENT
// ============================================================

// ToneAdjustRequest for modifying tone
type ToneAdjustRequest struct {
	Text           string         `json:"text"`
	TargetTone     ToneAdjustment `json:"target_tone"`
	PreserveLength bool           `json:"preserve_length"`
	UserID         string         `json:"user_id"`
	OrgID          string         `json:"org_id"`
}

// ToneAdjustResponse contains adjusted text
type ToneAdjustResponse struct {
	OriginalText string `json:"original_text"`
	AdjustedText string `json:"adjusted_text"`
	OriginalTone string `json:"original_tone"`
	TargetTone   string `json:"target_tone"`
	Changes      []TextChange `json:"changes"` // What was changed
	Model        string `json:"model"`
	Provider     string `json:"provider"`
	LatencyMs    int64  `json:"latency_ms"`
}

// TextChange describes a specific change
type TextChange struct {
	Original    string `json:"original"`
	Replacement string `json:"replacement"`
	Reason      string `json:"reason"`
}

// AdjustTone modifies the tone of text
func (s *Service) AdjustTone(ctx context.Context, req *ToneAdjustRequest) (*ToneAdjustResponse, error) {
	start := time.Now()

	toneInstructions := map[ToneAdjustment]string{
		ToneFormal:    "Make it more formal and professional. Use proper business language.",
		ToneCasual:    "Make it more casual and friendly. Use conversational language.",
		ToneShorter:   "Make it more concise. Remove unnecessary words, keep the meaning.",
		ToneLonger:    "Expand with more detail and explanation.",
		TonePolite:    "Make it more polite and courteous. Add please/thank you where appropriate.",
		ToneDirect:    "Make it more direct and to the point. Remove hedging language.",
		ToneFriendly:  "Make it warmer and more friendly while staying professional.",
		ToneAssertive: "Make it more confident and assertive without being aggressive.",
	}

	instruction, ok := toneInstructions[req.TargetTone]
	if !ok {
		instruction = "Improve the tone while keeping the meaning."
	}

	systemPrompt := fmt.Sprintf(`You are an expert editor. %s

Output as JSON:
{
  "adjusted_text": "The modified text...",
  "original_tone": "detected tone of input",
  "changes": [
    {"original": "old phrase", "replacement": "new phrase", "reason": "why changed"}
  ]
}`, instruction)

	if req.PreserveLength {
		systemPrompt += "\n\nIMPORTANT: Keep the text approximately the same length."
	}

	completionReq := &provider.CompletionRequest{
		Messages: []provider.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: fmt.Sprintf("Adjust this text:\n\n%s", req.Text)},
		},
		MaxTokens:   len(req.Text)/2 + 500,
		Temperature: 0.4,
	}

	result, err := s.router.CompleteWithFallback(ctx, completionReq, "draft")
	if err != nil {
		return nil, fmt.Errorf("failed to adjust tone: %w", err)
	}

	// Parse response
	response := s.parseToneResponse(result.Content, req.Text, req.TargetTone)
	response.Model = result.Model
	response.Provider = result.Provider
	response.LatencyMs = time.Since(start).Milliseconds()

	return response, nil
}

// parseToneResponse parses the AI response
func (s *Service) parseToneResponse(content string, originalText string, targetTone ToneAdjustment) *ToneAdjustResponse {
	response := &ToneAdjustResponse{
		OriginalText: originalText,
		TargetTone:   string(targetTone),
	}

	jsonStr := extractJSON(content)
	if jsonStr == "" {
		// Fallback: use raw content
		response.AdjustedText = content
		return response
	}

	var parsed struct {
		AdjustedText string `json:"adjusted_text"`
		OriginalTone string `json:"original_tone"`
		Changes      []struct {
			Original    string `json:"original"`
			Replacement string `json:"replacement"`
			Reason      string `json:"reason"`
		} `json:"changes"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		response.AdjustedText = content
		return response
	}

	response.AdjustedText = parsed.AdjustedText
	response.OriginalTone = parsed.OriginalTone

	for _, change := range parsed.Changes {
		response.Changes = append(response.Changes, TextChange{
			Original:    change.Original,
			Replacement: change.Replacement,
			Reason:      change.Reason,
		})
	}

	return response
}

// ============================================================
// GRAMMAR & CLARITY
// ============================================================

// GrammarCheckRequest for grammar and clarity checking
type GrammarCheckRequest struct {
	Text   string `json:"text"`
	UserID string `json:"user_id"`
	OrgID  string `json:"org_id"`
}

// GrammarCheckResponse contains grammar check results
type GrammarCheckResponse struct {
	OriginalText  string        `json:"original_text"`
	CorrectedText string        `json:"corrected_text"`
	Issues        []GrammarIssue `json:"issues"`
	Score         int           `json:"score"` // 0-100 quality score
	Model         string        `json:"model"`
	Provider      string        `json:"provider"`
	LatencyMs     int64         `json:"latency_ms"`
}

// GrammarIssue represents a grammar/clarity issue
type GrammarIssue struct {
	Type        string `json:"type"`        // grammar/spelling/clarity/style
	Original    string `json:"original"`
	Suggestion  string `json:"suggestion"`
	Explanation string `json:"explanation"`
	Position    int    `json:"position"` // Character position
}

// CheckGrammar checks grammar and clarity
func (s *Service) CheckGrammar(ctx context.Context, req *GrammarCheckRequest) (*GrammarCheckResponse, error) {
	start := time.Now()

	systemPrompt := `You are an expert editor checking for grammar, spelling, and clarity issues.

Analyze the text and output JSON:
{
  "corrected_text": "The fully corrected text",
  "issues": [
    {
      "type": "grammar|spelling|clarity|style",
      "original": "the problematic text",
      "suggestion": "the correction",
      "explanation": "why this is an issue"
    }
  ],
  "score": 85
}

Score: 100 = perfect, 0 = many issues
Be thorough but not overly pedantic.`

	completionReq := &provider.CompletionRequest{
		Messages: []provider.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: fmt.Sprintf("Check this text:\n\n%s", req.Text)},
		},
		MaxTokens:   len(req.Text)/2 + 500,
		Temperature: 0.2, // Low temperature for accuracy
	}

	result, err := s.router.CompleteWithFallback(ctx, completionReq, "draft")
	if err != nil {
		return nil, fmt.Errorf("failed to check grammar: %w", err)
	}

	// Parse response
	response := s.parseGrammarResponse(result.Content, req.Text)
	response.Model = result.Model
	response.Provider = result.Provider
	response.LatencyMs = time.Since(start).Milliseconds()

	return response, nil
}

// parseGrammarResponse parses the AI response
func (s *Service) parseGrammarResponse(content string, originalText string) *GrammarCheckResponse {
	response := &GrammarCheckResponse{
		OriginalText: originalText,
		Score:        100,
	}

	jsonStr := extractJSON(content)
	if jsonStr == "" {
		response.CorrectedText = originalText
		return response
	}

	var parsed struct {
		CorrectedText string `json:"corrected_text"`
		Issues        []struct {
			Type        string `json:"type"`
			Original    string `json:"original"`
			Suggestion  string `json:"suggestion"`
			Explanation string `json:"explanation"`
		} `json:"issues"`
		Score int `json:"score"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		response.CorrectedText = originalText
		return response
	}

	response.CorrectedText = parsed.CorrectedText
	response.Score = parsed.Score

	for _, issue := range parsed.Issues {
		// Find position of issue in original text
		position := strings.Index(originalText, issue.Original)
		response.Issues = append(response.Issues, GrammarIssue{
			Type:        issue.Type,
			Original:    issue.Original,
			Suggestion:  issue.Suggestion,
			Explanation: issue.Explanation,
			Position:    position,
		})
	}

	return response
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

func truncateText(text string, maxLen int) string {
	if len(text) <= maxLen {
		return text
	}
	return text[:maxLen] + "..."
}

func truncateAtWord(text string, maxLen int) string {
	if len(text) <= maxLen {
		return text
	}
	// Find last space before maxLen
	lastSpace := strings.LastIndex(text[:maxLen], " ")
	if lastSpace == -1 {
		return text[:maxLen]
	}
	return text[:lastSpace]
}

func extractJSON(content string) string {
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start == -1 || end == -1 || end <= start {
		return ""
	}
	return content[start : end+1]
}

func startsWithGreeting(text string) bool {
	lower := strings.ToLower(text)
	greetings := []string{"hi ", "hello ", "dear ", "hey ", "good morning", "good afternoon", "good evening"}
	for _, g := range greetings {
		if strings.HasPrefix(lower, g) {
			return true
		}
	}
	return false
}

func endsWithClosing(text string) bool {
	lower := strings.ToLower(text)
	closings := []string{"regards", "sincerely", "thanks", "best", "cheers", "warmly"}
	for _, c := range closings {
		if strings.Contains(lower[max(0, len(lower)-100):], c) {
			return true
		}
	}
	return false
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
