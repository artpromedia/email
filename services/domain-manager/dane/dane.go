package dane

import (
	"context"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
)

// CertificateUsage represents the TLSA certificate usage field
type CertificateUsage uint8

const (
	// PKIX-TA (0): CA constraint - certificate must chain to a trusted CA
	UsagePKIXTA CertificateUsage = 0
	// PKIX-EE (1): Service certificate constraint - must match end entity cert
	UsagePKIXEE CertificateUsage = 1
	// DANE-TA (2): Trust anchor assertion - use specified cert as trust anchor
	UsageDANETA CertificateUsage = 2
	// DANE-EE (3): Domain-issued certificate - accept cert from domain
	UsageDANEEE CertificateUsage = 3
)

// Selector represents the TLSA selector field
type Selector uint8

const (
	// SelectorFullCert (0): Match full certificate
	SelectorFullCert Selector = 0
	// SelectorSPKI (1): Match SubjectPublicKeyInfo
	SelectorSPKI Selector = 1
)

// MatchingType represents the TLSA matching type field
type MatchingType uint8

const (
	// MatchExact (0): Exact match of certificate or SPKI
	MatchExact MatchingType = 0
	// MatchSHA256 (1): SHA-256 hash
	MatchSHA256 MatchingType = 1
	// MatchSHA512 (2): SHA-512 hash
	MatchSHA512 MatchingType = 2
)

// TLSARecord represents a parsed TLSA record
type TLSARecord struct {
	CertUsage    CertificateUsage
	Selector     Selector
	MatchingType MatchingType
	Certificate  string // Hex-encoded certificate data or hash
	TTL          uint32
}

// VerificationResult contains the result of DANE verification
type VerificationResult struct {
	HasDANE          bool
	TLSARecords      []TLSARecord
	CertificateValid bool
	ChainValid       bool
	Errors           []string
	Warnings         []string
	VerifiedAt       time.Time
}

// Verifier handles DANE/TLSA verification
type Verifier struct {
	logger   *zap.Logger
	resolver *net.Resolver
	timeout  time.Duration
}

// NewVerifier creates a new DANE verifier
func NewVerifier(logger *zap.Logger) *Verifier {
	return &Verifier{
		logger:   logger,
		resolver: net.DefaultResolver,
		timeout:  10 * time.Second,
	}
}

// Verify performs DANE verification for a domain's SMTP service
func (v *Verifier) Verify(ctx context.Context, domain string, port int, cert *x509.Certificate) *VerificationResult {
	result := &VerificationResult{
		Errors:     make([]string, 0),
		Warnings:   make([]string, 0),
		VerifiedAt: time.Now(),
	}

	if port == 0 {
		port = 25 // Default SMTP port
	}

	// Look up TLSA records
	records, err := v.LookupTLSA(ctx, domain, port)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("TLSA lookup failed: %v", err))
		return result
	}

	if len(records) == 0 {
		result.Warnings = append(result.Warnings, "No TLSA records found")
		return result
	}

	result.HasDANE = true
	result.TLSARecords = records

	// Verify certificate against TLSA records if provided
	if cert != nil {
		valid, err := v.VerifyCertificate(cert, records)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("Certificate verification failed: %v", err))
		} else {
			result.CertificateValid = valid
		}
	}

	v.logger.Info("DANE verification completed",
		zap.String("domain", domain),
		zap.Int("port", port),
		zap.Bool("has_dane", result.HasDANE),
		zap.Int("tlsa_records", len(result.TLSARecords)),
		zap.Bool("cert_valid", result.CertificateValid))

	return result
}

// LookupTLSA looks up TLSA records for a domain/port combination
func (v *Verifier) LookupTLSA(ctx context.Context, domain string, port int) ([]TLSARecord, error) {
	// TLSA record format: _port._protocol.domain
	tlsaName := fmt.Sprintf("_%d._tcp.%s", port, domain)

	v.logger.Debug("Looking up TLSA records",
		zap.String("domain", domain),
		zap.Int("port", port),
		zap.String("query", tlsaName))

	ctx, cancel := context.WithTimeout(ctx, v.timeout)
	defer cancel()

	// Note: Go's standard library doesn't directly support TLSA lookups
	// We use TXT as a fallback for testing, but in production you'd use
	// a DNS library that supports TLSA (like miekg/dns)
	txtRecords, err := v.resolver.LookupTXT(ctx, tlsaName)
	if err != nil {
		// Check for specific DNS errors
		if dnsErr, ok := err.(*net.DNSError); ok {
			if dnsErr.IsNotFound {
				return nil, nil // No TLSA records is not an error
			}
		}
		return nil, fmt.Errorf("DNS lookup failed: %w", err)
	}

	var records []TLSARecord
	for _, txt := range txtRecords {
		record, err := ParseTLSARecord(txt)
		if err != nil {
			v.logger.Warn("Failed to parse TLSA record",
				zap.String("record", txt),
				zap.Error(err))
			continue
		}
		records = append(records, *record)
	}

	return records, nil
}

