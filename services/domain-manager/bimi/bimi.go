package bimi

import (
	"context"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"go.uber.org/zap"
)

// Record represents a parsed BIMI record
type Record struct {
	Version       string // v (required, must be BIMI1)
	Location      string // l (required, SVG logo URL)
	Authority     string // a (optional, VMC certificate URL)
	Selector      string // s (optional, selector used)
	OriginalValue string // The raw DNS record
}

// VMCCertificate represents a Verified Mark Certificate
type VMCCertificate struct {
	Subject      string
	Issuer       string
	ValidFrom    time.Time
	ValidTo      time.Time
	LogoHash     string
	SerialNumber string
	IsValid      bool
}

// VerificationResult contains the result of BIMI verification
type VerificationResult struct {
	HasBIMI         bool
	Record          *Record
	LogoURL         string
	LogoValid       bool
	LogoContentType string
	VMC             *VMCCertificate
	VMCValid        bool
	Errors          []string
	VerifiedAt      time.Time
}

// Verifier handles BIMI record verification
type Verifier struct {
	logger     *zap.Logger
	httpClient *http.Client
	resolver   *net.Resolver
	timeout    time.Duration
}

// NewVerifier creates a new BIMI verifier
func NewVerifier(logger *zap.Logger) *Verifier {
	return &Verifier{
		logger:   logger,
		resolver: net.DefaultResolver,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return fmt.Errorf("too many redirects")
				}
				return nil
			},
		},
		timeout: 10 * time.Second,
	}
}

// Verify performs complete BIMI verification for a domain
func (v *Verifier) Verify(ctx context.Context, domain string, selector string) *VerificationResult {
	result := &VerificationResult{
		Errors:     make([]string, 0),
		VerifiedAt: time.Now(),
	}

	if selector == "" {
		selector = "default"
	}

	// 1. Look up BIMI record
	record, err := v.LookupBIMI(ctx, domain, selector)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("BIMI lookup failed: %v", err))
		return result
	}

	if record == nil {
		result.Errors = append(result.Errors, "No BIMI record found")
		return result
	}

	result.HasBIMI = true
	result.Record = record
	result.LogoURL = record.Location

	// 2. Validate logo URL and format
	if record.Location != "" {
		logoValid, contentType, logoErr := v.ValidateLogo(ctx, record.Location)
		result.LogoValid = logoValid
		result.LogoContentType = contentType
		if logoErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("Logo validation failed: %v", logoErr))
		}
	}

	// 3. Validate VMC certificate if present
	if record.Authority != "" {
		vmc, vmcErr := v.ValidateVMC(ctx, record.Authority, domain)
		result.VMC = vmc
		if vmcErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("VMC validation failed: %v", vmcErr))
		} else if vmc != nil {
			result.VMCValid = vmc.IsValid
		}
	}

	v.logger.Info("BIMI verification completed",
		zap.String("domain", domain),
		zap.String("selector", selector),
		zap.Bool("has_bimi", result.HasBIMI),
		zap.Bool("logo_valid", result.LogoValid),
		zap.Bool("vmc_valid", result.VMCValid),
		zap.Int("errors", len(result.Errors)))

	return result
}

// LookupBIMI looks up and parses the BIMI record for a domain
func (v *Verifier) LookupBIMI(ctx context.Context, domain string, selector string) (*Record, error) {
	if selector == "" {
		selector = "default"
	}

	bimiDomain := fmt.Sprintf("%s._bimi.%s", selector, domain)

	v.logger.Debug("Looking up BIMI record",
		zap.String("domain", domain),
		zap.String("selector", selector),
		zap.String("query", bimiDomain))

	ctx, cancel := context.WithTimeout(ctx, v.timeout)
	defer cancel()

	txtRecords, err := v.resolver.LookupTXT(ctx, bimiDomain)
	if err != nil {
		// Try without selector if default fails
		if selector == "default" {
			return nil, fmt.Errorf("no BIMI record found: %w", err)
		}
		// Fall back to default selector
		return v.LookupBIMI(ctx, domain, "default")
	}

	for _, record := range txtRecords {
		if strings.HasPrefix(record, "v=BIMI1") {
			parsed, err := ParseBIMIRecord(record)
			if err != nil {
				return nil, err
			}
			parsed.Selector = selector
			return parsed, nil
		}
	}

	return nil, nil
}

