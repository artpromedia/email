// Package spam provides multi-layer spam detection for emails
package spam

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// ============================================================
// TYPES
// ============================================================

// SpamVerdict represents the final spam classification
type SpamVerdict string

const (
	VerdictHam         SpamVerdict = "ham"          // Not spam
	VerdictSpam        SpamVerdict = "spam"         // Definite spam
	VerdictSuspicious  SpamVerdict = "suspicious"   // Needs review
	VerdictQuarantine  SpamVerdict = "quarantine"   // Hold for admin
	VerdictPhishing    SpamVerdict = "phishing"     // Phishing attempt
)

// SpamCheckRequest contains email data for spam checking
type SpamCheckRequest struct {
	EmailID       string            `json:"email_id"`
	OrgID         string            `json:"org_id"`
	From          EmailAddress      `json:"from"`
	To            []EmailAddress    `json:"to"`
	Subject       string            `json:"subject"`
	Body          string            `json:"body"`
	HTMLBody      string            `json:"html_body,omitempty"`
	Headers       map[string]string `json:"headers"`
	SenderIP      string            `json:"sender_ip"`
	ReceivedAt    time.Time         `json:"received_at"`
	Attachments   []Attachment      `json:"attachments,omitempty"`
}

// EmailAddress represents a sender/recipient
type EmailAddress struct {
	Name    string `json:"name"`
	Address string `json:"address"`
}

// Attachment represents an email attachment
type Attachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	Hash        string `json:"hash,omitempty"`
}

// SpamCheckResponse contains the spam analysis result
type SpamCheckResponse struct {
	EmailID         string              `json:"email_id"`
	Verdict         SpamVerdict         `json:"verdict"`
	Score           float64             `json:"score"`           // 0.0-1.0, higher = more likely spam
	Confidence      float64             `json:"confidence"`      // How certain the system is
	LayerResults    []LayerResult       `json:"layer_results"`
	Factors         []SpamFactor        `json:"factors"`
	SuggestedAction string              `json:"suggested_action"` // deliver, spam_folder, quarantine, reject
	ProcessingTime  time.Duration       `json:"processing_time"`
	Timestamp       time.Time           `json:"timestamp"`
}

// LayerResult contains results from each detection layer
type LayerResult struct {
	Layer       string    `json:"layer"`        // quick, rules, ml, llm
	Score       float64   `json:"score"`
	Passed      bool      `json:"passed"`       // Whether email passed this layer
	Factors     []string  `json:"factors"`
	ProcessTime time.Duration `json:"process_time"`
	Skipped     bool      `json:"skipped,omitempty"`
	SkipReason  string    `json:"skip_reason,omitempty"`
}

// SpamFactor describes a reason for spam classification
type SpamFactor struct {
	Category    string  `json:"category"`     // ip_reputation, spf, dkim, content, url, etc.
	Description string  `json:"description"`
	Weight      float64 `json:"weight"`       // Impact on final score
	Evidence    string  `json:"evidence,omitempty"`
}

// OrgSpamSettings contains organization-level spam settings
type OrgSpamSettings struct {
	OrgID            string       `json:"org_id"`
	Threshold        SpamThreshold `json:"threshold"`         // low, medium, high
	QuarantineAction string       `json:"quarantine_action"` // quarantine, spam_folder, delete
	BlockList        []string     `json:"block_list"`        // Blocked senders/domains
	AllowList        []string     `json:"allow_list"`        // Trusted senders/domains
	EnableLLM        bool         `json:"enable_llm"`        // Use LLM for uncertain cases
	NotifyAdmin      bool         `json:"notify_admin"`      // Notify on threats
	UpdatedAt        time.Time    `json:"updated_at"`
}

// SpamThreshold represents sensitivity level
type SpamThreshold string

const (
	ThresholdLow    SpamThreshold = "low"    // More emails pass through
	ThresholdMedium SpamThreshold = "medium" // Balanced
	ThresholdHigh   SpamThreshold = "high"   // Aggressive filtering
)

// ============================================================
// SERVICE
// ============================================================