// ParseTLSARecord parses a TLSA record from its string representation
// Format: "usage selector matchingType certificateData"
func ParseTLSARecord(record string) (*TLSARecord, error) {
	parts := strings.Fields(record)
	if len(parts) < 4 {
		return nil, fmt.Errorf("invalid TLSA record format: expected 4 parts, got %d", len(parts))
	}

	usage, err := strconv.ParseUint(parts[0], 10, 8)
	if err != nil {
		return nil, fmt.Errorf("invalid usage field: %w", err)
	}

	selector, err := strconv.ParseUint(parts[1], 10, 8)
	if err != nil {
		return nil, fmt.Errorf("invalid selector field: %w", err)
	}

	matchingType, err := strconv.ParseUint(parts[2], 10, 8)
	if err != nil {
		return nil, fmt.Errorf("invalid matching type field: %w", err)
	}

	// Validate fields
	if usage > 3 {
		return nil, fmt.Errorf("invalid usage value: %d (must be 0-3)", usage)
	}
	if selector > 1 {
		return nil, fmt.Errorf("invalid selector value: %d (must be 0-1)", selector)
	}
	if matchingType > 2 {
		return nil, fmt.Errorf("invalid matching type value: %d (must be 0-2)", matchingType)
	}

	// Certificate data (may span multiple parts if split)
	certData := strings.Join(parts[3:], "")
	certData = strings.ToLower(certData)

	// Validate hex encoding
	if _, err := hex.DecodeString(certData); err != nil {
		return nil, fmt.Errorf("invalid certificate data (not valid hex): %w", err)
	}

	return &TLSARecord{
		CertUsage:    CertificateUsage(usage),
		Selector:     Selector(selector),
		MatchingType: MatchingType(matchingType),
		Certificate:  certData,
	}, nil
}

// VerifyCertificate verifies a certificate against TLSA records
func (v *Verifier) VerifyCertificate(cert *x509.Certificate, records []TLSARecord) (bool, error) {
	if cert == nil {
		return false, fmt.Errorf("no certificate provided")
	}

	for _, record := range records {
		match, err := v.matchRecord(cert, &record)
		if err != nil {
			v.logger.Warn("Error matching TLSA record",
				zap.Error(err))
			continue
		}
		if match {
			return true, nil
		}
	}

	return false, nil
}

// matchRecord checks if a certificate matches a TLSA record
func (v *Verifier) matchRecord(cert *x509.Certificate, record *TLSARecord) (bool, error) {
	var data []byte

	// Get the data to match based on selector
	switch record.Selector {
	case SelectorFullCert:
		data = cert.Raw
	case SelectorSPKI:
		data = cert.RawSubjectPublicKeyInfo
	default:
		return false, fmt.Errorf("unsupported selector: %d", record.Selector)
	}

	// Compute hash or use raw data based on matching type
	var compareData string
	switch record.MatchingType {
	case MatchExact:
		compareData = hex.EncodeToString(data)
	case MatchSHA256:
		hash := sha256.Sum256(data)
		compareData = hex.EncodeToString(hash[:])
	case MatchSHA512:
		hash := sha512.Sum512(data)
		compareData = hex.EncodeToString(hash[:])
	default:
		return false, fmt.Errorf("unsupported matching type: %d", record.MatchingType)
	}

	return strings.EqualFold(compareData, record.Certificate), nil
}

// GenerateTLSARecord generates a TLSA record for a certificate
func GenerateTLSARecord(cert *x509.Certificate, usage CertificateUsage, selector Selector, matchingType MatchingType) (string, error) {
	if cert == nil {
		return "", fmt.Errorf("no certificate provided")
	}

	var data []byte
	switch selector {
	case SelectorFullCert:
		data = cert.Raw
	case SelectorSPKI:
		data = cert.RawSubjectPublicKeyInfo
	default:
		return "", fmt.Errorf("unsupported selector: %d", selector)
	}

	var certData string
	switch matchingType {
	case MatchExact:
		certData = hex.EncodeToString(data)
	case MatchSHA256:
		hash := sha256.Sum256(data)
		certData = hex.EncodeToString(hash[:])
	case MatchSHA512:
		hash := sha512.Sum512(data)
		certData = hex.EncodeToString(hash[:])
	default:
		return "", fmt.Errorf("unsupported matching type: %d", matchingType)
	}

	return fmt.Sprintf("%d %d %d %s", usage, selector, matchingType, certData), nil
}