// ParseBIMIRecord parses a BIMI TXT record
func ParseBIMIRecord(record string) (*Record, error) {
	r := &Record{
		OriginalValue: record,
	}

	// BIMI record format: v=BIMI1; l=<logo_url>; a=<vmc_url>
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
		case "l":
			r.Location = value
		case "a":
			r.Authority = value
		}
	}

	// Validate required fields
	if r.Version != "BIMI1" {
		return nil, fmt.Errorf("invalid BIMI version: %s (expected BIMI1)", r.Version)
	}

	if r.Location == "" {
		return nil, fmt.Errorf("missing required location (l=) in BIMI record")
	}

	// Validate URL format
	if !strings.HasPrefix(r.Location, "https://") {
		return nil, fmt.Errorf("BIMI logo URL must use HTTPS: %s", r.Location)
	}

	return r, nil
}

// ValidateLogo validates the BIMI logo at the specified URL
func (v *Verifier) ValidateLogo(ctx context.Context, logoURL string) (bool, string, error) {
	// Validate URL format
	if !strings.HasPrefix(logoURL, "https://") {
		return false, "", fmt.Errorf("logo URL must use HTTPS")
	}

	// Make request with context
	req, err := http.NewRequestWithContext(ctx, "GET", logoURL, nil)
	if err != nil {
		return false, "", fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return false, "", fmt.Errorf("failed to fetch logo: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, "", fmt.Errorf("logo fetch returned status %d", resp.StatusCode)
	}

	contentType := resp.Header.Get("Content-Type")

	// BIMI requires SVG Tiny PS format
	if !strings.Contains(contentType, "image/svg+xml") {
		return false, contentType, fmt.Errorf("invalid content type: %s (expected image/svg+xml)", contentType)
	}

	// Read and validate SVG content
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024)) // 1MB limit
	if err != nil {
		return false, contentType, fmt.Errorf("failed to read logo content: %w", err)
	}

	// Basic SVG validation
	if !v.isValidSVG(body) {
		return false, contentType, fmt.Errorf("invalid SVG content")
	}

	// Check for BIMI-required attributes (SVG Tiny PS)
	if !v.isValidBIMISVG(body) {
		return false, contentType, fmt.Errorf("SVG does not meet BIMI Tiny PS requirements")
	}

	v.logger.Debug("BIMI logo validated",
		zap.String("url", logoURL),
		zap.String("content_type", contentType),
		zap.Int("size", len(body)))

	return true, contentType, nil
}

// isValidSVG checks if content is valid SVG
func (v *Verifier) isValidSVG(content []byte) bool {
	s := string(content)
	return strings.Contains(s, "<svg") && strings.Contains(s, "</svg>")
}

// isValidBIMISVG checks if SVG meets BIMI Tiny PS requirements
func (v *Verifier) isValidBIMISVG(content []byte) bool {
	s := string(content)

	// Must have svg namespace
	if !strings.Contains(s, "xmlns=\"http://www.w3.org/2000/svg\"") &&
		!strings.Contains(s, "xmlns='http://www.w3.org/2000/svg'") {
		return false
	}

	// Should have title element for accessibility
	if !strings.Contains(s, "<title>") {
		v.logger.Warn("BIMI SVG missing <title> element (recommended)")
	}

	// Check for forbidden elements (scripts, animations)
	forbiddenPatterns := []string{
		"<script",
		"<animate",
		"<animateMotion",
		"<animateTransform",
		"<set",
		"onclick",
		"onload",
		"onerror",
	}

	for _, pattern := range forbiddenPatterns {
		if strings.Contains(strings.ToLower(s), strings.ToLower(pattern)) {
			v.logger.Warn("BIMI SVG contains forbidden element",
				zap.String("element", pattern))
			return false
		}
	}

	return true
}

