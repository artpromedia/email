// Package phishing provides phishing detection for emails
package phishing

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// ============================================================
// TYPES
// ============================================================

// PhishingVerdict represents the phishing classification
type PhishingVerdict string

const (
	VerdictSafe       PhishingVerdict = "safe"
	VerdictSuspicious PhishingVerdict = "suspicious"
	VerdictPhishing   PhishingVerdict = "phishing"
	VerdictDangerous  PhishingVerdict = "dangerous" // High confidence phishing
)

// PhishingCheckRequest contains email data for phishing analysis
type PhishingCheckRequest struct {
	EmailID     string            `json:"email_id"`
	OrgID       string            `json:"org_id"`
	From        EmailAddress      `json:"from"`
	ReplyTo     *EmailAddress     `json:"reply_to,omitempty"`
	Subject     string            `json:"subject"`
	Body        string            `json:"body"`
	HTMLBody    string            `json:"html_body,omitempty"`
	Headers     map[string]string `json:"headers"`
	URLs        []string          `json:"urls,omitempty"`
	ReceivedAt  time.Time         `json:"received_at"`
}

// EmailAddress represents a sender/recipient
type EmailAddress struct {
	Name    string `json:"name"`
	Address string `json:"address"`
}

// PhishingCheckResponse contains the phishing analysis result
type PhishingCheckResponse struct {
	EmailID          string            `json:"email_id"`
	Verdict          PhishingVerdict   `json:"verdict"`
	Score            float64           `json:"score"`           // 0.0-1.0
	Confidence       float64           `json:"confidence"`
	Threats          []ThreatIndicator `json:"threats"`
	BrandTargeted    string            `json:"brand_targeted,omitempty"`
	LookalikeDetails *LookalikeResult  `json:"lookalike_details,omitempty"`
	URLAnalysis      []URLAnalysis     `json:"url_analysis,omitempty"`
	SuggestedAction  string            `json:"suggested_action"`
	ProcessingTime   time.Duration     `json:"processing_time"`
	Timestamp        time.Time         `json:"timestamp"`
}

// ThreatIndicator describes a specific phishing indicator
type ThreatIndicator struct {
	Type        ThreatType `json:"type"`
	Severity    string     `json:"severity"` // low, medium, high, critical
	Description string     `json:"description"`
	Evidence    string     `json:"evidence,omitempty"`
	Score       float64    `json:"score"`
}

// ThreatType categorizes phishing indicators
type ThreatType string

const (
	ThreatLookalikeDomain    ThreatType = "lookalike_domain"
	ThreatDisplayNameSpoof   ThreatType = "display_name_spoof"
	ThreatBrandImpersonation ThreatType = "brand_impersonation"
	ThreatUrgencyLanguage    ThreatType = "urgency_language"
	ThreatSuspiciousURL      ThreatType = "suspicious_url"
	ThreatCredentialRequest  ThreatType = "credential_request"
	ThreatReplyToMismatch    ThreatType = "reply_to_mismatch"
	ThreatHomograph          ThreatType = "homograph_attack"
)

// LookalikeResult contains lookalike domain analysis
type LookalikeResult struct {
	OriginalDomain   string   `json:"original_domain"`
	TargetBrand      string   `json:"target_brand"`
	SimilarityScore  float64  `json:"similarity_score"`
	Techniques       []string `json:"techniques"` // typosquat, homograph, etc.
	LegitimateTarget string   `json:"legitimate_target,omitempty"`
}

// URLAnalysis contains analysis of a single URL
type URLAnalysis struct {
	URL              string   `json:"url"`
	DisplayText      string   `json:"display_text,omitempty"`
	Domain           string   `json:"domain"`
	IsSuspicious     bool     `json:"is_suspicious"`
	Reasons          []string `json:"reasons"`
	RedirectsTo      string   `json:"redirects_to,omitempty"`
	IsShortener      bool     `json:"is_shortener"`
	IsMismatch       bool     `json:"is_mismatch"` // Display text vs actual URL
	TargetBrand      string   `json:"target_brand,omitempty"`
}

// ============================================================
// SERVICE
// ============================================================