// Service provides multi-layer spam detection
type Service struct {
	redis       *redis.Client
	logger      zerolog.Logger
	llmProvider LLMProvider
	mlClassifier MLClassifier

	// Caches
	ipCache       sync.Map // IP -> reputation score
	domainCache   sync.Map // Domain -> reputation score

	// Blacklists (loaded at startup)
	ipBlacklist     map[string]bool
	domainBlacklist map[string]bool
	urlBlacklist    map[string]bool

	// Spam keywords and patterns
	spamKeywords    []string
	urgencyPatterns []*regexp.Regexp
}

// LLMProvider interface for contextual analysis
type LLMProvider interface {
	Analyze(ctx context.Context, prompt string) (string, error)
}

// MLClassifier interface for BERT-based classification
type MLClassifier interface {
	Classify(ctx context.Context, text string) (score float64, confidence float64, err error)
}

// NewService creates a new spam detection service
func NewService(redis *redis.Client, logger zerolog.Logger, llm LLMProvider, ml MLClassifier) *Service {
	s := &Service{
		redis:        redis,
		logger:       logger.With().Str("service", "spam").Logger(),
		llmProvider:  llm,
		mlClassifier: ml,

		ipBlacklist:     make(map[string]bool),
		domainBlacklist: make(map[string]bool),
		urlBlacklist:    make(map[string]bool),

		spamKeywords: defaultSpamKeywords(),
		urgencyPatterns: compileUrgencyPatterns(),
	}

	// Load blacklists in background
	go s.loadBlacklists()

	return s
}

// ============================================================
// MAIN SPAM CHECK
// ============================================================

// CheckSpam performs multi-layer spam detection
func (s *Service) CheckSpam(ctx context.Context, req *SpamCheckRequest) (*SpamCheckResponse, error) {
	start := time.Now()

	// Get org settings
	settings, err := s.getOrgSettings(ctx, req.OrgID)
	if err != nil {
		s.logger.Warn().Err(err).Str("org_id", req.OrgID).Msg("Failed to get org settings, using defaults")
		settings = defaultOrgSettings(req.OrgID)
	}

	// Check allow/block lists first
	if s.isAllowed(req.From.Address, settings.AllowList) {
		return &SpamCheckResponse{
			EmailID:         req.EmailID,
			Verdict:         VerdictHam,
			Score:           0.0,
			Confidence:      1.0,
			SuggestedAction: "deliver",
			ProcessingTime:  time.Since(start),
			Timestamp:       time.Now(),
			Factors: []SpamFactor{{
				Category:    "allowlist",
				Description: "Sender is on organization allow list",
				Weight:      -1.0,
			}},
		}, nil
	}

	if s.isBlocked(req.From.Address, settings.BlockList) {
		return &SpamCheckResponse{
			EmailID:         req.EmailID,
			Verdict:         VerdictSpam,
			Score:           1.0,
			Confidence:      1.0,
			SuggestedAction: settings.QuarantineAction,
			ProcessingTime:  time.Since(start),
			Timestamp:       time.Now(),
			Factors: []SpamFactor{{
				Category:    "blocklist",
				Description: "Sender is on organization block list",
				Weight:      1.0,
			}},
		}, nil
	}

	// Run detection layers
	var layerResults []LayerResult
	var allFactors []SpamFactor
	var totalScore float64
	var layersPassed int

	// Layer 1: Quick checks (IP, SPF, DKIM, blacklists)
	layer1 := s.runQuickLayer(ctx, req)
	layerResults = append(layerResults, layer1)
	allFactors = append(allFactors, s.factorsFromLayer(layer1)...)
	totalScore += layer1.Score * 0.25 // 25% weight
	if layer1.Passed {
		layersPassed++
	}

	// Layer 2: Rule-based analysis
	layer2 := s.runRulesLayer(ctx, req)
	layerResults = append(layerResults, layer2)
	allFactors = append(allFactors, s.factorsFromLayer(layer2)...)
	totalScore += layer2.Score * 0.25 // 25% weight
	if layer2.Passed {
		layersPassed++
	}

	// Layer 3: ML Classification (BERT-based)
	layer3 := s.runMLLayer(ctx, req)
	layerResults = append(layerResults, layer3)
	allFactors = append(allFactors, s.factorsFromLayer(layer3)...)
	totalScore += layer3.Score * 0.35 // 35% weight
	if layer3.Passed {
		layersPassed++
	}

	// Layer 4: LLM contextual analysis (only for uncertain cases)
	threshold := s.getScoreThreshold(settings.Threshold)
	if settings.EnableLLM && totalScore > threshold.Low && totalScore < threshold.High {
		layer4 := s.runLLMLayer(ctx, req)
		layerResults = append(layerResults, layer4)
		allFactors = append(allFactors, s.factorsFromLayer(layer4)...)
		totalScore = (totalScore * 0.85) + (layer4.Score * 0.15) // 15% weight for LLM
		if layer4.Passed {
			layersPassed++
		}
	} else {
		layerResults = append(layerResults, LayerResult{
			Layer:      "llm",
			Skipped:    true,
			SkipReason: "Score outside uncertain range",
		})
	}

	// Determine verdict
	verdict, action := s.determineVerdict(totalScore, settings)
	confidence := s.calculateConfidence(layerResults)

	response := &SpamCheckResponse{
		EmailID:         req.EmailID,
		Verdict:         verdict,
		Score:           totalScore,
		Confidence:      confidence,
		LayerResults:    layerResults,
		Factors:         allFactors,
		SuggestedAction: action,
		ProcessingTime:  time.Since(start),
		Timestamp:       time.Now(),
	}

	// Cache result
	s.cacheResult(ctx, req.EmailID, response)

	// Log for metrics
	s.logger.Info().
		Str("email_id", req.EmailID).
		Str("verdict", string(verdict)).
		Float64("score", totalScore).
		Dur("duration", response.ProcessingTime).
		Msg("Spam check complete")

	return response, nil
}

