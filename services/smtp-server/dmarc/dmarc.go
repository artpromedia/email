package dmarc

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"

	"github.com/oonrumail/smtp-server/dkim"
	"github.com/oonrumail/smtp-server/spf"
)

// Policy represents the DMARC policy
type Policy string

const (
	PolicyNone       Policy = "none"
	PolicyQuarantine Policy = "quarantine"
	PolicyReject     Policy = "reject"
)

// Alignment represents the alignment mode
type Alignment string

const (
	AlignmentRelaxed Alignment = "r"
	AlignmentStrict  Alignment = "s"
)

// Record represents a parsed DMARC record
type Record struct {
	Version         string    // v (required, must be DMARC1)
	Policy          Policy    // p (required)
	SubdomainPolicy Policy    // sp (optional, defaults to p)
	ADKIM           Alignment // adkim (optional, default r)
	ASPF            Alignment // aspf (optional, default r)
	Percentage      int       // pct (optional, default 100)
	ReportAggregate []string  // rua (optional)
	ReportForensic  []string  // ruf (optional)
	ReportFormat    string    // rf (optional, default afrf)
	ReportInterval  int       // ri (optional, default 86400)
	FailureOptions  string    // fo (optional, default 0)
}

// Validator performs DMARC validation
type Validator struct {
	resolver     *net.Resolver
	spfValidator *spf.Validator
	dkimVerifier *dkim.Verifier
	logger       *zap.Logger
	timeout      time.Duration
}

// NewValidator creates a new DMARC validator
func NewValidator(spfValidator *spf.Validator, dkimVerifier *dkim.Verifier, logger *zap.Logger) *Validator {
	return &Validator{
		resolver:     net.DefaultResolver,
		spfValidator: spfValidator,
		dkimVerifier: dkimVerifier,
		logger:       logger,
		timeout:      10 * time.Second,
	}
}

// CheckResult holds the complete DMARC check result
type CheckResult struct {
	Domain      string
	Record      *Record
	Policy      Policy
	SPFResult   spf.Result
	SPFAligned  bool
	DKIMResults []*dkim.VerificationResult
	DKIMAligned bool
	Pass        bool
	Disposition string // none, quarantine, reject
	Error       error
}

// Check performs a DMARC check
func (v *Validator) Check(ctx context.Context, fromDomain string, senderIP net.IP, message []byte) *CheckResult {
	ctx, cancel := context.WithTimeout(ctx, v.timeout)
	defer cancel()

	result := &CheckResult{
		Domain: fromDomain,
	}

	// Look up DMARC record
	record, err := v.lookupDMARC(ctx, fromDomain)
	if err != nil || record == nil {
		result.Error = err
		result.Disposition = "none"
		return result
	}
	result.Record = record
	result.Policy = record.Policy

	// Check SPF
	spfResult := v.spfValidator.Check(ctx, senderIP, fromDomain, fromDomain)
	result.SPFResult = spfResult.Result
	result.SPFAligned = v.checkSPFAlignment(fromDomain, fromDomain, record.ASPF)

	// Check DKIM
	dkimResults, err := v.dkimVerifier.VerifyMessage(message)
	if err != nil {
		v.logger.Warn("DKIM verification error", zap.Error(err))
	}
	result.DKIMResults = dkimResults
	result.DKIMAligned = v.checkDKIMAlignment(fromDomain, dkimResults, record.ADKIM)

	// Determine DMARC pass/fail
	spfPass := spfResult.Result == spf.ResultPass && result.SPFAligned
	dkimPass := result.DKIMAligned && v.anyDKIMValid(dkimResults)

	result.Pass = spfPass || dkimPass

	// Determine disposition
	if result.Pass {
		result.Disposition = "none"
	} else {
		// Apply percentage
		if record.Percentage < 100 {
			// In production, would use random sampling
			// For now, always apply policy
		}
		result.Disposition = string(record.Policy)
	}

	v.logger.Debug("DMARC check completed",
		zap.String("domain", fromDomain),
		zap.String("policy", string(record.Policy)),
		zap.Bool("spf_pass", spfPass),
		zap.Bool("dkim_pass", dkimPass),
		zap.Bool("pass", result.Pass),
		zap.String("disposition", result.Disposition))

	return result
}

func (v *Validator) lookupDMARC(ctx context.Context, domain string) (*Record, error) {
	// Try _dmarc.domain first
	dmarcDomain := "_dmarc." + domain

	records, err := v.resolver.LookupTXT(ctx, dmarcDomain)
	if err != nil {
		// Try organizational domain
		orgDomain := getOrganizationalDomain(domain)
		if orgDomain != domain {
			dmarcDomain = "_dmarc." + orgDomain
			records, err = v.resolver.LookupTXT(ctx, dmarcDomain)
		}
	}

	if err != nil {
		return nil, err
	}

	for _, record := range records {
		if strings.HasPrefix(record, "v=DMARC1") {
			return parseDMARCRecord(record)
		}
	}

	return nil, nil
}