// Service provides phishing detection
type Service struct {
	redis       *redis.Client
	logger      zerolog.Logger
	llmProvider LLMProvider

	// Brand protection data
	brandDomains    map[string][]string // brand -> legitimate domains
	brandKeywords   map[string][]string // brand -> keywords

	// Lookalike detection
	confusables     map[rune][]rune     // Unicode confusables

	// Caches
	domainCache     sync.Map
	urlCache        sync.Map

	// Patterns
	credentialPatterns []*regexp.Regexp
	urgencyPatterns    []*regexp.Regexp
}

// LLMProvider interface for contextual analysis
type LLMProvider interface {
	Analyze(ctx context.Context, prompt string) (string, error)
}

// NewService creates a new phishing detection service
func NewService(redis *redis.Client, logger zerolog.Logger, llm LLMProvider) *Service {
	s := &Service{
		redis:       redis,
		logger:      logger.With().Str("service", "phishing").Logger(),
		llmProvider: llm,

		brandDomains:  initBrandDomains(),
		brandKeywords: initBrandKeywords(),
		confusables:   initConfusables(),

		credentialPatterns: compileCredentialPatterns(),
		urgencyPatterns:    compilePhishingUrgencyPatterns(),
	}

	return s
}

// ============================================================
// MAIN PHISHING CHECK
// ============================================================

// CheckPhishing performs comprehensive phishing detection
func (s *Service) CheckPhishing(ctx context.Context, req *PhishingCheckRequest) (*PhishingCheckResponse, error) {
	start := time.Now()

	var threats []ThreatIndicator
	var totalScore float64
	var brandTargeted string
	var lookalikeDetails *LookalikeResult

	// 1. Check lookalike domain
	lookalike, brand := s.checkLookalikeDomain(req.From.Address)
	if lookalike != nil {
		lookalikeDetails = lookalike
		brandTargeted = brand
		threats = append(threats, ThreatIndicator{
			Type:        ThreatLookalikeDomain,
			Severity:    "high",
			Description: fmt.Sprintf("Domain resembles %s", brand),
			Evidence:    fmt.Sprintf("Techniques: %v", lookalike.Techniques),
			Score:       lookalike.SimilarityScore,
		})
		totalScore += lookalike.SimilarityScore * 0.4
	}

	// 2. Check display name vs email mismatch
	if threat := s.checkDisplayNameMismatch(req.From); threat != nil {
		threats = append(threats, *threat)
		totalScore += threat.Score * 0.2
		if brandTargeted == "" && threat.Evidence != "" {
			brandTargeted = threat.Evidence
		}
	}

	// 3. Check reply-to mismatch
	if req.ReplyTo != nil {
		if threat := s.checkReplyToMismatch(req.From, *req.ReplyTo); threat != nil {
			threats = append(threats, *threat)
			totalScore += threat.Score * 0.15
		}
	}

	// 4. Check urgency language
	urgencyThreats := s.checkUrgencyLanguage(req.Subject, req.Body)
	for _, t := range urgencyThreats {
		threats = append(threats, t)
		totalScore += t.Score * 0.1
	}

	// 5. Analyze URLs
	urls := req.URLs
	if len(urls) == 0 {
		urls = extractURLsFromHTML(req.HTMLBody)
		if len(urls) == 0 {
			urls = extractURLs(req.Body)
		}
	}

	urlAnalysis := s.analyzeURLs(ctx, urls, req.HTMLBody)
	for _, ua := range urlAnalysis {
		if ua.IsSuspicious {
			severity := "medium"
			if ua.IsMismatch || ua.TargetBrand != "" {
				severity = "high"
			}
			threats = append(threats, ThreatIndicator{
				Type:        ThreatSuspiciousURL,
				Severity:    severity,
				Description: fmt.Sprintf("Suspicious URL: %s", ua.Domain),
				Evidence:    strings.Join(ua.Reasons, "; "),
				Score:       0.3,
			})
			totalScore += 0.15
			if brandTargeted == "" && ua.TargetBrand != "" {
				brandTargeted = ua.TargetBrand
			}
		}
	}

	// 6. Check for credential harvesting language
	credThreats := s.checkCredentialRequests(req.Subject, req.Body)
	for _, t := range credThreats {
		threats = append(threats, t)
		totalScore += t.Score * 0.15
	}

	// 7. Check brand impersonation
	if impersonation := s.checkBrandImpersonation(req.From, req.Subject, req.Body); impersonation != nil {
		threats = append(threats, *impersonation)
		totalScore += impersonation.Score * 0.25
		if brandTargeted == "" {
			brandTargeted = impersonation.Evidence
		}
	}

	// Normalize score
	if totalScore > 1.0 {
		totalScore = 1.0
	}

	// Determine verdict
	verdict, action := s.determineVerdict(totalScore, threats)
	confidence := s.calculateConfidence(threats)

	response := &PhishingCheckResponse{
		EmailID:          req.EmailID,
		Verdict:          verdict,
		Score:            totalScore,
		Confidence:       confidence,
		Threats:          threats,
		BrandTargeted:    brandTargeted,
		LookalikeDetails: lookalikeDetails,
		URLAnalysis:      urlAnalysis,
		SuggestedAction:  action,
		ProcessingTime:   time.Since(start),
		Timestamp:        time.Now(),
	}

	// Cache result
	s.cacheResult(ctx, req.EmailID, response)

	s.logger.Info().
		Str("email_id", req.EmailID).
		Str("verdict", string(verdict)).
		Float64("score", totalScore).
		Int("threats", len(threats)).
		Msg("Phishing check complete")

	return response, nil
}

