package dns

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"net"
	"strings"
	"time"

	"go.uber.org/zap"
)

// Verifier handles DNS verification for domains
type Verifier struct {
	logger          *zap.Logger
	primaryDomain   string
	verificationTTL time.Duration
}

// NewVerifier creates a new DNS verifier
func NewVerifier(logger *zap.Logger, primaryDomain string) *Verifier {
	return &Verifier{
		logger:          logger,
		primaryDomain:   primaryDomain,
		verificationTTL: 5 * time.Minute,
	}
}

// VerificationRecord represents the expected DNS record
type VerificationRecord struct {
	Type  string
	Name  string
	Value string
}

// VerificationResult contains the result of DNS verification
type VerificationResult struct {
	Verified       bool
	MXRecords      []string
	SPFRecord      string
	DKIMRecord     string
	DMARCRecord    string
	Errors         []string
	VerifiedAt     time.Time
	MissingRecords []string
}

// GenerateVerificationToken generates a verification token for a domain
func (v *Verifier) GenerateVerificationToken(domain string) string {
	hash := md5.Sum([]byte(domain))
	return hex.EncodeToString(hash[:])
}

// VerifyOwnership verifies domain ownership via TXT record
func (v *Verifier) VerifyOwnership(ctx context.Context, domain string) (bool, error) {
	expectedToken := v.GenerateVerificationToken(domain)
	recordName := fmt.Sprintf("_mail-verification.%s", domain)

	v.logger.Info("Verifying domain ownership",
		zap.String("domain", domain),
		zap.String("record", recordName),
	)

	txtRecords, err := net.LookupTXT(recordName)
	if err != nil {
		v.logger.Warn("Failed to lookup verification record",
			zap.String("domain", domain),
			zap.Error(err),
		)
		return false, fmt.Errorf("verification record not found: %w", err)
	}

	// Check if any TXT record matches our token
	for _, record := range txtRecords {
		if strings.Contains(record, fmt.Sprintf("mail-verification=%s", expectedToken)) {
			v.logger.Info("Domain ownership verified",
				zap.String("domain", domain),
			)
			return true, nil
		}
	}

	return false, fmt.Errorf("verification token mismatch")
}

// VerifyMXRecords checks if MX records point to our mail server
func (v *Verifier) VerifyMXRecords(ctx context.Context, domain string) ([]string, error) {
	v.logger.Info("Verifying MX records", zap.String("domain", domain))

	mxRecords, err := net.LookupMX(domain)
	if err != nil {
		return nil, fmt.Errorf("failed to lookup MX records: %w", err)
	}

	if len(mxRecords) == 0 {
		return nil, fmt.Errorf("no MX records found")
	}

	records := make([]string, 0, len(mxRecords))
	validRecord := false

	for _, mx := range mxRecords {
		host := strings.TrimSuffix(mx.Host, ".")
		records = append(records, fmt.Sprintf("%d %s", mx.Pref, host))

		// Check if MX points to our mail server
		if strings.HasSuffix(host, v.primaryDomain) {
			validRecord = true
		}
	}

	if !validRecord {
		return records, fmt.Errorf("MX records do not point to %s", v.primaryDomain)
	}

	v.logger.Info("MX records verified",
		zap.String("domain", domain),
		zap.Strings("records", records),
	)

	return records, nil
}

// VerifySPF checks SPF record
func (v *Verifier) VerifySPF(ctx context.Context, domain string) (string, error) {
	v.logger.Info("Verifying SPF record", zap.String("domain", domain))

	txtRecords, err := net.LookupTXT(domain)
	if err != nil {
		return "", fmt.Errorf("failed to lookup TXT records: %w", err)
	}

	for _, record := range txtRecords {
		if strings.HasPrefix(record, "v=spf1") {
			// Check if it includes our domain
			if strings.Contains(record, fmt.Sprintf("include:spf.%s", v.primaryDomain)) ||
				strings.Contains(record, fmt.Sprintf("include:%s", v.primaryDomain)) {
				v.logger.Info("SPF record verified",
					zap.String("domain", domain),
					zap.String("record", record),
				)
				return record, nil
			}
			return record, fmt.Errorf("SPF record does not include %s", v.primaryDomain)
		}
	}

	return "", fmt.Errorf("no SPF record found")
}

