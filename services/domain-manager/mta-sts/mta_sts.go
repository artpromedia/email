package mtasts

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
)

// Mode represents the MTA-STS policy mode
type Mode string

const (
	// ModeEnforce requires TLS for all connections
	ModeEnforce Mode = "enforce"
	// ModeTesting allows monitoring without enforcement
	ModeTesting Mode = "testing"
	// ModeNone disables MTA-STS
	ModeNone Mode = "none"
)

// Policy represents a parsed MTA-STS policy
type Policy struct {
	Version string   // v (required, must be STSv1)
	Mode    Mode     // mode (required)
	MXHosts []string // mx (required, at least one)
	MaxAge  int      // max_age (required, in seconds)
}

// DNSRecord represents the MTA-STS TXT DNS record
type DNSRecord struct {
	Version string // v (required, must be STSv1)
	ID      string // id (required, policy identifier)
}

// VerificationResult contains the result of MTA-STS verification
type VerificationResult struct {
	HasMTASTS       bool
	DNSRecord       *DNSRecord
	Policy          *Policy
	PolicyURL       string
	PolicyValid     bool
	TLSRPTRecord    string
	Errors          []string
	Warnings        []string
	VerifiedAt      time.Time
}

// Verifier handles MTA-STS verification
type Verifier struct {
	logger     *zap.Logger
	httpClient *http.Client
	resolver   *net.Resolver
	timeout    time.Duration
}

// NewVerifier creates a new MTA-STS verifier
func NewVerifier(logger *zap.Logger) *Verifier {
	return &Verifier{
		logger:   logger,
		resolver: net.DefaultResolver,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			// MTA-STS requires valid TLS without following redirects
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		timeout: 10 * time.Second,
	}
}

// Verify performs complete MTA-STS verification for a domain
func (v *Verifier) Verify(ctx context.Context, domain string) *VerificationResult {
	result := &VerificationResult{
		Errors:     make([]string, 0),
		Warnings:   make([]string, 0),
		VerifiedAt: time.Now(),
	}

	// 1. Look up MTA-STS DNS record
	dnsRecord, err := v.LookupDNSRecord(ctx, domain)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("DNS lookup failed: %v", err))
		return result
	}

	if dnsRecord == nil {
		result.Errors = append(result.Errors, "No MTA-STS DNS record found")
		return result
	}

	result.HasMTASTS = true
	result.DNSRecord = dnsRecord

	// 2. Fetch and parse policy from well-known URL
	policyURL := fmt.Sprintf("https://mta-sts.%s/.well-known/mta-sts.txt", domain)
	result.PolicyURL = policyURL

	policy, err := v.FetchPolicy(ctx, policyURL)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Policy fetch failed: %v", err))
		return result
	}

	result.Policy = policy
	result.PolicyValid = true

	// 3. Validate policy
	if errs := v.ValidatePolicy(policy, domain); len(errs) > 0 {
		result.PolicyValid = false
		result.Errors = append(result.Errors, errs...)
	}

	// 4. Look up TLS-RPT record (optional but recommended)
	tlsrpt, err := v.LookupTLSRPT(ctx, domain)
	if err != nil {
		result.Warnings = append(result.Warnings, fmt.Sprintf("TLS-RPT lookup failed: %v", err))
	} else if tlsrpt != "" {
		result.TLSRPTRecord = tlsrpt
	} else {
		result.Warnings = append(result.Warnings, "No TLS-RPT record found (recommended for monitoring)")
	}

	v.logger.Info("MTA-STS verification completed",
		zap.String("domain", domain),
		zap.Bool("has_mta_sts", result.HasMTASTS),
		zap.Bool("policy_valid", result.PolicyValid),
		zap.String("mode", string(policy.Mode)),
		zap.Int("errors", len(result.Errors)))

	return result
}

// LookupDNSRecord looks up the MTA-STS TXT record
func (v *Verifier) LookupDNSRecord(ctx context.Context, domain string) (*DNSRecord, error) {
	recordName := fmt.Sprintf("_mta-sts.%s", domain)

	ctx, cancel := context.WithTimeout(ctx, v.timeout)
	defer cancel()

	txtRecords, err := v.resolver.LookupTXT(ctx, recordName)
	if err != nil {
		return nil, fmt.Errorf("DNS lookup failed: %w", err)
	}

	for _, record := range txtRecords {
		if strings.HasPrefix(record, "v=STSv1") {
			return parseDNSRecord(record)
		}
	}

	return nil, nil
}

// parseDNSRecord parses an MTA-STS DNS TXT record
func parseDNSRecord(record string) (*DNSRecord, error) {
	r := &DNSRecord{}

	tags := strings.Split(record, ";")
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}

		parts := strings.SplitN(tag, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.ToLower(strings.TrimSpace(parts[0]))
		value := strings.TrimSpace(parts[1])

		switch key {
		case "v":
			r.Version = value
		case "id":
			r.ID = value
		}
	}

	if r.Version != "STSv1" {
		return nil, fmt.Errorf("invalid MTA-STS version: %s", r.Version)
	}

	if r.ID == "" {
		return nil, fmt.Errorf("missing required id in MTA-STS record")
	}

	return r, nil
}

