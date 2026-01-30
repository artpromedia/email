package priority

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/rs/zerolog"

	"github.com/enterprise-email/ai-assistant/provider"
)

// Level represents priority level
type Level string

const (
	LevelHigh   Level = "high"   // 🔴
	LevelMedium Level = "medium" // 🟡
	LevelNormal Level = "normal" // ⚪
	LevelLow    Level = "low"    // ⚫
)

// Indicator represents visual priority indicator
type Indicator string

const (
	IndicatorHigh   Indicator = "🔴"
	IndicatorMedium Indicator = "🟡"
	IndicatorNormal Indicator = "⚪"
	IndicatorLow    Indicator = "⚫"
)

// Service handles priority detection
type Service struct {
	router           *provider.Router
	cache            *redis.Client
	cacheTTL         time.Duration
	vipSenders       map[string]bool // Email addresses of VIP senders
	vipDomains       map[string]bool // VIP domains
	urgencyPatterns  []*regexp.Regexp
	deadlinePatterns []*regexp.Regexp
	logger           zerolog.Logger
}

// ServiceConfig contains priority service configuration
type ServiceConfig struct {
	CacheTTL    time.Duration
	VIPSenders  []string
	VIPDomains  []string
}

// NewService creates a new priority detection service
func NewService(router *provider.Router, cache *redis.Client, cfg ServiceConfig, logger zerolog.Logger) *Service {
	// Build VIP maps
	vipSenders := make(map[string]bool)
	for _, s := range cfg.VIPSenders {
		vipSenders[strings.ToLower(s)] = true
	}

	vipDomains := make(map[string]bool)
	for _, d := range cfg.VIPDomains {
		vipDomains[strings.ToLower(d)] = true
	}

	// Compile urgency patterns
	urgencyPatterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)\b(urgent|asap|immediately|critical|emergency|time.?sensitive)\b`),
		regexp.MustCompile(`(?i)\b(need.*(today|now|immediately|asap))\b`),
		regexp.MustCompile(`(?i)\b(deadline|due\s+date|expires?|expiring)\b`),
		regexp.MustCompile(`(?i)\b(please\s+respond|awaiting\s+your|waiting\s+for)\b`),
		regexp.MustCompile(`(?i)\b(action\s+required|response\s+needed|your\s+attention)\b`),
	}

	// Compile deadline patterns
	deadlinePatterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)\b(by|before|until|due)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b`),
		regexp.MustCompile(`(?i)\b(by|before|until|due)\s+(\d{1,2}[/\-]\d{1,2}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b`),
		regexp.MustCompile(`(?i)\b(by|before|until|due)\s+(end\s+of\s+(day|week|month))\b`),
		regexp.MustCompile(`(?i)\bdeadline[:\s]+(\d{1,2}[/\-]\d{1,2}|[a-z]+\s+\d{1,2})\b`),
	}

	return &Service{
		router:           router,
		cache:            cache,
		cacheTTL:         cfg.CacheTTL,
		vipSenders:       vipSenders,
		vipDomains:       vipDomains,
		urgencyPatterns:  urgencyPatterns,
		deadlinePatterns: deadlinePatterns,
		logger:           logger.With().Str("component", "priority").Logger(),
	}
}

// ============================================================
// PRIORITY DETECTION
// ============================================================

// DetectionRequest contains data for priority detection
type DetectionRequest struct {
	EmailID        string   `json:"email_id"`
	Subject        string   `json:"subject"`
	Body           string   `json:"body"`
	FromAddress    string   `json:"from_address"`
	FromName       string   `json:"from_name"`
	ToAddresses    []string `json:"to_addresses"`
	CcAddresses    []string `json:"cc_addresses"`
	Date           string   `json:"date"`
	HasAttachments bool     `json:"has_attachments"`

	// User context
	UserID    string `json:"user_id"`
	OrgID     string `json:"org_id"`
	UserEmail string `json:"user_email"`

	// Optional overrides
	VIPSenders []string `json:"vip_senders,omitempty"`
	VIPDomains []string `json:"vip_domains,omitempty"`

	// Options
	UseAI     bool `json:"use_ai"`      // Use AI for nuanced detection
	SkipCache bool `json:"skip_cache"`
}

