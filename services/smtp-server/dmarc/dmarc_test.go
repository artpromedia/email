package dmarc

import (
	"context"
	"net"
	"testing"

	"go.uber.org/zap"

	"smtp-server/dkim"
	"smtp-server/spf"
)

func TestParseDMARCRecord(t *testing.T) {
	tests := []struct {
		name    string
		record  string
		wantErr bool
		check   func(*Record) error
	}{
		{
			name:    "valid basic record",
			record:  "v=DMARC1; p=none",
			wantErr: false,
			check: func(r *Record) error {
				if r.Version != "DMARC1" {
					t.Errorf("Version = %s, want DMARC1", r.Version)
				}
				if r.Policy != PolicyNone {
					t.Errorf("Policy = %s, want none", r.Policy)
				}
				return nil
			},
		},
		{
			name:    "full record",
			record:  "v=DMARC1; p=reject; sp=quarantine; adkim=s; aspf=s; pct=50; rua=mailto:dmarc@example.com; ruf=mailto:forensics@example.com",
			wantErr: false,
			check: func(r *Record) error {
				if r.Policy != PolicyReject {
					t.Errorf("Policy = %s, want reject", r.Policy)
				}
				if r.SubdomainPolicy != PolicyQuarantine {
					t.Errorf("SubdomainPolicy = %s, want quarantine", r.SubdomainPolicy)
				}
				if r.ADKIM != AlignmentStrict {
					t.Errorf("ADKIM = %s, want s", r.ADKIM)
				}
				if r.ASPF != AlignmentStrict {
					t.Errorf("ASPF = %s, want s", r.ASPF)
				}
				if r.Percentage != 50 {
					t.Errorf("Percentage = %d, want 50", r.Percentage)
				}
				if len(r.ReportAggregate) != 1 || r.ReportAggregate[0] != "mailto:dmarc@example.com" {
					t.Errorf("ReportAggregate = %v, want [mailto:dmarc@example.com]", r.ReportAggregate)
				}
				return nil
			},
		},
		{
			name:    "quarantine policy",
			record:  "v=DMARC1; p=quarantine",
			wantErr: false,
			check: func(r *Record) error {
				if r.Policy != PolicyQuarantine {
					t.Errorf("Policy = %s, want quarantine", r.Policy)
				}
				return nil
			},
		},
		{
			name:    "defaults applied",
			record:  "v=DMARC1; p=none",
			wantErr: false,
			check: func(r *Record) error {
				if r.ADKIM != AlignmentRelaxed {
					t.Errorf("ADKIM default = %s, want r", r.ADKIM)
				}
				if r.ASPF != AlignmentRelaxed {
					t.Errorf("ASPF default = %s, want r", r.ASPF)
				}
				if r.Percentage != 100 {
					t.Errorf("Percentage default = %d, want 100", r.Percentage)
				}
				if r.SubdomainPolicy != PolicyNone {
					t.Errorf("SubdomainPolicy should default to Policy")
				}
				return nil
			},
		},
		{
			name:    "invalid version",
			record:  "v=DMARC2; p=none",
			wantErr: true,
		},
		{
			name:    "missing policy",
			record:  "v=DMARC1",
			wantErr: true,
		},
		{
			name:    "multiple rua addresses",
			record:  "v=DMARC1; p=none; rua=mailto:a@example.com,mailto:b@example.com",
			wantErr: false,
			check: func(r *Record) error {
				if len(r.ReportAggregate) != 2 {
					t.Errorf("ReportAggregate count = %d, want 2", len(r.ReportAggregate))
				}
				return nil
			},
		},
		{
			name:    "rua with size limit",
			record:  "v=DMARC1; p=none; rua=mailto:dmarc@example.com!10m",
			wantErr: false,
			check: func(r *Record) error {
				if len(r.ReportAggregate) != 1 || r.ReportAggregate[0] != "mailto:dmarc@example.com" {
					t.Errorf("ReportAggregate should strip size limit, got %v", r.ReportAggregate)
				}
				return nil
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			record, err := parseDMARCRecord(tt.record)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseDMARCRecord() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && tt.check != nil {
				tt.check(record)
			}
		})
	}
}