// ============================================================
// LAYER 1: QUICK CHECKS
// ============================================================

func (s *Service) runQuickLayer(ctx context.Context, req *SpamCheckRequest) LayerResult {
	start := time.Now()
	var score float64
	var factors []string

	// Check IP reputation
	if req.SenderIP != "" {
		ipScore := s.checkIPReputation(ctx, req.SenderIP)
		if ipScore > 0.5 {
			score += ipScore * 0.3
			factors = append(factors, fmt.Sprintf("IP reputation: %.2f", ipScore))
		}

		// Check IP blacklist
		if s.ipBlacklist[req.SenderIP] {
			score += 0.4
			factors = append(factors, "IP is blacklisted")
		}
	}

	// Check SPF
	spfHeader := req.Headers["Received-SPF"]
	if strings.Contains(strings.ToLower(spfHeader), "fail") {
		score += 0.3
		factors = append(factors, "SPF check failed")
	} else if strings.Contains(strings.ToLower(spfHeader), "softfail") {
		score += 0.15
		factors = append(factors, "SPF softfail")
	}

	// Check DKIM
	dkimHeader := req.Headers["DKIM-Signature"]
	authResults := req.Headers["Authentication-Results"]
	if dkimHeader == "" {
		score += 0.1
		factors = append(factors, "No DKIM signature")
	} else if strings.Contains(strings.ToLower(authResults), "dkim=fail") {
		score += 0.3
		factors = append(factors, "DKIM verification failed")
	}

	// Check DMARC
	if strings.Contains(strings.ToLower(authResults), "dmarc=fail") {
		score += 0.25
		factors = append(factors, "DMARC check failed")
	}

	// Check sender domain blacklist
	domain := extractDomain(req.From.Address)
	if s.domainBlacklist[domain] {
		score += 0.5
		factors = append(factors, fmt.Sprintf("Domain %s is blacklisted", domain))
	}

	// Normalize score
	if score > 1.0 {
		score = 1.0
	}

	return LayerResult{
		Layer:       "quick",
		Score:       score,
		Passed:      score < 0.5,
		Factors:     factors,
		ProcessTime: time.Since(start),
	}
}

func (s *Service) checkIPReputation(ctx context.Context, ip string) float64 {
	// Check cache first
	if cached, ok := s.ipCache.Load(ip); ok {
		return cached.(float64)
	}

	// Check Redis cache
	cacheKey := fmt.Sprintf("ip_reputation:%s", ip)
	if cached, err := s.redis.Get(ctx, cacheKey).Float64(); err == nil {
		s.ipCache.Store(ip, cached)
		return cached
	}

	// Perform DNS-based blacklist checks
	var score float64
	dnsblServers := []string{
		"zen.spamhaus.org",
		"bl.spamcop.net",
		"b.barracudacentral.org",
	}

	reversedIP := reverseIP(ip)
	for _, server := range dnsblServers {
		lookup := fmt.Sprintf("%s.%s", reversedIP, server)
		if _, err := net.LookupHost(lookup); err == nil {
			score += 0.4 // Listed in this DNSBL
		}
	}

	if score > 1.0 {
		score = 1.0
	}

	// Cache result
	s.ipCache.Store(ip, score)
	s.redis.Set(ctx, cacheKey, score, 24*time.Hour)

	return score
}