// DetectionResponse contains priority detection result
type DetectionResponse struct {
	EmailID          string    `json:"email_id"`
	Level            Level     `json:"level"`
	Indicator        Indicator `json:"indicator"`
	Score            float64   `json:"score"`  // 0.0 - 1.0
	Confidence       float64   `json:"confidence"`

	// Factors that influenced the decision
	Factors          []PriorityFactor `json:"factors"`

	// Extracted information
	DetectedDeadline string `json:"detected_deadline,omitempty"`
	UrgencyWords     []string `json:"urgency_words,omitempty"`
	IsVIPSender      bool `json:"is_vip_sender"`
	RequiresResponse bool `json:"requires_response"`

	// Metadata
	Model       string `json:"model,omitempty"`
	Provider    string `json:"provider,omitempty"`
	UsedAI      bool   `json:"used_ai"`
	Cached      bool   `json:"cached"`
	LatencyMs   int64  `json:"latency_ms"`
}

// PriorityFactor represents a factor in priority calculation
type PriorityFactor struct {
	Factor      string  `json:"factor"`
	Impact      string  `json:"impact"`  // high/medium/low
	Weight      float64 `json:"weight"`  // Contribution to score
	Description string  `json:"description"`
}

// DetectPriority analyzes email priority
func (s *Service) DetectPriority(ctx context.Context, req *DetectionRequest) (*DetectionResponse, error) {
	start := time.Now()

	// Check cache
	cacheKey := s.generateCacheKey(req)
	if !req.SkipCache && s.cache != nil {
		if cached, err := s.getCachedResponse(ctx, cacheKey); err == nil && cached != nil {
			cached.Cached = true
			cached.LatencyMs = time.Since(start).Milliseconds()
			return cached, nil
		}
	}

	// Initialize response
	response := &DetectionResponse{
		EmailID: req.EmailID,
		Factors: []PriorityFactor{},
	}

	var totalWeight float64
	var weightedScore float64

	// 1. Check VIP sender
	isVIP := s.checkVIPSender(req)
	response.IsVIPSender = isVIP
	if isVIP {
		weight := 0.25
		response.Factors = append(response.Factors, PriorityFactor{
			Factor:      "vip_sender",
			Impact:      "high",
			Weight:      weight,
			Description: fmt.Sprintf("Email from VIP sender: %s", req.FromName),
		})
		weightedScore += weight * 0.9
		totalWeight += weight
	}

	// 2. Check urgency words in subject
	subjectUrgency, subjectWords := s.checkUrgencyPatterns(req.Subject)
	if subjectUrgency > 0 {
		weight := 0.20
		response.Factors = append(response.Factors, PriorityFactor{
			Factor:      "subject_urgency",
			Impact:      s.impactLevel(subjectUrgency),
			Weight:      weight,
			Description: fmt.Sprintf("Urgency keywords in subject: %v", subjectWords),
		})
		response.UrgencyWords = append(response.UrgencyWords, subjectWords...)
		weightedScore += weight * subjectUrgency
		totalWeight += weight
	}

	// 3. Check urgency words in body
	bodyUrgency, bodyWords := s.checkUrgencyPatterns(req.Body)
	if bodyUrgency > 0 {
		weight := 0.15
		response.Factors = append(response.Factors, PriorityFactor{
			Factor:      "body_urgency",
			Impact:      s.impactLevel(bodyUrgency),
			Weight:      weight,
			Description: fmt.Sprintf("Urgency keywords in body: %v", bodyWords),
		})
		response.UrgencyWords = append(response.UrgencyWords, bodyWords...)
		weightedScore += weight * bodyUrgency
		totalWeight += weight
	}

	// 4. Check for deadlines
	deadline := s.extractDeadline(req.Subject + " " + req.Body)
	if deadline != "" {
		weight := 0.20
		response.DetectedDeadline = deadline
		response.Factors = append(response.Factors, PriorityFactor{
			Factor:      "deadline_detected",
			Impact:      "high",
			Weight:      weight,
			Description: fmt.Sprintf("Deadline mentioned: %s", deadline),
		})
		weightedScore += weight * 0.85
		totalWeight += weight
	}

	// 5. Check if user is directly addressed (To vs Cc)
	isDirectRecipient := s.isDirectRecipient(req)
	if isDirectRecipient {
		weight := 0.10
		response.Factors = append(response.Factors, PriorityFactor{
			Factor:      "direct_recipient",
			Impact:      "medium",
			Weight:      weight,
			Description: "User is in To field (not CC)",
		})
		weightedScore += weight * 0.7
		totalWeight += weight
	}

	// 6. Check for response indicators
	requiresResponse := s.checkRequiresResponse(req.Body)
	response.RequiresResponse = requiresResponse
	if requiresResponse {
		weight := 0.10
		response.Factors = append(response.Factors, PriorityFactor{
			Factor:      "response_required",
			Impact:      "medium",
			Weight:      weight,
			Description: "Email appears to require a response",
		})
		weightedScore += weight * 0.7
		totalWeight += weight
	}

	// 7. Use AI for nuanced detection if requested and needed
	if req.UseAI && len(response.Factors) < 2 {
		aiResult, err := s.detectWithAI(ctx, req)
		if err == nil && aiResult != nil {
			weight := 0.30
			response.Factors = append(response.Factors, PriorityFactor{
				Factor:      "ai_analysis",
				Impact:      s.impactLevel(aiResult.Score),
				Weight:      weight,
				Description: aiResult.Reasoning,
			})
			weightedScore += weight * aiResult.Score
			totalWeight += weight
			response.Model = aiResult.Model
			response.Provider = aiResult.Provider
			response.UsedAI = true

			// Merge AI-detected factors
			for _, factor := range aiResult.Factors {
				response.Factors = append(response.Factors, factor)
			}
		}
	}

	// Calculate final score
	if totalWeight > 0 {
		response.Score = weightedScore / totalWeight
	} else {
		response.Score = 0.3 // Default to normal
	}

	// Determine level and indicator
	response.Level, response.Indicator = s.scoreToLevel(response.Score)
	response.Confidence = s.calculateConfidence(response.Factors)
	response.LatencyMs = time.Since(start).Milliseconds()

	// Cache response
	if s.cache != nil && !req.SkipCache {
		go s.cacheResponse(context.Background(), cacheKey, response)
	}

	return response, nil
}