// ValidateVMC validates a Verified Mark Certificate
func (v *Verifier) ValidateVMC(ctx context.Context, vmcURL string, domain string) (*VMCCertificate, error) {
	if !strings.HasPrefix(vmcURL, "https://") {
		return nil, fmt.Errorf("VMC URL must use HTTPS")
	}

	req, err := http.NewRequestWithContext(ctx, "GET", vmcURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create VMC request: %w", err)
	}

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch VMC: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("VMC fetch returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 100*1024)) // 100KB limit
	if err != nil {
		return nil, fmt.Errorf("failed to read VMC content: %w", err)
	}

	// Parse PEM certificate
	block, _ := pem.Decode(body)
	if block == nil {
		return nil, fmt.Errorf("failed to decode VMC PEM")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse VMC certificate: %w", err)
	}

	vmc := &VMCCertificate{
		Subject:      cert.Subject.CommonName,
		Issuer:       cert.Issuer.CommonName,
		ValidFrom:    cert.NotBefore,
		ValidTo:      cert.NotAfter,
		SerialNumber: cert.SerialNumber.String(),
		IsValid:      true,
	}

	// Check validity period
	now := time.Now()
	if now.Before(cert.NotBefore) {
		vmc.IsValid = false
		return vmc, fmt.Errorf("VMC certificate not yet valid")
	}
	if now.After(cert.NotAfter) {
		vmc.IsValid = false
		return vmc, fmt.Errorf("VMC certificate expired")
	}

	// Verify certificate is for the domain
	if err := cert.VerifyHostname(domain); err != nil {
		// Check DNS names
		domainMatch := false
		for _, dnsName := range cert.DNSNames {
			if dnsName == domain || matchWildcard(dnsName, domain) {
				domainMatch = true
				break
			}
		}
		if !domainMatch {
			vmc.IsValid = false
			return vmc, fmt.Errorf("VMC certificate does not match domain %s", domain)
		}
	}

	v.logger.Info("VMC validated successfully",
		zap.String("domain", domain),
		zap.String("issuer", vmc.Issuer),
		zap.Time("valid_until", vmc.ValidTo))

	return vmc, nil
}

// matchWildcard checks if a wildcard pattern matches a domain
func matchWildcard(pattern, domain string) bool {
	if !strings.HasPrefix(pattern, "*.") {
		return pattern == domain
	}
	suffix := pattern[1:] // Remove the *
	return strings.HasSuffix(domain, suffix)
}

// GenerateBIMIRecord generates a BIMI DNS record
func GenerateBIMIRecord(logoURL string, vmcURL string) (string, error) {
	if logoURL == "" {
		return "", fmt.Errorf("logo URL is required")
	}

	if !strings.HasPrefix(logoURL, "https://") {
		return "", fmt.Errorf("logo URL must use HTTPS")
	}

	record := fmt.Sprintf("v=BIMI1; l=%s", logoURL)

	if vmcURL != "" {
		if !strings.HasPrefix(vmcURL, "https://") {
			return "", fmt.Errorf("VMC URL must use HTTPS")
		}
		record += fmt.Sprintf("; a=%s", vmcURL)
	}

	return record, nil
}

// GenerateBIMIDNSEntry generates the complete DNS entry for BIMI
func GenerateBIMIDNSEntry(domain, selector, logoURL, vmcURL string) (name string, value string, err error) {
	if selector == "" {
		selector = "default"
	}

	name = fmt.Sprintf("%s._bimi.%s", selector, domain)

	value, err = GenerateBIMIRecord(logoURL, vmcURL)
	if err != nil {
		return "", "", err
	}

	return name, value, nil
}

// BIMIRequirements represents the requirements for BIMI
type BIMIRequirements struct {
	// Prerequisite checks
	HasDMARC           bool
	DMARCPolicy        string
	DMARCPolicyValid   bool // p=quarantine or p=reject
	HasDKIM            bool
	HasSPF             bool

	// BIMI specific
	LogoURL            string
	LogoValid          bool
	VMCRequired        bool // For Gmail and some providers
	VMCURL             string
	VMCValid           bool

	// Summary
	CanUseBIMI         bool
	CanUseBIMIWithVMC  bool
	Recommendations    []string
}

// ValidBIMIPolicyRegex matches valid DMARC policies for BIMI
var ValidBIMIPolicyRegex = regexp.MustCompile(`p=(quarantine|reject)`)

// CheckBIMIRequirements checks if a domain meets BIMI requirements
func (v *Verifier) CheckBIMIRequirements(ctx context.Context, domain string, dmarcRecord string, hasDKIM bool, hasSPF bool) *BIMIRequirements {
	req := &BIMIRequirements{
		HasDMARC:        dmarcRecord != "",
		HasDKIM:         hasDKIM,
		HasSPF:          hasSPF,
		Recommendations: make([]string, 0),
	}

	// Check DMARC policy
	if dmarcRecord != "" {
		if match := ValidBIMIPolicyRegex.FindStringSubmatch(dmarcRecord); len(match) > 1 {
			req.DMARCPolicy = match[1]
			req.DMARCPolicyValid = true
		} else {
			req.Recommendations = append(req.Recommendations,
				"DMARC policy must be 'quarantine' or 'reject' for BIMI")
		}
	} else {
		req.Recommendations = append(req.Recommendations,
			"DMARC record is required for BIMI")
	}

	// Check other requirements
	if !hasDKIM {
		req.Recommendations = append(req.Recommendations,
			"DKIM signing must be configured for BIMI")
	}

	if !hasSPF {
		req.Recommendations = append(req.Recommendations,
			"SPF record is recommended for BIMI")
	}

	// Determine if BIMI can be used
	req.CanUseBIMI = req.DMARCPolicyValid && hasDKIM
	req.VMCRequired = true // Gmail and most major providers require VMC

	if req.CanUseBIMI {
		req.Recommendations = append(req.Recommendations,
			"Domain is eligible for BIMI. A Verified Mark Certificate (VMC) is recommended for Gmail and other major providers.")
	}

	return req
}