// ============================================================
// LOOKALIKE DOMAIN DETECTION
// ============================================================

func (s *Service) checkLookalikeDomain(email string) (*LookalikeResult, string) {
	domain := extractDomain(email)
	if domain == "" {
		return nil, ""
	}

	var bestMatch *LookalikeResult
	var bestBrand string
	var highestScore float64

	for brand, legitimateDomains := range s.brandDomains {
		for _, legit := range legitimateDomains {
			if domain == legit {
				// Exact match with legitimate domain
				return nil, ""
			}

			score, techniques := s.calculateDomainSimilarity(domain, legit)
			if score > 0.7 && score > highestScore {
				highestScore = score
				bestBrand = brand
				bestMatch = &LookalikeResult{
					OriginalDomain:   domain,
					TargetBrand:      brand,
					SimilarityScore:  score,
					Techniques:       techniques,
					LegitimateTarget: legit,
				}
			}
		}
	}

	return bestMatch, bestBrand
}

func (s *Service) calculateDomainSimilarity(suspect, legitimate string) (float64, []string) {
	var techniques []string
	var totalScore float64

	// Normalize domains
	suspect = strings.ToLower(suspect)
	legitimate = strings.ToLower(legitimate)

	// Check for exact homograph attack (Unicode confusables)
	if s.isHomograph(suspect, legitimate) {
		techniques = append(techniques, "homograph")
		totalScore += 0.9
	}

	// Check for typosquatting
	typoScore, typoType := s.checkTyposquatting(suspect, legitimate)
	if typoScore > 0.5 {
		techniques = append(techniques, typoType)
		totalScore += typoScore * 0.8
	}

	// Check for number substitution (e.g., paypa1.com)
	if s.hasNumberSubstitution(suspect, legitimate) {
		techniques = append(techniques, "number_substitution")
		totalScore += 0.85
	}

	// Check for wrong TLD (e.g., paypal.net vs paypal.com)
	if s.isWrongTLD(suspect, legitimate) {
		techniques = append(techniques, "wrong_tld")
		totalScore += 0.75
	}

	// Check for extra characters (e.g., paypal-secure.com)
	if s.hasExtraCharacters(suspect, legitimate) {
		techniques = append(techniques, "extra_characters")
		totalScore += 0.7
	}

	// Check for subdomain spoofing (e.g., paypal.attacker.com)
	if s.isSubdomainSpoof(suspect, legitimate) {
		techniques = append(techniques, "subdomain_spoof")
		totalScore += 0.8
	}

	// Normalize final score
	if totalScore > 1.0 {
		totalScore = 1.0
	}

	return totalScore, techniques
}

func (s *Service) isHomograph(suspect, legitimate string) bool {
	// Convert suspect to ASCII equivalent
	normalized := s.normalizeHomographs(suspect)
	return normalized == legitimate
}