// GenerateTLSADNSEntry generates a complete TLSA DNS entry
func GenerateTLSADNSEntry(domain string, port int, cert *x509.Certificate, usage CertificateUsage, selector Selector, matchingType MatchingType) (name string, value string, err error) {
	name = fmt.Sprintf("_%d._tcp.%s", port, domain)

	value, err = GenerateTLSARecord(cert, usage, selector, matchingType)
	if err != nil {
		return "", "", err
	}

	return name, value, nil
}

// ParsePEMCertificate parses a PEM-encoded certificate
func ParsePEMCertificate(pemData []byte) (*x509.Certificate, error) {
	block, _ := pem.Decode(pemData)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	if block.Type != "CERTIFICATE" {
		return nil, fmt.Errorf("PEM block is not a certificate: %s", block.Type)
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse certificate: %w", err)
	}

	return cert, nil
}

// DANERequirements represents the requirements for DANE deployment
type DANERequirements struct {
	// DNSSEC is required for DANE
	HasDNSSEC bool
	// TLSA records configuration
	RecommendedUsage       CertificateUsage
	RecommendedSelector    Selector
	RecommendedMatchingType MatchingType
	// Generated records
	SMTPTLSARecordName  string
	SMTPTLSARecordValue string
	// Recommendations
	Recommendations []string
}

// GetDANERequirements calculates the requirements for DANE deployment
func (v *Verifier) GetDANERequirements(domain string, port int, cert *x509.Certificate) (*DANERequirements, error) {
	req := &DANERequirements{
		// DANE-EE (3) is recommended for end-entity certificates
		RecommendedUsage: UsageDANEEE,
		// SPKI is recommended (more stable across certificate renewals)
		RecommendedSelector: SelectorSPKI,
		// SHA-256 is recommended
		RecommendedMatchingType: MatchSHA256,
		Recommendations:         make([]string, 0),
	}

	if port == 0 {
		port = 25
	}

	req.SMTPTLSARecordName = fmt.Sprintf("_%d._tcp.%s", port, domain)

	if cert != nil {
		tlsaValue, err := GenerateTLSARecord(cert, req.RecommendedUsage, req.RecommendedSelector, req.RecommendedMatchingType)
		if err != nil {
			return nil, fmt.Errorf("failed to generate TLSA record: %w", err)
		}
		req.SMTPTLSARecordValue = tlsaValue
	}

	// Add recommendations
	req.Recommendations = append(req.Recommendations,
		"DNSSEC must be enabled for the domain before deploying DANE",
		"Use DANE-EE (3) with SPKI selector for best compatibility",
		"Update TLSA records BEFORE rotating certificates",
		"Consider publishing TLSA records for port 25 (SMTP) and 465 (SMTPS)",
		"Monitor DANE validation using tools like dane.sys4.de or dnsviz.net")

	return req, nil
}

// UsageString returns a human-readable string for the certificate usage
func (u CertificateUsage) String() string {
	switch u {
	case UsagePKIXTA:
		return "PKIX-TA (CA Constraint)"
	case UsagePKIXEE:
		return "PKIX-EE (Service Certificate Constraint)"
	case UsageDANETA:
		return "DANE-TA (Trust Anchor Assertion)"
	case UsageDANEEE:
		return "DANE-EE (Domain-Issued Certificate)"
	default:
		return fmt.Sprintf("Unknown (%d)", u)
	}
}

// SelectorString returns a human-readable string for the selector
func (s Selector) String() string {
	switch s {
	case SelectorFullCert:
		return "Full Certificate"
	case SelectorSPKI:
		return "SubjectPublicKeyInfo"
	default:
		return fmt.Sprintf("Unknown (%d)", s)
	}
}

// MatchingTypeString returns a human-readable string for the matching type
func (m MatchingType) String() string {
	switch m {
	case MatchExact:
		return "Exact Match"
	case MatchSHA256:
		return "SHA-256"
	case MatchSHA512:
		return "SHA-512"
	default:
		return fmt.Sprintf("Unknown (%d)", m)
	}
}