// FetchPolicy fetches and parses the MTA-STS policy from the well-known URL
func (v *Verifier) FetchPolicy(ctx context.Context, policyURL string) (*Policy, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", policyURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch policy: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("policy fetch returned status %d", resp.StatusCode)
	}

	// Validate content type
	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "text/plain") {
		return nil, fmt.Errorf("invalid content type: %s (expected text/plain)", contentType)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024)) // 64KB limit
	if err != nil {
		return nil, fmt.Errorf("failed to read policy: %w", err)
	}

	return ParsePolicy(string(body))
}

// ParsePolicy parses an MTA-STS policy text file
func ParsePolicy(content string) (*Policy, error) {
	p := &Policy{
		MXHosts: make([]string, 0),
	}

	scanner := bufio.NewScanner(strings.NewReader(content))
	lineNum := 0

	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid line %d: %s", lineNum, line)
		}

		key := strings.ToLower(strings.TrimSpace(parts[0]))
		value := strings.TrimSpace(parts[1])

		switch key {
		case "version":
			p.Version = value
		case "mode":
			p.Mode = Mode(value)
		case "mx":
			p.MXHosts = append(p.MXHosts, value)
		case "max_age":
			maxAge, err := strconv.Atoi(value)
			if err != nil {
				return nil, fmt.Errorf("invalid max_age: %s", value)
			}
			p.MaxAge = maxAge
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading policy: %w", err)
	}

	// Validate required fields
	if p.Version != "STSv1" {
		return nil, fmt.Errorf("invalid version: %s (expected STSv1)", p.Version)
	}

	if p.Mode == "" {
		return nil, fmt.Errorf("missing required mode")
	}

	if p.Mode != ModeEnforce && p.Mode != ModeTesting && p.Mode != ModeNone {
		return nil, fmt.Errorf("invalid mode: %s", p.Mode)
	}

	if len(p.MXHosts) == 0 {
		return nil, fmt.Errorf("at least one mx host is required")
	}

	if p.MaxAge <= 0 {
		return nil, fmt.Errorf("max_age must be positive")
	}

	return p, nil
}

// ValidatePolicy validates an MTA-STS policy against domain MX records
func (v *Verifier) ValidatePolicy(policy *Policy, domain string) []string {
	errors := make([]string, 0)

	// Look up actual MX records
	ctx, cancel := context.WithTimeout(context.Background(), v.timeout)
	defer cancel()

	mxRecords, err := v.resolver.LookupMX(ctx, domain)
	if err != nil {
		errors = append(errors, fmt.Sprintf("Failed to lookup MX records: %v", err))
		return errors
	}

	// Check that policy mx patterns match actual MX records
	for _, mx := range mxRecords {
		host := strings.TrimSuffix(mx.Host, ".")
		matched := false

		for _, pattern := range policy.MXHosts {
			if matchMXPattern(pattern, host) {
				matched = true
				break
			}
		}

		if !matched {
			errors = append(errors, fmt.Sprintf("MX host %s not covered by policy", host))
		}
	}

	// Validate max_age
	minRecommendedMaxAge := 86400 // 1 day minimum recommended
	if policy.MaxAge < minRecommendedMaxAge {
		errors = append(errors, fmt.Sprintf("max_age %d is less than recommended minimum of %d seconds (1 day)", policy.MaxAge, minRecommendedMaxAge))
	}

	maxRecommendedMaxAge := 31557600 // 1 year maximum recommended
	if policy.MaxAge > maxRecommendedMaxAge {
		errors = append(errors, fmt.Sprintf("max_age %d exceeds recommended maximum of %d seconds (1 year)", policy.MaxAge, maxRecommendedMaxAge))
	}

	return errors
}

// matchMXPattern checks if a host matches an MTA-STS mx pattern
func matchMXPattern(pattern, host string) bool {
	pattern = strings.ToLower(pattern)
	host = strings.ToLower(host)

	// Exact match
	if pattern == host {
		return true
	}

	// Wildcard match (*.example.com)
	if strings.HasPrefix(pattern, "*.") {
		suffix := pattern[1:] // Remove the *
		return strings.HasSuffix(host, suffix)
	}

	return false
}

// LookupTLSRPT looks up the TLS-RPT record for reporting
func (v *Verifier) LookupTLSRPT(ctx context.Context, domain string) (string, error) {
	recordName := fmt.Sprintf("_smtp._tls.%s", domain)

	ctx, cancel := context.WithTimeout(ctx, v.timeout)
	defer cancel()

	txtRecords, err := v.resolver.LookupTXT(ctx, recordName)
	if err != nil {
		return "", err
	}

	for _, record := range txtRecords {
		if strings.HasPrefix(record, "v=TLSRPTv1") {
			return record, nil
		}
	}

	return "", nil
}