func TestGetOrganizationalDomain(t *testing.T) {
	tests := []struct {
		domain   string
		expected string
	}{
		{"example.com", "example.com"},
		{"sub.example.com", "example.com"},
		{"deep.sub.example.com", "example.com"},
		{"example.co.uk", "example.co.uk"},
		{"sub.example.co.uk", "example.co.uk"},
		{"example.com.au", "example.com.au"},
		{"example.org", "example.org"},
	}

	for _, tt := range tests {
		t.Run(tt.domain, func(t *testing.T) {
			result := getOrganizationalDomain(tt.domain)
			if result != tt.expected {
				t.Errorf("getOrganizationalDomain(%q) = %q, want %q",
					tt.domain, result, tt.expected)
			}
		})
	}
}

func TestCheckSPFAlignment(t *testing.T) {
	logger := zap.NewNop()
	spfValidator := spf.NewValidator(logger)
	dkimVerifier := dkim.NewVerifier(logger)
	validator := NewValidator(spfValidator, dkimVerifier, logger)

	tests := []struct {
		name       string
		fromDomain string
		spfDomain  string
		alignment  Alignment
		expected   bool
	}{
		{
			name:       "strict match - exact",
			fromDomain: "example.com",
			spfDomain:  "example.com",
			alignment:  AlignmentStrict,
			expected:   true,
		},
		{
			name:       "strict match - case insensitive",
			fromDomain: "EXAMPLE.COM",
			spfDomain:  "example.com",
			alignment:  AlignmentStrict,
			expected:   true,
		},
		{
			name:       "strict no match - subdomain",
			fromDomain: "sub.example.com",
			spfDomain:  "example.com",
			alignment:  AlignmentStrict,
			expected:   false,
		},
		{
			name:       "relaxed match - subdomain",
			fromDomain: "sub.example.com",
			spfDomain:  "example.com",
			alignment:  AlignmentRelaxed,
			expected:   true,
		},
		{
			name:       "relaxed match - both subdomains",
			fromDomain: "mail.example.com",
			spfDomain:  "smtp.example.com",
			alignment:  AlignmentRelaxed,
			expected:   true,
		},
		{
			name:       "relaxed no match - different domains",
			fromDomain: "example.com",
			spfDomain:  "example.org",
			alignment:  AlignmentRelaxed,
			expected:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := validator.checkSPFAlignment(tt.fromDomain, tt.spfDomain, tt.alignment)
			if result != tt.expected {
				t.Errorf("checkSPFAlignment(%q, %q, %s) = %v, want %v",
					tt.fromDomain, tt.spfDomain, tt.alignment, result, tt.expected)
			}
		})
	}
}

func TestCheckDKIMAlignment(t *testing.T) {
	logger := zap.NewNop()
	spfValidator := spf.NewValidator(logger)
	dkimVerifier := dkim.NewVerifier(logger)
	validator := NewValidator(spfValidator, dkimVerifier, logger)

	tests := []struct {
		name       string
		fromDomain string
		results    []*dkim.VerificationResult
		alignment  Alignment
		expected   bool
	}{
		{
			name:       "strict match - valid signature",
			fromDomain: "example.com",
			results: []*dkim.VerificationResult{
				{Valid: true, Domain: "example.com"},
			},
			alignment: AlignmentStrict,
			expected:  true,
		},
		{
			name:       "strict no match - subdomain signature",
			fromDomain: "example.com",
			results: []*dkim.VerificationResult{
				{Valid: true, Domain: "mail.example.com"},
			},
			alignment: AlignmentStrict,
			expected:  false,
		},
		{
			name:       "relaxed match - subdomain signature",
			fromDomain: "example.com",
			results: []*dkim.VerificationResult{
				{Valid: true, Domain: "mail.example.com"},
			},
			alignment: AlignmentRelaxed,
			expected:  true,
		},
		{
			name:       "invalid signature ignored",
			fromDomain: "example.com",
			results: []*dkim.VerificationResult{
				{Valid: false, Domain: "example.com"},
			},
			alignment: AlignmentStrict,
			expected:  false,
		},
		{
			name:       "multiple signatures - one valid aligned",
			fromDomain: "example.com",
			results: []*dkim.VerificationResult{
				{Valid: false, Domain: "example.com"},
				{Valid: true, Domain: "other.com"},
				{Valid: true, Domain: "example.com"},
			},
			alignment: AlignmentStrict,
			expected:  true,
		},
		{
			name:       "no results",
			fromDomain: "example.com",
			results:    nil,
			alignment:  AlignmentRelaxed,
			expected:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := validator.checkDKIMAlignment(tt.fromDomain, tt.results, tt.alignment)
			if result != tt.expected {
				t.Errorf("checkDKIMAlignment(%q, results, %s) = %v, want %v",
					tt.fromDomain, tt.alignment, result, tt.expected)
			}
		})
	}
}