// ============================================================
// DETECTION HELPERS
// ============================================================

// checkVIPSender checks if sender is a VIP
func (s *Service) checkVIPSender(req *DetectionRequest) bool {
	fromLower := strings.ToLower(req.FromAddress)

	// Check direct address
	if s.vipSenders[fromLower] {
		return true
	}

	// Check user-provided VIPs
	for _, vip := range req.VIPSenders {
		if strings.EqualFold(vip, req.FromAddress) {
			return true
		}
	}

	// Check domain
	parts := strings.Split(fromLower, "@")
	if len(parts) == 2 {
		domain := parts[1]
		if s.vipDomains[domain] {
			return true
		}
		for _, vipDomain := range req.VIPDomains {
			if strings.EqualFold(vipDomain, domain) {
				return true
			}
		}
	}

	return false
}

// checkUrgencyPatterns checks for urgency patterns
func (s *Service) checkUrgencyPatterns(text string) (float64, []string) {
	var matchedWords []string
	var totalMatches int

	for _, pattern := range s.urgencyPatterns {
		matches := pattern.FindAllString(text, -1)
		if len(matches) > 0 {
			totalMatches += len(matches)
			matchedWords = append(matchedWords, matches...)
		}
	}

	if totalMatches == 0 {
		return 0, nil
	}

	// Score based on number of urgency indicators
	score := float64(totalMatches) * 0.2
	if score > 1.0 {
		score = 1.0
	}

	return score, uniqueStrings(matchedWords)
}

// extractDeadline extracts deadline from text
func (s *Service) extractDeadline(text string) string {
	for _, pattern := range s.deadlinePatterns {
		match := pattern.FindString(text)
		if match != "" {
			return match
		}
	}
	return ""
}

// isDirectRecipient checks if user is in To field
func (s *Service) isDirectRecipient(req *DetectionRequest) bool {
	userLower := strings.ToLower(req.UserEmail)
	for _, addr := range req.ToAddresses {
		if strings.ToLower(addr) == userLower {
			return true
		}
	}
	return false
}

// checkRequiresResponse checks if email needs a response
func (s *Service) checkRequiresResponse(body string) bool {
	patterns := []string{
		`(?i)\b(please\s+(reply|respond|confirm|let\s+me\s+know))\b`,
		`(?i)\b(looking\s+forward\s+to\s+(hearing|your\s+response))\b`,
		`(?i)\b(awaiting\s+your\s+(response|reply))\b`,
		`(?i)\?[\s]*$`, // Ends with question mark
		`(?i)\b(can\s+you|could\s+you|would\s+you|will\s+you)\b.*\?`,
	}

	for _, p := range patterns {
		if matched, _ := regexp.MatchString(p, body); matched {
			return true
		}
	}
	return false
}