// VerifyDKIM checks DKIM record
func (v *Verifier) VerifyDKIM(ctx context.Context, domain, selector string) (string, error) {
	if selector == "" {
		selector = "default"
	}

	recordName := fmt.Sprintf("%s._domainkey.%s", selector, domain)
	v.logger.Info("Verifying DKIM record",
		zap.String("domain", domain),
		zap.String("selector", selector),
		zap.String("record", recordName),
	)

	txtRecords, err := net.LookupTXT(recordName)
	if err != nil {
		return "", fmt.Errorf("failed to lookup DKIM record: %w", err)
	}

	for _, record := range txtRecords {
		if strings.Contains(record, "v=DKIM1") {
			v.logger.Info("DKIM record verified",
				zap.String("domain", domain),
				zap.String("selector", selector),
			)
			return record, nil
		}
	}

	return "", fmt.Errorf("no valid DKIM record found")
}

// VerifyDMARC checks DMARC record
func (v *Verifier) VerifyDMARC(ctx context.Context, domain string) (string, error) {
	recordName := fmt.Sprintf("_dmarc.%s", domain)
	v.logger.Info("Verifying DMARC record",
		zap.String("domain", domain),
		zap.String("record", recordName),
	)

	txtRecords, err := net.LookupTXT(recordName)
	if err != nil {
		return "", fmt.Errorf("failed to lookup DMARC record: %w", err)
	}

	for _, record := range txtRecords {
		if strings.HasPrefix(record, "v=DMARC1") {
			v.logger.Info("DMARC record verified",
				zap.String("domain", domain),
				zap.String("record", record),
			)
			return record, nil
		}
	}

	return "", fmt.Errorf("no DMARC record found")
}

// VerifyAll performs comprehensive DNS verification
func (v *Verifier) VerifyAll(ctx context.Context, domain, dkimSelector string) *VerificationResult {
	result := &VerificationResult{
		Verified:       false,
		Errors:         make([]string, 0),
		MissingRecords: make([]string, 0),
		VerifiedAt:     time.Now(),
	}

	// 1. Verify ownership
	owned, err := v.VerifyOwnership(ctx, domain)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("Ownership: %v", err))
		result.MissingRecords = append(result.MissingRecords, "_mail-verification TXT record")
	}

	// 2. Verify MX records
	mxRecords, err := v.VerifyMXRecords(ctx, domain)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("MX: %v", err))
		result.MissingRecords = append(result.MissingRecords, "MX records")
	} else {
		result.MXRecords = mxRecords
	}

	// 3. Verify SPF
	spfRecord, err := v.VerifySPF(ctx, domain)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("SPF: %v", err))
		result.MissingRecords = append(result.MissingRecords, "SPF TXT record")
	} else {
		result.SPFRecord = spfRecord
	}

	// 4. Verify DKIM
	dkimRecord, err := v.VerifyDKIM(ctx, domain, dkimSelector)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("DKIM: %v", err))
		result.MissingRecords = append(result.MissingRecords, "DKIM TXT record")
	} else {
		result.DKIMRecord = dkimRecord
	}

	// 5. Verify DMARC
	dmarcRecord, err := v.VerifyDMARC(ctx, domain)
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("DMARC: %v", err))
		result.MissingRecords = append(result.MissingRecords, "DMARC TXT record")
	} else {
		result.DMARCRecord = dmarcRecord
	}

	// Domain is verified if ownership is confirmed and MX records are correct
	result.Verified = owned && len(result.MXRecords) > 0

	v.logger.Info("DNS verification completed",
		zap.String("domain", domain),
		zap.Bool("verified", result.Verified),
		zap.Int("errors", len(result.Errors)),
	)

	return result
}

// GetRequiredRecords returns the DNS records that need to be configured
func (v *Verifier) GetRequiredRecords(domain, dkimPublicKey string) []VerificationRecord {
	token := v.GenerateVerificationToken(domain)

	records := []VerificationRecord{
		{
			Type:  "TXT",
			Name:  fmt.Sprintf("_mail-verification.%s", domain),
			Value: fmt.Sprintf("mail-verification=%s", token),
		},
		{
			Type:  "MX",
			Name:  domain,
			Value: fmt.Sprintf("10 mail.%s", v.primaryDomain),
		},
		{
			Type:  "TXT",
			Name:  domain,
			Value: fmt.Sprintf("v=spf1 include:spf.%s ~all", v.primaryDomain),
		},
		{
			Type:  "TXT",
			Name:  fmt.Sprintf("_dmarc.%s", domain),
			Value: fmt.Sprintf("v=DMARC1; p=quarantine; rua=mailto:dmarc@%s", v.primaryDomain),
		},
	}

	if dkimPublicKey != "" {
		records = append(records, VerificationRecord{
			Type:  "TXT",
			Name:  fmt.Sprintf("default._domainkey.%s", domain),
			Value: fmt.Sprintf("v=DKIM1; k=rsa; p=%s", dkimPublicKey),
		})
	}

	return records
}
