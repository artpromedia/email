package service

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"

	"go.uber.org/zap"

	"domain-manager/config"
	"domain-manager/domain"
)

// stringPtr returns a pointer to a string
func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// DNSService handles DNS lookups and verification
type DNSService struct {
	config *config.DNSConfig
	logger *zap.Logger
}

// NewDNSService creates a new DNS service
func NewDNSService(cfg *config.DNSConfig, logger *zap.Logger) *DNSService {
	return &DNSService{
		config: cfg,
		logger: logger,
	}
}

// GenerateVerificationToken generates a verification token for a domain
func (s *DNSService) GenerateVerificationToken(domainName string) string {
	// Generate a predictable but unique token
	return fmt.Sprintf("%s-verify-%s", s.config.VerificationPrefix, domainName)
}

// GetRequiredDNSRecords returns the required DNS records for a domain
func (s *DNSService) GetRequiredDNSRecords(domainName, verificationToken, dkimSelector, dkimPublicKey string) []domain.DNSRecord {
	records := []domain.DNSRecord{
		{
			Type:    "TXT",
			Name:    domainName,
			Value:   fmt.Sprintf("%s=%s", s.config.VerificationPrefix, verificationToken),
			Purpose: "Domain verification",
		},
		{
			Type:     "MX",
			Name:     domainName,
			Value:    s.config.MXHost,
			Priority: 10,
			Purpose:  "Mail exchange - directs email to mail server",
		},
	}

	// Add SPF record
	spfValue := fmt.Sprintf("v=spf1 include:%s ~all", s.config.SPFInclude)
	if s.config.SPFInclude == "" {
		spfValue = s.config.SPFRecord
	}
	records = append(records, domain.DNSRecord{
		Type:    "TXT",
		Name:    domainName,
		Value:   spfValue,
		Purpose: "SPF record - authorizes mail servers to send on behalf of domain",
	})

	// Add DKIM record if key is provided
	if dkimSelector != "" && dkimPublicKey != "" {
		records = append(records, domain.DNSRecord{
			Type:    "TXT",
			Name:    fmt.Sprintf("%s._domainkey.%s", dkimSelector, domainName),
			Value:   s.formatDKIMRecord(dkimPublicKey),
			Purpose: "DKIM record - signs outgoing emails",
		})
	}

	// Add DMARC record
	records = append(records, domain.DNSRecord{
		Type:    "TXT",
		Name:    fmt.Sprintf("_dmarc.%s", domainName),
		Value:   fmt.Sprintf("v=DMARC1; p=quarantine; rua=mailto:%s; ruf=mailto:%s; fo=1", s.config.DMARCReportEmail, s.config.DMARCReportEmail),
		Purpose: "DMARC record - policy for handling failed authentication",
	})

	return records
}

// formatDKIMRecord formats a DKIM public key as a DNS TXT record value
func (s *DNSService) formatDKIMRecord(publicKey string) string {
	// Remove PEM headers and join lines
	key := strings.ReplaceAll(publicKey, "-----BEGIN PUBLIC KEY-----", "")
	key = strings.ReplaceAll(key, "-----END PUBLIC KEY-----", "")
	key = strings.ReplaceAll(key, "\n", "")
	key = strings.ReplaceAll(key, "\r", "")
	key = strings.TrimSpace(key)

	return fmt.Sprintf("v=DKIM1; k=rsa; p=%s", key)
}