// ============================================================
// LAYER 2: RULE-BASED ANALYSIS
// ============================================================

func (s *Service) runRulesLayer(ctx context.Context, req *SpamCheckRequest) LayerResult {
	start := time.Now()
	var score float64
	var factors []string

	combined := strings.ToLower(req.Subject + " " + req.Body)

	// Check spam keywords
	keywordCount := 0
	for _, keyword := range s.spamKeywords {
		if strings.Contains(combined, keyword) {
			keywordCount++
		}
	}
	if keywordCount > 0 {
		keywordScore := float64(keywordCount) * 0.05
		if keywordScore > 0.4 {
			keywordScore = 0.4
		}
		score += keywordScore
		factors = append(factors, fmt.Sprintf("Found %d spam keywords", keywordCount))
	}

	// Check urgency patterns
	urgencyCount := 0
	for _, pattern := range s.urgencyPatterns {
		if pattern.MatchString(combined) {
			urgencyCount++
		}
	}
	if urgencyCount > 0 {
		urgencyScore := float64(urgencyCount) * 0.08
		if urgencyScore > 0.3 {
			urgencyScore = 0.3
		}
		score += urgencyScore
		factors = append(factors, fmt.Sprintf("Found %d urgency patterns", urgencyCount))
	}

	// Check suspicious URLs
	urls := extractURLs(req.Body + " " + req.HTMLBody)
	suspiciousURLs := s.checkSuspiciousURLs(urls)
	if len(suspiciousURLs) > 0 {
		score += float64(len(suspiciousURLs)) * 0.15
		factors = append(factors, fmt.Sprintf("Found %d suspicious URLs", len(suspiciousURLs)))
	}

	// Check for excessive capitalization
	capsRatio := calculateCapsRatio(req.Subject + " " + req.Body)
	if capsRatio > 0.3 {
		score += 0.1
		factors = append(factors, "Excessive capitalization")
	}

	// Check for suspicious attachments
	for _, att := range req.Attachments {
		if isSuspiciousAttachment(att) {
			score += 0.2
			factors = append(factors, fmt.Sprintf("Suspicious attachment: %s", att.Filename))
		}
	}

	// Check display name vs email mismatch (phishing indicator)
	if s.hasDisplayNameMismatch(req.From) {
		score += 0.2
		factors = append(factors, "Display name doesn't match email domain")
	}

	// Check for empty or minimal content with attachments
	if len(req.Body) < 50 && len(req.Attachments) > 0 {
		score += 0.15
		factors = append(factors, "Minimal body text with attachments")
	}

	// Normalize score
	if score > 1.0 {
		score = 1.0
	}

	return LayerResult{
		Layer:       "rules",
		Score:       score,
		Passed:      score < 0.5,
		Factors:     factors,
		ProcessTime: time.Since(start),
	}
}

func (s *Service) checkSuspiciousURLs(urls []string) []string {
	var suspicious []string

	for _, url := range urls {
		// Check URL blacklist
		domain := extractDomainFromURL(url)
		if s.urlBlacklist[domain] {
			suspicious = append(suspicious, url)
			continue
		}

		// Check for URL shorteners
		shorteners := []string{"bit.ly", "tinyurl", "t.co", "goo.gl", "ow.ly", "is.gd"}
		for _, shortener := range shorteners {
			if strings.Contains(domain, shortener) {
				suspicious = append(suspicious, url)
				break
			}
		}

		// Check for IP-based URLs
		if isIPBasedURL(url) {
			suspicious = append(suspicious, url)
		}

		// Check for suspicious TLDs
		suspiciousTLDs := []string{".xyz", ".top", ".click", ".loan", ".work", ".gq", ".ml"}
		for _, tld := range suspiciousTLDs {
			if strings.HasSuffix(domain, tld) {
				suspicious = append(suspicious, url)
				break
			}
		}
	}

	return suspicious
}