// GeneratePolicy generates an MTA-STS policy file content
func GeneratePolicy(mode Mode, mxHosts []string, maxAge int) (string, error) {
	if len(mxHosts) == 0 {
		return "", fmt.Errorf("at least one MX host is required")
	}

	if maxAge <= 0 {
		maxAge = 604800 // Default to 1 week
	}

	var builder strings.Builder
	builder.WriteString("version: STSv1\n")
	builder.WriteString(fmt.Sprintf("mode: %s\n", mode))

	for _, mx := range mxHosts {
		builder.WriteString(fmt.Sprintf("mx: %s\n", mx))
	}

	builder.WriteString(fmt.Sprintf("max_age: %d\n", maxAge))

	return builder.String(), nil
}

// GenerateDNSRecord generates an MTA-STS DNS TXT record
func GenerateDNSRecord(policyID string) string {
	return fmt.Sprintf("v=STSv1; id=%s", policyID)
}

// GeneratePolicyID generates a unique policy ID based on timestamp
func GeneratePolicyID() string {
	return fmt.Sprintf("%d", time.Now().Unix())
}

// GenerateTLSRPTRecord generates a TLS-RPT DNS record
func GenerateTLSRPTRecord(reportingEmail string) (string, error) {
	if reportingEmail == "" {
		return "", fmt.Errorf("reporting email is required")
	}

	// Validate email format
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	if !emailRegex.MatchString(reportingEmail) {
		return "", fmt.Errorf("invalid email format: %s", reportingEmail)
	}

	return fmt.Sprintf("v=TLSRPTv1; rua=mailto:%s", reportingEmail), nil
}

// MTASTSRequirements represents the requirements for MTA-STS deployment
type MTASTSRequirements struct {
	// Technical requirements
	HasValidMX       bool
	HasValidTLS      bool
	MXHosts          []string

	// Configuration
	SuggestedMode    Mode
	SuggestedMaxAge  int
	PolicyID         string

	// Generated records
	DNSRecordName    string
	DNSRecordValue   string
	PolicyURL        string
	PolicyContent    string
	TLSRPTRecordName string
	TLSRPTRecordValue string

	// Summary
	Recommendations  []string
}

// GetMTASTSRequirements calculates the requirements for MTA-STS deployment
func (v *Verifier) GetMTASTSRequirements(ctx context.Context, domain string, primaryMailDomain string, reportingEmail string) (*MTASTSRequirements, error) {
	req := &MTASTSRequirements{
		SuggestedMode:   ModeTesting, // Start with testing mode
		SuggestedMaxAge: 604800,      // 1 week
		PolicyID:        GeneratePolicyID(),
		Recommendations: make([]string, 0),
	}

	// Look up MX records
	mxRecords, err := v.resolver.LookupMX(ctx, domain)
	if err != nil {
		return nil, fmt.Errorf("failed to lookup MX records: %w", err)
	}

	if len(mxRecords) == 0 {
		return nil, fmt.Errorf("no MX records found for domain")
	}

	req.HasValidMX = true
	req.MXHosts = make([]string, 0, len(mxRecords))

	for _, mx := range mxRecords {
		host := strings.TrimSuffix(mx.Host, ".")
		req.MXHosts = append(req.MXHosts, host)
	}

	// Generate DNS record
	req.DNSRecordName = fmt.Sprintf("_mta-sts.%s", domain)
	req.DNSRecordValue = GenerateDNSRecord(req.PolicyID)

	// Generate policy
	req.PolicyURL = fmt.Sprintf("https://mta-sts.%s/.well-known/mta-sts.txt", domain)

	// Use wildcard if all MX hosts share a common domain
	mxPatterns := req.MXHosts
	if primaryMailDomain != "" {
		mxPatterns = []string{fmt.Sprintf("*.%s", primaryMailDomain)}
	}

	policyContent, err := GeneratePolicy(req.SuggestedMode, mxPatterns, req.SuggestedMaxAge)
	if err != nil {
		return nil, fmt.Errorf("failed to generate policy: %w", err)
	}
	req.PolicyContent = policyContent

	// Generate TLS-RPT record if reporting email provided
	if reportingEmail != "" {
		req.TLSRPTRecordName = fmt.Sprintf("_smtp._tls.%s", domain)
		tlsrptRecord, err := GenerateTLSRPTRecord(reportingEmail)
		if err != nil {
			req.Recommendations = append(req.Recommendations, fmt.Sprintf("TLS-RPT generation failed: %v", err))
		} else {
			req.TLSRPTRecordValue = tlsrptRecord
		}
	}

	// Add recommendations
	req.Recommendations = append(req.Recommendations,
		"Start with 'testing' mode to monitor without enforcement",
		"After 1-2 weeks of successful testing, switch to 'enforce' mode",
		"Ensure MTA-STS subdomain has valid TLS certificate",
		"Set up TLS-RPT to receive delivery reports")

	return req, nil
}