// scoreToLevel converts score to priority level
func (s *Service) scoreToLevel(score float64) (Level, Indicator) {
	switch {
	case score >= 0.7:
		return LevelHigh, IndicatorHigh
	case score >= 0.4:
		return LevelMedium, IndicatorMedium
	case score >= 0.2:
		return LevelNormal, IndicatorNormal
	default:
		return LevelLow, IndicatorLow
	}
}

// impactLevel returns impact level string
func (s *Service) impactLevel(score float64) string {
	switch {
	case score >= 0.7:
		return "high"
	case score >= 0.4:
		return "medium"
	default:
		return "low"
	}
}

// calculateConfidence calculates confidence based on factors
func (s *Service) calculateConfidence(factors []PriorityFactor) float64 {
	if len(factors) == 0 {
		return 0.5 // Low confidence with no factors
	}

	// More factors = higher confidence
	confidence := 0.5 + (float64(len(factors)) * 0.1)
	if confidence > 0.95 {
		confidence = 0.95
	}
	return confidence
}

// ============================================================
// AI DETECTION
// ============================================================

// AIDetectionResult contains AI-based detection result
type AIDetectionResult struct {
	Score     float64          `json:"score"`
	Reasoning string           `json:"reasoning"`
	Factors   []PriorityFactor `json:"factors"`
	Model     string           `json:"model"`
	Provider  string           `json:"provider"`
}