func (s *Service) normalizeHomographs(domain string) string {
	var result strings.Builder
	for _, r := range domain {
		if replacements, ok := s.confusables[r]; ok && len(replacements) > 0 {
			result.WriteRune(replacements[0]) // Use first ASCII equivalent
		} else {
			result.WriteRune(r)
		}
	}
	return result.String()
}

func (s *Service) checkTyposquatting(suspect, legitimate string) (float64, string) {
	// Remove TLD for comparison
	suspectBase := strings.Split(suspect, ".")[0]
	legitBase := strings.Split(legitimate, ".")[0]

	distance := levenshteinDistance(suspectBase, legitBase)

	if distance == 1 {
		// Single character difference
		if len(suspectBase) == len(legitBase) {
			return 0.9, "character_swap"
		} else if len(suspectBase) > len(legitBase) {
			return 0.85, "character_insertion"
		} else {
			return 0.85, "character_deletion"
		}
	} else if distance == 2 {
		return 0.7, "double_typo"
	}

	return 0, ""
}

func (s *Service) hasNumberSubstitution(suspect, legitimate string) bool {
	// Common substitutions: o->0, l->1, e->3, a->4, s->5
	substitutions := map[rune]rune{
		'0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's',
	}

	normalized := strings.Map(func(r rune) rune {
		if replacement, ok := substitutions[r]; ok {
			return replacement
		}
		return r
	}, suspect)

	return strings.Split(normalized, ".")[0] == strings.Split(legitimate, ".")[0]
}

func (s *Service) isWrongTLD(suspect, legitimate string) bool {
	suspectParts := strings.Split(suspect, ".")
	legitParts := strings.Split(legitimate, ".")

	if len(suspectParts) < 2 || len(legitParts) < 2 {
		return false
	}

	// Same base domain, different TLD
	return suspectParts[0] == legitParts[0] &&
	       suspectParts[len(suspectParts)-1] != legitParts[len(legitParts)-1]
}

func (s *Service) hasExtraCharacters(suspect, legitimate string) bool {
	legitBase := strings.Split(legitimate, ".")[0]
	suspectBase := strings.Split(suspect, ".")[0]

	// Check for appended words like -secure, -login, -verify
	extras := []string{"-secure", "-login", "-verify", "-account", "-update", "-support", "-service"}
	for _, extra := range extras {
		if suspectBase == legitBase+extra || suspectBase == extra[1:]+"-"+legitBase {
			return true
		}
	}

	return false
}

func (s *Service) isSubdomainSpoof(suspect, legitimate string) bool {
	legitBase := strings.Split(legitimate, ".")[0]

	// Check if legitimate brand appears as subdomain
	parts := strings.Split(suspect, ".")
	for i := 0; i < len(parts)-1; i++ {
		if parts[i] == legitBase {
			return true
		}
	}

	return false
}

// ============================================================
// DISPLAY NAME & REPLY-TO CHECKS
// ============================================================

func (s *Service) checkDisplayNameMismatch(from EmailAddress) *ThreatIndicator {
	if from.Name == "" {
		return nil
	}

	name := strings.ToLower(from.Name)
	email := strings.ToLower(from.Address)
	domain := extractDomain(email)

	// Check if display name contains an email address
	if strings.Contains(name, "@") {
		nameParts := strings.Split(name, "@")
		if len(nameParts) == 2 && nameParts[1] != domain {
			return &ThreatIndicator{
				Type:        ThreatDisplayNameSpoof,
				Severity:    "high",
				Description: "Display name contains different email domain",
				Evidence:    fmt.Sprintf("Name: %s, Actual: %s", from.Name, from.Address),
				Score:       0.8,
			}
		}
	}

	// Check for brand names in display name
	for brand, domains := range s.brandDomains {
		brandLower := strings.ToLower(brand)
		if strings.Contains(name, brandLower) {
			// Check if email is from legitimate domain
			isLegit := false
			for _, d := range domains {
				if domain == d {
					isLegit = true
					break
				}
			}
			if !isLegit {
				return &ThreatIndicator{
					Type:        ThreatDisplayNameSpoof,
					Severity:    "high",
					Description: fmt.Sprintf("Display name claims to be %s but email domain doesn't match", brand),
					Evidence:    brand,
					Score:       0.85,
				}
			}
		}
	}

	return nil
}

