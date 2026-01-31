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
	BIMIRecord     string
	MTASTSRecord   string
	TLSRPTRecord   string
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

// VerifyBIMI checks BIMI record
func (v *Verifier) VerifyBIMI(ctx context.Context, domain string, selector string) (string, error) {
	if selector == "" {
		selector = "default"
	}

	recordName := fmt.Sprintf("%s._bimi.%s", selector, domain)
	v.logger.Info("Verifying BIMI record",
		zap.String("domain", domain),
		zap.String("selector", selector),
		zap.String("record", recordName),
	)

	txtRecords, err := net.LookupTXT(recordName)
	if err != nil {
		return "", fmt.Errorf("failed to lookup BIMI record: %w", err)
	}

	for _, record := range txtRecords {
		if strings.HasPrefix(record, "v=BIMI1") {
			v.logger.Info("BIMI record verified",
				zap.String("domain", domain),
				zap.String("selector", selector),
				zap.String("record", record),
			)
			return record, nil
		}
	}

	return "", fmt.Errorf("no BIMI record found")
}

// VerifyMTASTS checks MTA-STS DNS record
func (v *Verifier) VerifyMTASTS(ctx context.Context, domain string) (string, error) {
	recordName := fmt.Sprintf("_mta-sts.%s", domain)
	v.logger.Info("Verifying MTA-STS record",
		zap.String("domain", domain),
		zap.String("record", recordName),
	)

	txtRecords, err := net.LookupTXT(recordName)
	if err != nil {
		return "", fmt.Errorf("failed to lookup MTA-STS record: %w", err)
	}

	for _, record := range txtRecords {
		if strings.HasPrefix(record, "v=STSv1") {
			v.logger.Info("MTA-STS record verified",
				zap.String("domain", domain),
				zap.String("record", record),
			)
			return record, nil
		}
	}

	return "", fmt.Errorf("no MTA-STS record found")
}

// VerifyTLSRPT checks TLS-RPT record for SMTP TLS reporting
func (v *Verifier) VerifyTLSRPT(ctx context.Context, domain string) (string, error) {
	recordName := fmt.Sprintf("_smtp._tls.%s", domain)
	v.logger.Info("Verifying TLS-RPT record",
		zap.String("domain", domain),
		zap.String("record", recordName),
	)

	txtRecords, err := net.LookupTXT(recordName)
	if err != nil {
		return "", fmt.Errorf("failed to lookup TLS-RPT record: %w", err)
	}

	for _, record := range txtRecords {
		if strings.HasPrefix(record, "v=TLSRPTv1") {
			v.logger.Info("TLS-RPT record verified",
				zap.String("domain", domain),
				zap.String("record", record),
			)
			return record, nil
		}
	}

	return "", fmt.Errorf("no TLS-RPT record found")
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

	// 6. Verify BIMI (optional)
	bimiRecord, err := v.VerifyBIMI(ctx, domain, "default")
	if err != nil {
		// BIMI is optional, just log as info
		v.logger.Debug("BIMI record not found", zap.String("domain", domain), zap.Error(err))
	} else {
		result.BIMIRecord = bimiRecord
	}

	// 7. Verify MTA-STS (optional)
	mtaStsRecord, err := v.VerifyMTASTS(ctx, domain)
	if err != nil {
		// MTA-STS is optional, just log as info
		v.logger.Debug("MTA-STS record not found", zap.String("domain", domain), zap.Error(err))
	} else {
		result.MTASTSRecord = mtaStsRecord
	}

	// 8. Verify TLS-RPT (optional)
	tlsRptRecord, err := v.VerifyTLSRPT(ctx, domain)
	if err != nil {
		// TLS-RPT is optional, just log as info
		v.logger.Debug("TLS-RPT record not found", zap.String("domain", domain), zap.Error(err))
	} else {
		result.TLSRPTRecord = tlsRptRecord
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

// OptionalRecordConfig contains configuration for optional email security records
type OptionalRecordConfig struct {
	// BIMI configuration
	BIMIEnabled   bool
	BIMILogoURL   string
	BIMIVMCURL    string
	BIMISelector  string

	// MTA-STS configuration
	MTASTSEnabled bool
	MTASTSMode    string // "testing" or "enforce"
	MTASTSPolicyID string
	MTASTSMXHosts []string
	MTASTSMaxAge  int

	// TLS-RPT configuration
	TLSRPTEnabled bool
	TLSRPTEmail   string
}

// GetOptionalRecords returns optional email security DNS records (BIMI, MTA-STS, TLS-RPT)
func (v *Verifier) GetOptionalRecords(domain string, config OptionalRecordConfig) []VerificationRecord {
	var records []VerificationRecord

	// BIMI record
	if config.BIMIEnabled && config.BIMILogoURL != "" {
		selector := config.BIMISelector
		if selector == "" {
			selector = "default"
		}

		bimiValue := fmt.Sprintf("v=BIMI1; l=%s", config.BIMILogoURL)
		if config.BIMIVMCURL != "" {
			bimiValue += fmt.Sprintf("; a=%s", config.BIMIVMCURL)
		}

		records = append(records, VerificationRecord{
			Type:  "TXT",
			Name:  fmt.Sprintf("%s._bimi.%s", selector, domain),
			Value: bimiValue,
		})
	}

	// MTA-STS DNS record
	if config.MTASTSEnabled && config.MTASTSPolicyID != "" {
		records = append(records, VerificationRecord{
			Type:  "TXT",
			Name:  fmt.Sprintf("_mta-sts.%s", domain),
			Value: fmt.Sprintf("v=STSv1; id=%s", config.MTASTSPolicyID),
		})
	}

	// TLS-RPT record
	if config.TLSRPTEnabled && config.TLSRPTEmail != "" {
		records = append(records, VerificationRecord{
			Type:  "TXT",
			Name:  fmt.Sprintf("_smtp._tls.%s", domain),
			Value: fmt.Sprintf("v=TLSRPTv1; rua=mailto:%s", config.TLSRPTEmail),
		})
	}

	return records
}

// GenerateMTASTSPolicy generates the MTA-STS policy file content
func GenerateMTASTSPolicy(mode string, mxHosts []string, maxAge int) string {
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

	return builder.String()
}