func parseDMARCRecord(record string) (*Record, error) {
	r := &Record{
		ADKIM:          AlignmentRelaxed,
		ASPF:           AlignmentRelaxed,
		Percentage:     100,
		ReportFormat:   "afrf",
		ReportInterval: 86400,
		FailureOptions: "0",
	}

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

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])

		switch key {
		case "v":
			r.Version = value
		case "p":
			r.Policy = Policy(value)
		case "sp":
			r.SubdomainPolicy = Policy(value)
		case "adkim":
			r.ADKIM = Alignment(value)
		case "aspf":
			r.ASPF = Alignment(value)
		case "pct":
			pct, _ := strconv.Atoi(value)
			if pct > 0 && pct <= 100 {
				r.Percentage = pct
			}
		case "rua":
			r.ReportAggregate = parseURIList(value)
		case "ruf":
			r.ReportForensic = parseURIList(value)
		case "rf":
			r.ReportFormat = value
		case "ri":
			ri, _ := strconv.Atoi(value)
			if ri > 0 {
				r.ReportInterval = ri
			}
		case "fo":
			r.FailureOptions = value
		}
	}

	if r.Version != "DMARC1" {
		return nil, fmt.Errorf("invalid DMARC version: %s", r.Version)
	}

	if r.Policy == "" {
		return nil, fmt.Errorf("missing required policy (p=)")
	}

	if r.SubdomainPolicy == "" {
		r.SubdomainPolicy = r.Policy
	}

	return r, nil
}

func parseURIList(value string) []string {
	var uris []string
	for _, uri := range strings.Split(value, ",") {
		uri = strings.TrimSpace(uri)
		if uri != "" {
			// Remove optional size limit (e.g., mailto:reports@example.com!10m)
			if idx := strings.Index(uri, "!"); idx != -1 {
				uri = uri[:idx]
			}
			uris = append(uris, uri)
		}
	}
	return uris
}

func (v *Validator) checkSPFAlignment(fromDomain, spfDomain string, alignment Alignment) bool {
	if alignment == AlignmentStrict {
		return strings.EqualFold(fromDomain, spfDomain)
	}
	// Relaxed alignment - organizational domain must match
	return strings.EqualFold(
		getOrganizationalDomain(fromDomain),
		getOrganizationalDomain(spfDomain),
	)
}

func (v *Validator) checkDKIMAlignment(fromDomain string, results []*dkim.VerificationResult, alignment Alignment) bool {
	for _, r := range results {
		if !r.Valid {
			continue
		}

		if alignment == AlignmentStrict {
			if strings.EqualFold(fromDomain, r.Domain) {
				return true
			}
		} else {
			// Relaxed alignment
			if strings.EqualFold(
				getOrganizationalDomain(fromDomain),
				getOrganizationalDomain(r.Domain),
			) {
				return true
			}
		}
	}
	return false
}

func (v *Validator) anyDKIMValid(results []*dkim.VerificationResult) bool {
	for _, r := range results {
		if r.Valid {
			return true
		}
	}
	return false
}

// getOrganizationalDomain extracts the organizational domain
// This is a simplified version - production should use public suffix list
func getOrganizationalDomain(domain string) string {
	parts := strings.Split(strings.ToLower(domain), ".")
	if len(parts) <= 2 {
		return domain
	}

	// Handle common TLDs with multiple parts (co.uk, com.au, etc.)
	// This is simplified - use public suffix list in production
	if len(parts) >= 3 {
		secondLevel := parts[len(parts)-2]
		if secondLevel == "co" || secondLevel == "com" || secondLevel == "org" || secondLevel == "net" {
			if len(parts) >= 3 {
				return strings.Join(parts[len(parts)-3:], ".")
			}
		}
	}

	return strings.Join(parts[len(parts)-2:], ".")
}

// GenerateDMARCRecord generates a DMARC record
func GenerateDMARCRecord(policy Policy, subdomainPolicy Policy, reportAggregate []string, percentage int) string {
	var parts []string
	parts = append(parts, "v=DMARC1")
	parts = append(parts, fmt.Sprintf("p=%s", policy))

	if subdomainPolicy != "" && subdomainPolicy != policy {
		parts = append(parts, fmt.Sprintf("sp=%s", subdomainPolicy))
	}

	if len(reportAggregate) > 0 {
		parts = append(parts, fmt.Sprintf("rua=%s", strings.Join(reportAggregate, ",")))
	}

	if percentage > 0 && percentage < 100 {
		parts = append(parts, fmt.Sprintf("pct=%d", percentage))
	}

	return strings.Join(parts, "; ")
}

// Reporter handles DMARC aggregate report generation
type Reporter struct {
	logger *zap.Logger
}

// NewReporter creates a new DMARC reporter
func NewReporter(logger *zap.Logger) *Reporter {
	return &Reporter{
		logger: logger,
	}
}

// AggregateReport represents a DMARC aggregate report
type AggregateReport struct {
	ReporterOrg    string
	ReporterEmail  string
	ReportID       string
	DateRangeStart time.Time
	DateRangeEnd   time.Time
	Domain         string
	Policy         Policy
	Records        []*ReportRecord
}

// ReportRecord represents a single record in the aggregate report
type ReportRecord struct {
	SourceIP      string
	Count         int
	PolicyApplied Policy
	Disposition   string
	DKIMResult    string
	DKIMDomain    string
	SPFResult     string
	SPFDomain     string
	HeaderFrom    string
	EnvelopeFrom  string
}

// GenerateReport generates a DMARC aggregate report in XML format
func (r *Reporter) GenerateReport(report *AggregateReport) ([]byte, error) {
	// In production, this would generate proper XML according to RFC 7489
	// This is a simplified placeholder
	r.logger.Info("Generating DMARC aggregate report",
		zap.String("domain", report.Domain),
		zap.Int("records", len(report.Records)),
		zap.Time("start", report.DateRangeStart),
		zap.Time("end", report.DateRangeEnd))

	return nil, nil
}