func (s *Service) checkReplyToMismatch(from, replyTo EmailAddress) *ThreatIndicator {
	fromDomain := extractDomain(from.Address)
	replyDomain := extractDomain(replyTo.Address)

	if fromDomain == "" || replyDomain == "" {
		return nil
	}

	// Different domains is suspicious
	if fromDomain != replyDomain {
		severity := "medium"
		score := 0.4

		// Check if reply-to uses free email service (very suspicious)
		freeEmailDomains := []string{"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "protonmail.com"}
		for _, free := range freeEmailDomains {
			if replyDomain == free && fromDomain != free {
				severity = "high"
				score = 0.7
				break
			}
		}

		return &ThreatIndicator{
			Type:        ThreatReplyToMismatch,
			Severity:    severity,
			Description: "Reply-To address uses different domain than sender",
			Evidence:    fmt.Sprintf("From: %s, Reply-To: %s", fromDomain, replyDomain),
			Score:       score,
		}
	}

	return nil
}

// ============================================================
// URGENCY & CREDENTIAL REQUEST DETECTION
// ============================================================

func (s *Service) checkUrgencyLanguage(subject, body string) []ThreatIndicator {
	var threats []ThreatIndicator
	combined := strings.ToLower(subject + " " + body)

	urgencyPhrases := []struct {
		pattern  string
		severity string
		score    float64
	}{
		{`your account (has been|will be) (suspended|closed|terminated)`, "high", 0.7},
		{`(immediate|urgent) action required`, "high", 0.6},
		{`verify your (account|identity|information) (now|immediately|within)`, "high", 0.65},
		{`(failure to|if you don't|unless you) (respond|verify|confirm)`, "medium", 0.5},
		{`(security alert|unusual activity|suspicious login)`, "medium", 0.4},
		{`your (password|credentials) (expired|will expire)`, "medium", 0.5},
		{`(limited time|act now|expires in \d+)`, "low", 0.3},
		{`(final notice|last warning|final reminder)`, "medium", 0.45},
	}

	for _, phrase := range urgencyPhrases {
		pattern := regexp.MustCompile(`(?i)` + phrase.pattern)
		if matches := pattern.FindAllString(combined, -1); len(matches) > 0 {
			threats = append(threats, ThreatIndicator{
				Type:        ThreatUrgencyLanguage,
				Severity:    phrase.severity,
				Description: "Email contains urgency/pressure language",
				Evidence:    matches[0],
				Score:       phrase.score,
			})
		}
	}

	return threats
}

func (s *Service) checkCredentialRequests(subject, body string) []ThreatIndicator {
	var threats []ThreatIndicator
	combined := strings.ToLower(subject + " " + body)

	credentialPhrases := []struct {
		pattern  string
		severity string
		score    float64
	}{
		{`enter (your )?(password|pin|ssn|social security)`, "critical", 0.9},
		{`(confirm|verify|update) your (password|login|credentials)`, "high", 0.75},
		{`click (here|the link|below) to (verify|confirm|login)`, "high", 0.6},
		{`(sign in|log in) to (verify|confirm|secure)`, "medium", 0.5},
		{`(bank|credit card|account) (number|details|information)`, "high", 0.7},
		{`(reset|change) your password`, "medium", 0.4},
	}

	for _, phrase := range credentialPhrases {
		pattern := regexp.MustCompile(`(?i)` + phrase.pattern)
		if matches := pattern.FindAllString(combined, -1); len(matches) > 0 {
			threats = append(threats, ThreatIndicator{
				Type:        ThreatCredentialRequest,
				Severity:    phrase.severity,
				Description: "Email requests credential or sensitive information",
				Evidence:    matches[0],
				Score:       phrase.score,
			})
		}
	}

	return threats
}

// ============================================================
// URL ANALYSIS
// ============================================================

func (s *Service) analyzeURLs(ctx context.Context, urls []string, htmlBody string) []URLAnalysis {
	var results []URLAnalysis

	// Extract URL-to-display-text mappings from HTML
	displayTextMap := extractURLDisplayText(htmlBody)

	for _, url := range urls {
		analysis := URLAnalysis{
			URL:    url,
			Domain: extractDomainFromURL(url),
		}

		// Check display text mismatch
		if displayText, ok := displayTextMap[url]; ok {
			analysis.DisplayText = displayText
			if s.isURLDisplayMismatch(url, displayText) {
				analysis.IsMismatch = true
				analysis.IsSuspicious = true
				analysis.Reasons = append(analysis.Reasons, "Display text doesn't match actual URL")
			}
		}

		// Check for URL shorteners
		shorteners := []string{"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly"}
		for _, shortener := range shorteners {
			if strings.Contains(analysis.Domain, shortener) {
				analysis.IsShortener = true
				analysis.IsSuspicious = true
				analysis.Reasons = append(analysis.Reasons, "URL shortener used")
				break
			}
		}

		// Check for IP-based URLs
		if isIPBasedURL(url) {
			analysis.IsSuspicious = true
			analysis.Reasons = append(analysis.Reasons, "IP address instead of domain")
		}

		// Check for suspicious TLDs
		suspiciousTLDs := []string{".xyz", ".top", ".click", ".loan", ".work", ".gq", ".ml", ".tk", ".cf"}
		for _, tld := range suspiciousTLDs {
			if strings.HasSuffix(analysis.Domain, tld) {
				analysis.IsSuspicious = true
				analysis.Reasons = append(analysis.Reasons, "Suspicious TLD")
				break
			}
		}

		// Check for brand impersonation in URL
		for brand, domains := range s.brandDomains {
			brandLower := strings.ToLower(brand)
			if strings.Contains(strings.ToLower(analysis.Domain), brandLower) {
				isLegit := false
				for _, d := range domains {
					if analysis.Domain == d || strings.HasSuffix(analysis.Domain, "."+d) {
						isLegit = true
						break
					}
				}
				if !isLegit {
					analysis.IsSuspicious = true
					analysis.TargetBrand = brand
					analysis.Reasons = append(analysis.Reasons, fmt.Sprintf("Impersonates %s", brand))
				}
			}
		}

		// Check for punycode/IDN homograph
		if strings.HasPrefix(analysis.Domain, "xn--") {
			analysis.IsSuspicious = true
			analysis.Reasons = append(analysis.Reasons, "Internationalized domain (potential homograph)")
		}

		// Check for excessive subdomains
		if strings.Count(analysis.Domain, ".") > 3 {
			analysis.IsSuspicious = true
			analysis.Reasons = append(analysis.Reasons, "Excessive subdomains")
		}

		results = append(results, analysis)
	}

	return results
}

func (s *Service) isURLDisplayMismatch(url, displayText string) bool {
	// If display text looks like a URL, check if it matches
	if strings.HasPrefix(displayText, "http://") || strings.HasPrefix(displayText, "https://") {
		displayDomain := extractDomainFromURL(displayText)
		urlDomain := extractDomainFromURL(url)
		return displayDomain != urlDomain
	}

	// Check if display text contains a brand but URL doesn't match brand's domain
	displayLower := strings.ToLower(displayText)
	for brand, domains := range s.brandDomains {
		if strings.Contains(displayLower, strings.ToLower(brand)) {
			urlDomain := extractDomainFromURL(url)
			for _, d := range domains {
				if urlDomain == d || strings.HasSuffix(urlDomain, "."+d) {
					return false
				}
			}
			return true
		}
	}

	return false
}

// ============================================================
// BRAND IMPERSONATION
// ============================================================

func (s *Service) checkBrandImpersonation(from EmailAddress, subject, body string) *ThreatIndicator {
	combined := strings.ToLower(subject + " " + body)
	domain := extractDomain(from.Address)

	for brand, keywords := range s.brandKeywords {
		// Check if email mentions brand-specific terms
		mentionCount := 0
		for _, keyword := range keywords {
			if strings.Contains(combined, strings.ToLower(keyword)) {
				mentionCount++
			}
		}

		if mentionCount >= 2 { // Multiple brand mentions
			// Check if sender is from legitimate domain
			legitDomains := s.brandDomains[brand]
			isLegit := false
			for _, d := range legitDomains {
				if domain == d {
					isLegit = true
					break
				}
			}

			if !isLegit {
				return &ThreatIndicator{
					Type:        ThreatBrandImpersonation,
					Severity:    "high",
					Description: fmt.Sprintf("Email appears to impersonate %s", brand),
					Evidence:    brand,
					Score:       0.7,
				}
			}
		}
	}

	return nil
}

// ============================================================
// VERDICT DETERMINATION
// ============================================================

func (s *Service) determineVerdict(score float64, threats []ThreatIndicator) (PhishingVerdict, string) {
	// Check for critical threats
	for _, t := range threats {
		if t.Severity == "critical" {
			return VerdictDangerous, "block"
		}
	}

	// Count high severity threats
	highCount := 0
	for _, t := range threats {
		if t.Severity == "high" {
			highCount++
		}
	}

	if score >= 0.8 || highCount >= 3 {
		return VerdictPhishing, "quarantine"
	} else if score >= 0.5 || highCount >= 1 {
		return VerdictSuspicious, "warn"
	} else if score >= 0.3 {
		return VerdictSuspicious, "label"
	}

	return VerdictSafe, "deliver"
}

func (s *Service) calculateConfidence(threats []ThreatIndicator) float64 {
	if len(threats) == 0 {
		return 0.9 // High confidence it's safe
	}

	// More diverse threats = higher confidence in phishing verdict
	typeSet := make(map[ThreatType]bool)
	for _, t := range threats {
		typeSet[t.Type] = true
	}

	diversity := float64(len(typeSet)) / 8.0 // 8 possible threat types
	avgSeverity := 0.0
	for _, t := range threats {
		switch t.Severity {
		case "critical":
			avgSeverity += 1.0
		case "high":
			avgSeverity += 0.8
		case "medium":
			avgSeverity += 0.5
		case "low":
			avgSeverity += 0.3
		}
	}
	avgSeverity /= float64(len(threats))

	return (diversity*0.4 + avgSeverity*0.6)
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

func (s *Service) cacheResult(ctx context.Context, emailID string, result *PhishingCheckResponse) {
	cacheKey := fmt.Sprintf("phishing_result:%s", emailID)
	data, _ := json.Marshal(result)
	s.redis.Set(ctx, cacheKey, data, 24*time.Hour)
}

func initBrandDomains() map[string][]string {
	return map[string][]string{
		"PayPal":    {"paypal.com", "paypal.me"},
		"Amazon":    {"amazon.com", "amazon.co.uk", "amazon.de", "amazon.ca", "aws.amazon.com"},
		"Microsoft": {"microsoft.com", "outlook.com", "office.com", "live.com", "hotmail.com"},
		"Apple":     {"apple.com", "icloud.com", "me.com"},
		"Google":    {"google.com", "gmail.com", "youtube.com", "googleapis.com"},
		"Facebook":  {"facebook.com", "fb.com", "meta.com", "instagram.com"},
		"Netflix":   {"netflix.com"},
		"Dropbox":   {"dropbox.com"},
		"LinkedIn":  {"linkedin.com"},
		"Twitter":   {"twitter.com", "x.com"},
		"Chase":     {"chase.com", "jpmorganchase.com"},
		"Wells Fargo": {"wellsfargo.com"},
		"Bank of America": {"bankofamerica.com", "bofa.com"},
		"Citibank":  {"citi.com", "citibank.com"},
	}
}

func initBrandKeywords() map[string][]string {
	return map[string][]string{
		"PayPal":    {"paypal", "payment", "transaction", "invoice", "receipt"},
		"Amazon":    {"amazon", "prime", "order", "delivery", "package", "aws"},
		"Microsoft": {"microsoft", "office", "outlook", "teams", "windows", "azure"},
		"Apple":     {"apple", "iphone", "ipad", "icloud", "app store", "itunes"},
		"Google":    {"google", "gmail", "drive", "chrome", "android"},
		"Facebook":  {"facebook", "meta", "instagram", "messenger"},
		"Netflix":   {"netflix", "streaming", "subscription", "membership"},
		"Chase":     {"chase", "checking", "savings", "credit card"},
		"Wells Fargo": {"wells fargo", "banking", "mortgage"},
	}
}

func initConfusables() map[rune][]rune {
	// Unicode characters that look like ASCII letters
	return map[rune][]rune{
		'а': {'a'}, // Cyrillic
		'е': {'e'},
		'о': {'o'},
		'р': {'p'},
		'с': {'c'},
		'х': {'x'},
		'ѕ': {'s'},
		'і': {'i'},
		'ј': {'j'},
		'ԁ': {'d'},
		'ԝ': {'w'},
		'ɡ': {'g'},
		'ʏ': {'y'},
		'ᴠ': {'v'},
		'ℓ': {'l'},
		'ⅰ': {'i'},
		'ⅿ': {'m'},
	}
}

func compileCredentialPatterns() []*regexp.Regexp {
	patterns := []string{
		`(?i)(enter|provide|confirm|verify)\s+(your\s+)?(password|pin|ssn|cvv)`,
		`(?i)(update|verify)\s+your\s+(account|billing|payment)\s+information`,
		`(?i)sign\s+in\s+to\s+(confirm|verify|secure)`,
	}

	var compiled []*regexp.Regexp
	for _, p := range patterns {
		if r, err := regexp.Compile(p); err == nil {
			compiled = append(compiled, r)
		}
	}
	return compiled
}

func compilePhishingUrgencyPatterns() []*regexp.Regexp {
	patterns := []string{
		`(?i)(immediate|urgent)\s+action\s+required`,
		`(?i)your\s+account\s+(has\s+been|will\s+be)\s+(suspended|closed|terminated)`,
		`(?i)(verify|confirm)\s+your\s+(identity|account)\s+(now|immediately|within)`,
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
	if idx := strings.Index(url, ":"); idx > 0 {
		url = url[:idx]
	}

	return strings.ToLower(url)
}

func extractURLs(text string) []string {
	urlPattern := regexp.MustCompile(`https?://[^\s<>"'\]]+`)
	return urlPattern.FindAllString(text, -1)
}

func extractURLsFromHTML(html string) []string {
	hrefPattern := regexp.MustCompile(`href=["']([^"']+)["']`)
	matches := hrefPattern.FindAllStringSubmatch(html, -1)

	var urls []string
	for _, m := range matches {
		if len(m) > 1 && strings.HasPrefix(m[1], "http") {
			urls = append(urls, m[1])
		}
	}
	return urls
}

func extractURLDisplayText(html string) map[string]string {
	// Extract <a href="url">display text</a>
	pattern := regexp.MustCompile(`<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)</a>`)
	matches := pattern.FindAllStringSubmatch(html, -1)

	result := make(map[string]string)
	for _, m := range matches {
		if len(m) > 2 {
			result[m[1]] = strings.TrimSpace(m[2])
		}
	}
	return result
}

func isIPBasedURL(url string) bool {
	ipPattern := regexp.MustCompile(`https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}`)
	return ipPattern.MatchString(url)
}

func levenshteinDistance(a, b string) int {
	if len(a) == 0 {
		return len(b)
	}
	if len(b) == 0 {
		return len(a)
	}

	// Create distance matrix
	matrix := make([][]int, len(a)+1)
	for i := range matrix {
		matrix[i] = make([]int, len(b)+1)
		matrix[i][0] = i
	}
	for j := range matrix[0] {
		matrix[0][j] = j
	}

	// Fill matrix
	for i := 1; i <= len(a); i++ {
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			matrix[i][j] = min(
				matrix[i-1][j]+1,      // deletion
				matrix[i][j-1]+1,      // insertion
				matrix[i-1][j-1]+cost, // substitution
			)
		}
	}

	return matrix[len(a)][len(b)]
}

func min(values ...int) int {
	m := values[0]
	for _, v := range values[1:] {
		if v < m {
			m = v
		}
	}
	return m
}

// IsUnicodeConfusable checks if a character could be confused with ASCII
func IsUnicodeConfusable(r rune) bool {
	// Check if it's a non-ASCII character that looks like ASCII
	if r > 127 {
		// Check Latin Extended, Cyrillic, Greek ranges that contain lookalikes
		return unicode.Is(unicode.Cyrillic, r) ||
			unicode.Is(unicode.Greek, r) ||
			(r >= 0x1D00 && r <= 0x1DBF) || // Phonetic extensions
			(r >= 0x2100 && r <= 0x214F)    // Letterlike symbols
	}
	return false
}