func (s *Service) hasDisplayNameMismatch(from EmailAddress) bool {
	if from.Name == "" {
		return false
	}

	name := strings.ToLower(from.Name)
	email := strings.ToLower(from.Address)

	// Check if display name looks like an email from different domain
	if strings.Contains(name, "@") {
		nameParts := strings.Split(name, "@")
		emailParts := strings.Split(email, "@")
		if len(nameParts) == 2 && len(emailParts) == 2 {
			if nameParts[1] != emailParts[1] {
				return true
			}
		}
	}

	// Check for brand names in display name that don't match domain
	brands := []string{"paypal", "amazon", "microsoft", "apple", "google", "facebook", "netflix", "bank"}
	for _, brand := range brands {
		if strings.Contains(name, brand) && !strings.Contains(email, brand) {
			return true
		}
	}

	return false
}

// ============================================================
// LAYER 3: ML CLASSIFICATION (BERT-BASED)
// ============================================================

func (s *Service) runMLLayer(ctx context.Context, req *SpamCheckRequest) LayerResult {
	start := time.Now()

	if s.mlClassifier == nil {
		return LayerResult{
			Layer:      "ml",
			Skipped:    true,
			SkipReason: "ML classifier not configured",
			ProcessTime: time.Since(start),
		}
	}

	// Prepare text for classification
	text := prepareTextForML(req.Subject, req.Body)

	// Get classification
	score, confidence, err := s.mlClassifier.Classify(ctx, text)
	if err != nil {
		s.logger.Error().Err(err).Msg("ML classification failed")
		return LayerResult{
			Layer:      "ml",
			Skipped:    true,
			SkipReason: err.Error(),
			ProcessTime: time.Since(start),
		}
	}

	var factors []string
	if score > 0.7 {
		factors = append(factors, fmt.Sprintf("ML classifier: high spam probability (%.2f)", score))
	} else if score > 0.4 {
		factors = append(factors, fmt.Sprintf("ML classifier: moderate spam probability (%.2f)", score))
	}

	return LayerResult{
		Layer:       "ml",
		Score:       score,
		Passed:      score < 0.5,
		Factors:     factors,
		ProcessTime: time.Since(start),
	}
}

// ============================================================
// LAYER 4: LLM CONTEXTUAL ANALYSIS
// ============================================================

func (s *Service) runLLMLayer(ctx context.Context, req *SpamCheckRequest) LayerResult {
	start := time.Now()

	if s.llmProvider == nil {
		return LayerResult{
			Layer:      "llm",
			Skipped:    true,
			SkipReason: "LLM provider not configured",
			ProcessTime: time.Since(start),
		}
	}

	prompt := buildLLMSpamPrompt(req)

	response, err := s.llmProvider.Analyze(ctx, prompt)
	if err != nil {
		s.logger.Error().Err(err).Msg("LLM analysis failed")
		return LayerResult{
			Layer:      "llm",
			Skipped:    true,
			SkipReason: err.Error(),
			ProcessTime: time.Since(start),
		}
	}

	// Parse LLM response
	score, factors := parseLLMResponse(response)

	return LayerResult{
		Layer:       "llm",
		Score:       score,
		Passed:      score < 0.5,
		Factors:     factors,
		ProcessTime: time.Since(start),
	}
}

func buildLLMSpamPrompt(req *SpamCheckRequest) string {
	return fmt.Sprintf(`Analyze this email for spam characteristics. Rate spam likelihood from 0.0 (not spam) to 1.0 (definite spam).

From: %s <%s>
Subject: %s

Body (first 500 chars):
%s

Consider:
1. Is the content unsolicited commercial/promotional?
2. Does it contain deceptive or misleading claims?
3. Is there pressure tactics or false urgency?
4. Does it request sensitive information?
5. Is the writing quality indicative of spam?

Respond in JSON format:
{
  "score": 0.0-1.0,
  "reasoning": "brief explanation",
  "factors": ["factor1", "factor2"]
}`,
		req.From.Name,
		req.From.Address,
		req.Subject,
		truncate(req.Body, 500),
	)
}