// detectWithAI uses AI for nuanced priority detection
func (s *Service) detectWithAI(ctx context.Context, req *DetectionRequest) (*AIDetectionResult, error) {
	systemPrompt := `You are an email priority analyzer. Analyze the email and determine its priority.

Consider:
- Sender importance and relationship
- Urgency of the content
- Time sensitivity (deadlines, meetings)
- Business impact
- Whether a response is needed
- Email sentiment and tone

Output JSON:
{
  "score": 0.75,
  "reasoning": "Brief explanation of priority assessment",
  "factors": [
    {"factor": "business_impact", "impact": "high", "weight": 0.3, "description": "Important client request"}
  ]
}

Score: 0.0 = low priority, 1.0 = urgent/critical`

	emailContent := fmt.Sprintf(`From: %s <%s>
To: %s
Subject: %s
Date: %s

%s`, req.FromName, req.FromAddress,
		strings.Join(req.ToAddresses, ", "),
		req.Subject, req.Date,
		truncateText(req.Body, 2000))

	completionReq := &provider.CompletionRequest{
		Messages: []provider.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: emailContent},
		},
		MaxTokens:   400,
		Temperature: 0.3,
	}

	result, err := s.router.CompleteWithFallback(ctx, completionReq)
	if err != nil {
		return nil, err
	}

	// Parse response
	jsonStr := extractJSON(result.Content)
	if jsonStr == "" {
		return nil, fmt.Errorf("no valid JSON in response")
	}

	var parsed struct {
		Score     float64 `json:"score"`
		Reasoning string  `json:"reasoning"`
		Factors   []struct {
			Factor      string  `json:"factor"`
			Impact      string  `json:"impact"`
			Weight      float64 `json:"weight"`
			Description string  `json:"description"`
		} `json:"factors"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return nil, err
	}

	factors := make([]PriorityFactor, len(parsed.Factors))
	for i, f := range parsed.Factors {
		factors[i] = PriorityFactor{
			Factor:      f.Factor,
			Impact:      f.Impact,
			Weight:      f.Weight,
			Description: f.Description,
		}
	}

	return &AIDetectionResult{
		Score:     parsed.Score,
		Reasoning: parsed.Reasoning,
		Factors:   factors,
		Model:     result.Model,
		Provider:  result.Provider,
	}, nil
}

// ============================================================
// BATCH DETECTION
// ============================================================

// BatchDetectionRequest for multiple emails
type BatchDetectionRequest struct {
	Emails    []DetectionRequest `json:"emails"`
	UserID    string             `json:"user_id"`
	OrgID     string             `json:"org_id"`
	UseAI     bool               `json:"use_ai"`
}

// BatchDetectionResponse contains batch results
type BatchDetectionResponse struct {
	Results   []DetectionResponse `json:"results"`
	Summary   BatchSummary        `json:"summary"`
	LatencyMs int64               `json:"latency_ms"`
}

// BatchSummary contains batch statistics
type BatchSummary struct {
	Total      int `json:"total"`
	High       int `json:"high"`
	Medium     int `json:"medium"`
	Normal     int `json:"normal"`
	Low        int `json:"low"`
	VIPCount   int `json:"vip_count"`
	NeedResponse int `json:"need_response"`
}

// DetectPriorityBatch processes multiple emails
func (s *Service) DetectPriorityBatch(ctx context.Context, req *BatchDetectionRequest) (*BatchDetectionResponse, error) {
	start := time.Now()

	results := make([]DetectionResponse, len(req.Emails))
	summary := BatchSummary{Total: len(req.Emails)}

	for i, emailReq := range req.Emails {
		emailReq.UserID = req.UserID
		emailReq.OrgID = req.OrgID
		emailReq.UseAI = req.UseAI

		result, err := s.DetectPriority(ctx, &emailReq)
		if err != nil {
			s.logger.Warn().Err(err).Str("email_id", emailReq.EmailID).Msg("Priority detection failed")
			results[i] = DetectionResponse{
				EmailID:   emailReq.EmailID,
				Level:     LevelNormal,
				Indicator: IndicatorNormal,
				Score:     0.3,
			}
			summary.Normal++
			continue
		}

		results[i] = *result

		// Update summary
		switch result.Level {
		case LevelHigh:
			summary.High++
		case LevelMedium:
			summary.Medium++
		case LevelNormal:
			summary.Normal++
		case LevelLow:
			summary.Low++
		}

		if result.IsVIPSender {
			summary.VIPCount++
		}
		if result.RequiresResponse {
			summary.NeedResponse++
		}
	}

	return &BatchDetectionResponse{
		Results:   results,
		Summary:   summary,
		LatencyMs: time.Since(start).Milliseconds(),
	}, nil
}

// ============================================================
// VIP MANAGEMENT
// ============================================================

// AddVIPSender adds a VIP sender
func (s *Service) AddVIPSender(email string) {
	s.vipSenders[strings.ToLower(email)] = true
}

// RemoveVIPSender removes a VIP sender
func (s *Service) RemoveVIPSender(email string) {
	delete(s.vipSenders, strings.ToLower(email))
}

// AddVIPDomain adds a VIP domain
func (s *Service) AddVIPDomain(domain string) {
	s.vipDomains[strings.ToLower(domain)] = true
}

// RemoveVIPDomain removes a VIP domain
func (s *Service) RemoveVIPDomain(domain string) {
	delete(s.vipDomains, strings.ToLower(domain))
}

// ============================================================
// CACHING
// ============================================================

func (s *Service) generateCacheKey(req *DetectionRequest) string {
	hasher := sha256.New()
	hasher.Write([]byte(req.EmailID))
	hasher.Write([]byte(req.Subject))
	hasher.Write([]byte(req.Body[:min(len(req.Body), 500)]))
	hash := hex.EncodeToString(hasher.Sum(nil))[:16]
	return fmt.Sprintf("priority:%s:%s", req.EmailID, hash)
}

func (s *Service) getCachedResponse(ctx context.Context, key string) (*DetectionResponse, error) {
	data, err := s.cache.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}
	var resp DetectionResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (s *Service) cacheResponse(ctx context.Context, key string, resp *DetectionResponse) {
	data, err := json.Marshal(resp)
	if err != nil {
		return
	}
	s.cache.Set(ctx, key, data, s.cacheTTL)
}

// InvalidateCache invalidates cache for an email
func (s *Service) InvalidateCache(ctx context.Context, emailID string) error {
	if s.cache == nil {
		return nil
	}
	pattern := fmt.Sprintf("priority:%s:*", emailID)
	iter := s.cache.Scan(ctx, 0, pattern, 100).Iterator()
	for iter.Next(ctx) {
		s.cache.Del(ctx, iter.Val())
	}
	return iter.Err()
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

func extractJSON(content string) string {
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start == -1 || end == -1 || end <= start {
		return ""
	}
	return content[start : end+1]
}

func uniqueStrings(slice []string) []string {
	seen := make(map[string]bool)
	result := []string{}
	for _, s := range slice {
		lower := strings.ToLower(s)
		if !seen[lower] {
			seen[lower] = true
			result = append(result, s)
		}
	}
	return result
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