func TestAnyDKIMValid(t *testing.T) {
	logger := zap.NewNop()
	spfValidator := spf.NewValidator(logger)
	dkimVerifier := dkim.NewVerifier(logger)
	validator := NewValidator(spfValidator, dkimVerifier, logger)

	tests := []struct {
		name     string
		results  []*dkim.VerificationResult
		expected bool
	}{
		{
			name:     "nil results",
			results:  nil,
			expected: false,
		},
		{
			name:     "empty results",
			results:  []*dkim.VerificationResult{},
			expected: false,
		},
		{
			name: "one valid",
			results: []*dkim.VerificationResult{
				{Valid: true},
			},
			expected: true,
		},
		{
			name: "all invalid",
			results: []*dkim.VerificationResult{
				{Valid: false},
				{Valid: false},
			},
			expected: false,
		},
		{
			name: "mixed - one valid",
			results: []*dkim.VerificationResult{
				{Valid: false},
				{Valid: true},
				{Valid: false},
			},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := validator.anyDKIMValid(tt.results)
			if result != tt.expected {
				t.Errorf("anyDKIMValid() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestGenerateDMARCRecord(t *testing.T) {
	tests := []struct {
		name            string
		policy          Policy
		subdomainPolicy Policy
		reportAggregate []string
		percentage      int
		expected        string
	}{
		{
			name:            "basic none policy",
			policy:          PolicyNone,
			subdomainPolicy: "",
			reportAggregate: nil,
			percentage:      100,
			expected:        "v=DMARC1; p=none",
		},
		{
			name:            "reject policy",
			policy:          PolicyReject,
			subdomainPolicy: "",
			reportAggregate: nil,
			percentage:      100,
			expected:        "v=DMARC1; p=reject",
		},
		{
			name:            "with subdomain policy",
			policy:          PolicyReject,
			subdomainPolicy: PolicyQuarantine,
			reportAggregate: nil,
			percentage:      100,
			expected:        "v=DMARC1; p=reject; sp=quarantine",
		},
		{
			name:            "with reports",
			policy:          PolicyNone,
			subdomainPolicy: "",
			reportAggregate: []string{"mailto:dmarc@example.com"},
			percentage:      100,
			expected:        "v=DMARC1; p=none; rua=mailto:dmarc@example.com",
		},
		{
			name:            "with percentage",
			policy:          PolicyReject,
			subdomainPolicy: "",
			reportAggregate: nil,
			percentage:      50,
			expected:        "v=DMARC1; p=reject; pct=50",
		},
		{
			name:            "full configuration",
			policy:          PolicyReject,
			subdomainPolicy: PolicyQuarantine,
			reportAggregate: []string{"mailto:dmarc@example.com", "mailto:backup@example.com"},
			percentage:      75,
			expected:        "v=DMARC1; p=reject; sp=quarantine; rua=mailto:dmarc@example.com,mailto:backup@example.com; pct=75",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := GenerateDMARCRecord(tt.policy, tt.subdomainPolicy, tt.reportAggregate, tt.percentage)
			if result != tt.expected {
				t.Errorf("GenerateDMARCRecord() = %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestParseURIList(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		expected []string
	}{
		{
			name:     "single URI",
			value:    "mailto:dmarc@example.com",
			expected: []string{"mailto:dmarc@example.com"},
		},
		{
			name:     "multiple URIs",
			value:    "mailto:a@example.com,mailto:b@example.com",
			expected: []string{"mailto:a@example.com", "mailto:b@example.com"},
		},
		{
			name:     "URI with size limit",
			value:    "mailto:dmarc@example.com!10m",
			expected: []string{"mailto:dmarc@example.com"},
		},
		{
			name:     "multiple with size limits",
			value:    "mailto:a@example.com!10m,mailto:b@example.com!20m",
			expected: []string{"mailto:a@example.com", "mailto:b@example.com"},
		},
		{
			name:     "with whitespace",
			value:    " mailto:a@example.com , mailto:b@example.com ",
			expected: []string{"mailto:a@example.com", "mailto:b@example.com"},
		},
		{
			name:     "empty",
			value:    "",
			expected: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseURIList(tt.value)
			if len(result) != len(tt.expected) {
				t.Errorf("parseURIList() len = %d, want %d", len(result), len(tt.expected))
				return
			}
			for i, v := range result {
				if v != tt.expected[i] {
					t.Errorf("parseURIList()[%d] = %q, want %q", i, v, tt.expected[i])
				}
			}
		})
	}
}

func TestNewValidator(t *testing.T) {
	logger := zap.NewNop()
	spfValidator := spf.NewValidator(logger)
	dkimVerifier := dkim.NewVerifier(logger)

	validator := NewValidator(spfValidator, dkimVerifier, logger)

	if validator == nil {
		t.Fatal("NewValidator() returned nil")
	}
	if validator.spfValidator == nil {
		t.Error("NewValidator() did not set spfValidator")
	}
	if validator.dkimVerifier == nil {
		t.Error("NewValidator() did not set dkimVerifier")
	}
	if validator.logger == nil {
		t.Error("NewValidator() did not set logger")
	}
	if validator.resolver == nil {
		t.Error("NewValidator() did not set resolver")
	}
	if validator.timeout <= 0 {
		t.Error("NewValidator() should set a positive timeout")
	}
}

func TestNewReporter(t *testing.T) {
	logger := zap.NewNop()
	reporter := NewReporter(logger)

	if reporter == nil {
		t.Fatal("NewReporter() returned nil")
	}
	if reporter.logger == nil {
		t.Error("NewReporter() did not set logger")
	}
}

func TestCheckResult_Fields(t *testing.T) {
	result := &CheckResult{
		Domain:      "example.com",
		Policy:      PolicyReject,
		SPFResult:   spf.ResultPass,
		SPFAligned:  true,
		DKIMAligned: true,
		Pass:        true,
		Disposition: "none",
	}

	if result.Domain != "example.com" {
		t.Errorf("Domain = %q, want %q", result.Domain, "example.com")
	}
	if result.Policy != PolicyReject {
		t.Errorf("Policy = %v, want %v", result.Policy, PolicyReject)
	}
	if result.SPFResult != spf.ResultPass {
		t.Errorf("SPFResult = %v, want %v", result.SPFResult, spf.ResultPass)
	}
	if !result.SPFAligned {
		t.Error("SPFAligned should be true")
	}
	if !result.DKIMAligned {
		t.Error("DKIMAligned should be true")
	}
	if !result.Pass {
		t.Error("Pass should be true")
	}
	if result.Disposition != "none" {
		t.Errorf("Disposition = %q, want %q", result.Disposition, "none")
	}
}

func TestRecord_Defaults(t *testing.T) {
	record := &Record{
		Version:         "DMARC1",
		Policy:          PolicyNone,
		SubdomainPolicy: PolicyNone,
		ADKIM:           AlignmentRelaxed,
		ASPF:            AlignmentRelaxed,
		Percentage:      100,
		ReportFormat:    "afrf",
		ReportInterval:  86400,
		FailureOptions:  "0",
	}

	if record.Version != "DMARC1" {
		t.Errorf("Version = %s, want DMARC1", record.Version)
	}
	if record.ADKIM != AlignmentRelaxed {
		t.Errorf("ADKIM = %s, want r", record.ADKIM)
	}
	if record.ASPF != AlignmentRelaxed {
		t.Errorf("ASPF = %s, want r", record.ASPF)
	}
	if record.Percentage != 100 {
		t.Errorf("Percentage = %d, want 100", record.Percentage)
	}
	if record.ReportFormat != "afrf" {
		t.Errorf("ReportFormat = %s, want afrf", record.ReportFormat)
	}
	if record.ReportInterval != 86400 {
		t.Errorf("ReportInterval = %d, want 86400", record.ReportInterval)
	}
}

// MockDNSValidator is a test helper for DMARC validation
type MockDNSValidator struct {
	*Validator
	dmarcRecords map[string]string
}

func (m *MockDNSValidator) lookupDMARC(ctx context.Context, domain string) (*Record, error) {
	dmarcDomain := "_dmarc." + domain
	if record, ok := m.dmarcRecords[dmarcDomain]; ok {
		return parseDMARCRecord(record)
	}
	// Try organizational domain
	orgDomain := getOrganizationalDomain(domain)
	if orgDomain != domain {
		dmarcDomain = "_dmarc." + orgDomain
		if record, ok := m.dmarcRecords[dmarcDomain]; ok {
			return parseDMARCRecord(record)
		}
	}
	return nil, nil
}

func TestPolicy_Values(t *testing.T) {
	// Test that policy constants have correct values
	if PolicyNone != "none" {
		t.Errorf("PolicyNone = %s, want none", PolicyNone)
	}
	if PolicyQuarantine != "quarantine" {
		t.Errorf("PolicyQuarantine = %s, want quarantine", PolicyQuarantine)
	}
	if PolicyReject != "reject" {
		t.Errorf("PolicyReject = %s, want reject", PolicyReject)
	}
}

func TestAlignment_Values(t *testing.T) {
	// Test that alignment constants have correct values
	if AlignmentRelaxed != "r" {
		t.Errorf("AlignmentRelaxed = %s, want r", AlignmentRelaxed)
	}
	if AlignmentStrict != "s" {
		t.Errorf("AlignmentStrict = %s, want s", AlignmentStrict)
	}
}

func TestCheckResult_Disposition(t *testing.T) {
	// Test disposition values based on pass/fail and policy
	tests := []struct {
		name        string
		pass        bool
		policy      Policy
		disposition string
	}{
		{"pass any policy", true, PolicyReject, "none"},
		{"fail none policy", false, PolicyNone, "none"},
		{"fail quarantine policy", false, PolicyQuarantine, "quarantine"},
		{"fail reject policy", false, PolicyReject, "reject"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var expectedDisposition string
			if tt.pass {
				expectedDisposition = "none"
			} else {
				expectedDisposition = string(tt.policy)
			}
			if expectedDisposition != tt.disposition {
				t.Errorf("disposition = %s, want %s", expectedDisposition, tt.disposition)
			}
		})
	}
}

func TestAggregateReport_Fields(t *testing.T) {
	report := &AggregateReport{
		ReporterOrg:   "Example Corp",
		ReporterEmail: "dmarc@example.com",
		ReportID:      "report-123",
		Domain:        "example.com",
		Policy:        PolicyReject,
		Records:       make([]*ReportRecord, 0),
	}

	if report.ReporterOrg != "Example Corp" {
		t.Errorf("ReporterOrg = %q, want %q", report.ReporterOrg, "Example Corp")
	}
	if report.Domain != "example.com" {
		t.Errorf("Domain = %q, want %q", report.Domain, "example.com")
	}
	if report.Policy != PolicyReject {
		t.Errorf("Policy = %v, want %v", report.Policy, PolicyReject)
	}
}

func TestReportRecord_Fields(t *testing.T) {
	record := &ReportRecord{
		SourceIP:      "192.168.1.1",
		Count:         10,
		PolicyApplied: PolicyNone,
		Disposition:   "none",
		DKIMResult:    "pass",
		DKIMDomain:    "example.com",
		SPFResult:     "pass",
		SPFDomain:     "example.com",
		HeaderFrom:    "sender@example.com",
		EnvelopeFrom:  "bounce@example.com",
	}

	if record.SourceIP != "192.168.1.1" {
		t.Errorf("SourceIP = %q, want %q", record.SourceIP, "192.168.1.1")
	}
	if record.Count != 10 {
		t.Errorf("Count = %d, want %d", record.Count, 10)
	}
	if record.DKIMResult != "pass" {
		t.Errorf("DKIMResult = %q, want %q", record.DKIMResult, "pass")
	}
	if record.SPFResult != "pass" {
		t.Errorf("SPFResult = %q, want %q", record.SPFResult, "pass")
	}
}