func parseLLMResponse(response string) (float64, []string) {
	var result struct {
		Score     float64  `json:"score"`
		Reasoning string   `json:"reasoning"`
		Factors   []string `json:"factors"`
	}

	if err := json.Unmarshal([]byte(response), &result); err != nil {
		// Try to extract score from text
		return 0.5, []string{"LLM analysis inconclusive"}
	}

	factors := result.Factors
	if result.Reasoning != "" {
		factors = append(factors, "LLM: "+result.Reasoning)
	}

	return result.Score, factors
}

// ============================================================
// VERDICT DETERMINATION
// ============================================================

type scoreThresholds struct {
	Low    float64
	Medium float64
	High   float64
}

func (s *Service) getScoreThreshold(threshold SpamThreshold) scoreThresholds {
	switch threshold {
	case ThresholdLow:
		return scoreThresholds{Low: 0.6, Medium: 0.75, High: 0.9}
	case ThresholdHigh:
		return scoreThresholds{Low: 0.3, Medium: 0.5, High: 0.7}
	default: // Medium
		return scoreThresholds{Low: 0.4, Medium: 0.6, High: 0.8}
	}
}

func (s *Service) determineVerdict(score float64, settings *OrgSpamSettings) (SpamVerdict, string) {
	thresholds := s.getScoreThreshold(settings.Threshold)

	if score >= thresholds.High {
		return VerdictSpam, settings.QuarantineAction
	} else if score >= thresholds.Medium {
		return VerdictSuspicious, "quarantine"
	} else if score >= thresholds.Low {
		return VerdictSuspicious, "spam_folder"
	}

	return VerdictHam, "deliver"
}

func (s *Service) calculateConfidence(results []LayerResult) float64 {
	var activeCount int
	var agreementScore float64

	var scores []float64
	for _, r := range results {
		if !r.Skipped {
			activeCount++
			scores = append(scores, r.Score)
		}
	}

	if activeCount == 0 {
		return 0.5
	}

	// Calculate variance to determine agreement
	var sum float64
	for _, s := range scores {
		sum += s
	}
	mean := sum / float64(len(scores))

	var variance float64
	for _, s := range scores {
		variance += (s - mean) * (s - mean)
	}
	variance /= float64(len(scores))

	// Lower variance = higher agreement = higher confidence
	agreementScore = 1.0 - (variance * 2)
	if agreementScore < 0.5 {
		agreementScore = 0.5
	}

	return agreementScore
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

func (s *Service) isAllowed(email string, allowList []string) bool {
	email = strings.ToLower(email)
	domain := extractDomain(email)

	for _, entry := range allowList {
		entry = strings.ToLower(entry)
		if entry == email || entry == domain || entry == "@"+domain {
			return true
		}
	}
	return false
}

func (s *Service) isBlocked(email string, blockList []string) bool {
	email = strings.ToLower(email)
	domain := extractDomain(email)

	for _, entry := range blockList {
		entry = strings.ToLower(entry)
		if entry == email || entry == domain || entry == "@"+domain {
			return true
		}
	}
	return false
}

func (s *Service) factorsFromLayer(layer LayerResult) []SpamFactor {
	var factors []SpamFactor
	for _, f := range layer.Factors {
		factors = append(factors, SpamFactor{
			Category:    layer.Layer,
			Description: f,
			Weight:      layer.Score / float64(len(layer.Factors)+1),
		})
	}
	return factors
}

func (s *Service) getOrgSettings(ctx context.Context, orgID string) (*OrgSpamSettings, error) {
	cacheKey := fmt.Sprintf("spam_settings:%s", orgID)

	data, err := s.redis.Get(ctx, cacheKey).Bytes()
	if err == nil {
		var settings OrgSpamSettings
		if json.Unmarshal(data, &settings) == nil {
			return &settings, nil
		}
	}

	// Return defaults if not cached
	return defaultOrgSettings(orgID), nil
}

func (s *Service) cacheResult(ctx context.Context, emailID string, result *SpamCheckResponse) {
	cacheKey := fmt.Sprintf("spam_result:%s", emailID)
	data, _ := json.Marshal(result)
	s.redis.Set(ctx, cacheKey, data, 24*time.Hour)
}

func (s *Service) loadBlacklists() {
	// In production, load from database or external service
	// For now, initialize with common spam sources
	commonSpamDomains := []string{
		"spam.com", "spammer.net", "bulk-mail.com",
	}
	for _, d := range commonSpamDomains {
		s.domainBlacklist[d] = true
	}
}

func defaultOrgSettings(orgID string) *OrgSpamSettings {
	return &OrgSpamSettings{
		OrgID:            orgID,
		Threshold:        ThresholdMedium,
		QuarantineAction: "spam_folder",
		BlockList:        []string{},
		AllowList:        []string{},
		EnableLLM:        true,
		NotifyAdmin:      false,
	}
}

func defaultSpamKeywords() []string {
	return []string{
		"free money", "act now", "limited time", "click here",
		"congratulations", "winner", "lottery", "urgent",
		"password expired", "verify your account", "suspended",
		"nigerian prince", "inheritance", "million dollars",
		"work from home", "make money fast", "no experience needed",
		"viagra", "cialis", "pharmacy", "prescription",
		"unsubscribe", "remove me", "opt out",
	}
}

func compileUrgencyPatterns() []*regexp.Regexp {
	patterns := []string{
		`(?i)urgent[!]*`,
		`(?i)act (now|immediately|fast)`,
		`(?i)limited time (only|offer)`,
		`(?i)expires? (today|soon|in \d+)`,
		`(?i)don'?t miss (out|this)`,
		`(?i)last chance`,
		`(?i)final (notice|warning)`,
		`(?i)immediate (action|response) required`,
		`(?i)your account (will be|has been) (suspended|closed|locked)`,
	}

	var compiled []*regexp.Regexp
	for _, p := range patterns {
		if r, err := regexp.Compile(p); err == nil {
			compiled = append(compiled, r)
		}
	}
	return compiled
}

func extractDomain(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) == 2 {
		return strings.ToLower(parts[1])
	}
	return ""
}