// CheckDNS performs a comprehensive DNS check for a domain
func (s *DNSService) CheckDNS(ctx context.Context, domainName, verificationToken, dkimSelector, dkimPublicKey string) *domain.DNSCheckResult {
	result := &domain.DNSCheckResult{
		Issues:    []domain.DNSIssue{},
		CheckedAt: time.Now(),
	}

	// Check domain verification TXT record (we check but don't store separately - it's part of overall verification)
	verificationPassed := s.checkVerificationTXT(domainName, verificationToken, result)
	_ = verificationPassed // Used for overall domain verification status

	// Check MX records
	result.MXVerified = s.checkMX(domainName, result)

	// Check SPF record
	result.SPFVerified = s.checkSPF(domainName, result)

	// Check DKIM record if selector is provided
	if dkimSelector != "" {
		result.DKIMVerified = s.checkDKIM(domainName, dkimSelector, dkimPublicKey, result)
	} else {
		result.DKIMVerified = false
		result.Issues = append(result.Issues, domain.DNSIssue{
			RecordType: "DKIM",
			Expected:   "DKIM key not configured",
			Found:      nil,
			Message:    "No DKIM key configured for domain. Generate a DKIM key to enable email signing.",
		})
	}

	// Check DMARC record
	result.DMARCVerified = s.checkDMARC(domainName, result)

	return result
}

// checkVerificationTXT checks the domain verification TXT record
func (s *DNSService) checkVerificationTXT(domainName, verificationToken string, result *domain.DNSCheckResult) bool {
	expected := fmt.Sprintf("%s=%s", s.config.VerificationPrefix, verificationToken)

	records, err := net.LookupTXT(domainName)
	if err != nil {
		result.Issues = append(result.Issues, domain.DNSIssue{
			RecordType: "TXT",
			Expected:   expected,
			Found:      nil,
			Message:    fmt.Sprintf("Failed to lookup TXT records: %v", err),
		})
		return false
	}

	for _, record := range records {
		if strings.Contains(record, expected) || record == expected {
			return true
		}
	}

	found := strings.Join(records, ", ")
	result.Issues = append(result.Issues, domain.DNSIssue{
		RecordType: "TXT",
		Expected:   expected,
		Found:      stringPtr(found),
		Message:    "Domain verification TXT record not found",
	})
	return false
}

// checkMX checks MX records
func (s *DNSService) checkMX(domainName string, result *domain.DNSCheckResult) bool {
	mxRecords, err := net.LookupMX(domainName)
	if err != nil {
		result.Issues = append(result.Issues, domain.DNSIssue{
			RecordType: "MX",
			Expected:   s.config.MXHost,
			Found:      nil,
			Message:    fmt.Sprintf("Failed to lookup MX records: %v", err),
		})
		return false
	}

	expectedHost := strings.TrimSuffix(s.config.MXHost, ".") + "."

	for _, mx := range mxRecords {
		host := strings.ToLower(mx.Host)
		if host == expectedHost || strings.TrimSuffix(host, ".") == strings.TrimSuffix(s.config.MXHost, ".") {
			return true
		}
	}

	var found []string
	for _, mx := range mxRecords {
		found = append(found, fmt.Sprintf("%s (priority %d)", mx.Host, mx.Pref))
	}

	foundStr := strings.Join(found, ", ")
	result.Issues = append(result.Issues, domain.DNSIssue{
		RecordType: "MX",
		Expected:   s.config.MXHost,
		Found:      stringPtr(foundStr),
		Message:    "Required MX record not found",
	})
	return false
}

// checkSPF checks SPF record
func (s *DNSService) checkSPF(domainName string, result *domain.DNSCheckResult) bool {
	records, err := net.LookupTXT(domainName)
	if err != nil {
		result.Issues = append(result.Issues, domain.DNSIssue{
			RecordType: "SPF",
			Expected:   "v=spf1 ...",
			Found:      nil,
			Message:    fmt.Sprintf("Failed to lookup TXT records for SPF: %v", err),
		})
		return false
	}

	for _, record := range records {
		if strings.HasPrefix(record, "v=spf1") {
			// If SPFInclude is configured, check for include directive
			if s.config.SPFInclude != "" {
				expected := fmt.Sprintf("include:%s", s.config.SPFInclude)
				if strings.Contains(record, expected) {
					return true
				}
			} else {
				// No include required - just verify an SPF record exists with a policy
				if strings.Contains(record, "all") {
					return true
				}
			}
		}
	}

	var spfRecords []string
	for _, record := range records {
		if strings.HasPrefix(record, "v=spf1") {
			spfRecords = append(spfRecords, record)
		}
	}

	expectedStr := "v=spf1 record with valid policy"
	if s.config.SPFInclude != "" {
		expectedStr = fmt.Sprintf("v=spf1 include:%s ~all", s.config.SPFInclude)
	}

	foundStr := strings.Join(spfRecords, ", ")
	result.Issues = append(result.Issues, domain.DNSIssue{
		RecordType: "SPF",
		Expected:   expectedStr,
		Found:      stringPtr(foundStr),
		Message:    "SPF record missing or does not include required server",
	})
	return false
}