func extractDomainFromURL(url string) string {
	url = strings.TrimPrefix(url, "http://")
	url = strings.TrimPrefix(url, "https://")
	url = strings.TrimPrefix(url, "www.")

	if idx := strings.Index(url, "/"); idx > 0 {
		url = url[:idx]
	}
	if idx := strings.Index(url, "?"); idx > 0 {
		url = url[:idx]
	}

	return strings.ToLower(url)
}

func extractURLs(text string) []string {
	urlPattern := regexp.MustCompile(`https?://[^\s<>"']+`)
	return urlPattern.FindAllString(text, -1)
}

func isIPBasedURL(url string) bool {
	ipPattern := regexp.MustCompile(`https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}`)
	return ipPattern.MatchString(url)
}

func calculateCapsRatio(text string) float64 {
	if len(text) == 0 {
		return 0
	}

	var caps, letters int
	for _, r := range text {
		if r >= 'A' && r <= 'Z' {
			caps++
			letters++
		} else if r >= 'a' && r <= 'z' {
			letters++
		}
	}

	if letters == 0 {
		return 0
	}

	return float64(caps) / float64(letters)
}

func isSuspiciousAttachment(att Attachment) bool {
	suspiciousTypes := []string{
		".exe", ".scr", ".bat", ".cmd", ".com", ".pif",
		".vbs", ".js", ".jar", ".msi", ".dll",
		".zip", ".rar", ".7z", // archives with executables
	}

	filename := strings.ToLower(att.Filename)
	for _, ext := range suspiciousTypes {
		if strings.HasSuffix(filename, ext) {
			return true
		}
	}

	// Double extension trick
	if strings.Contains(filename, ".pdf.") ||
	   strings.Contains(filename, ".doc.") ||
	   strings.Contains(filename, ".xls.") {
		return true
	}

	return false
}

func reverseIP(ip string) string {
	parts := strings.Split(ip, ".")
	if len(parts) != 4 {
		return ip
	}
	return fmt.Sprintf("%s.%s.%s.%s", parts[3], parts[2], parts[1], parts[0])
}

func prepareTextForML(subject, body string) string {
	text := subject + " " + body
	text = strings.ToLower(text)
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// ContentHash generates a hash of email content for deduplication
func ContentHash(subject, body string) string {
	h := sha256.New()
	h.Write([]byte(subject + body))
	return hex.EncodeToString(h.Sum(nil))[:16]
}