// checkDKIM checks DKIM record
func (s *DNSService) checkDKIM(domainName, selector, publicKey string, result *domain.DNSCheckResult) bool {
	dkimDomain := fmt.Sprintf("%s._domainkey.%s", selector, domainName)

	records, err := net.LookupTXT(dkimDomain)
	if err != nil {
		result.Issues = append(result.Issues, domain.DNSIssue{
			RecordType: "DKIM",
			Expected:   fmt.Sprintf("v=DKIM1; k=rsa; p=<public_key> at %s", dkimDomain),
			Found:      nil,
			Message:    fmt.Sprintf("Failed to lookup DKIM record at %s: %v", dkimDomain, err),
		})
		return false
	}

	for _, record := range records {
		if strings.Contains(record, "v=DKIM1") {
			// Check if the public key matches (simplified check)
			if publicKey != "" {
				// Extract key from record and compare
				keyPart := strings.ReplaceAll(publicKey, "-----BEGIN PUBLIC KEY-----", "")
				keyPart = strings.ReplaceAll(keyPart, "-----END PUBLIC KEY-----", "")
				keyPart = strings.ReplaceAll(keyPart, "\n", "")
				keyPart = strings.TrimSpace(keyPart)

				if strings.Contains(record, keyPart) {
					return true
				}
			} else {
				// Just verify DKIM record exists
				return true
			}
		}
	}

	foundDKIM := strings.Join(records, ", ")
	result.Issues = append(result.Issues, domain.DNSIssue{
		RecordType: "DKIM",
		Expected:   s.formatDKIMRecord(publicKey),
		Found:      stringPtr(foundDKIM),
		Message:    fmt.Sprintf("DKIM record not found or incorrect at %s", dkimDomain),
	})
	return false
}

// checkDMARC checks DMARC record
func (s *DNSService) checkDMARC(domainName string, result *domain.DNSCheckResult) bool {
	dmarcDomain := fmt.Sprintf("_dmarc.%s", domainName)

	records, err := net.LookupTXT(dmarcDomain)
	if err != nil {
		result.Issues = append(result.Issues, domain.DNSIssue{
			RecordType: "DMARC",
			Expected:   "v=DMARC1; p=quarantine; ...",
			Found:      nil,
			Message:    fmt.Sprintf("Failed to lookup DMARC record at %s: %v", dmarcDomain, err),
		})
		return false
	}

	for _, record := range records {
		if strings.HasPrefix(record, "v=DMARC1") {
			// Check for recommended policy settings
			if strings.Contains(record, "p=none") {
				result.Issues = append(result.Issues, domain.DNSIssue{
					RecordType: "DMARC",
					Expected:   "p=quarantine or p=reject",
					Found:      stringPtr(record),
					Message:    "DMARC policy is set to 'none'. Consider upgrading to 'quarantine' or 'reject'.",
				})
			}
			return true
		}
	}

	foundDMARC := strings.Join(records, ", ")
	result.Issues = append(result.Issues, domain.DNSIssue{
		RecordType: "DMARC",
		Expected:   "v=DMARC1; p=quarantine; ...",
		Found:      stringPtr(foundDMARC),
		Message:    "DMARC record not found. Recommended for email authentication.",
	})
	return false
}

// VerifyDomain performs initial domain verification
func (s *DNSService) VerifyDomain(ctx context.Context, domainName, verificationToken string) bool {
	return s.checkVerificationTXT(domainName, verificationToken, &domain.DNSCheckResult{Issues: []domain.DNSIssue{}})
}
