package arc

import (
	"crypto/rand"
	"crypto/rsa"
	"testing"

	"go.uber.org/zap"

	"github.com/oonrumail/smtp-server/domain"
)

func TestDefaultSignatureConfig(t *testing.T) {
	config := DefaultSignatureConfig()

	if config == nil {
		t.Fatal("DefaultSignatureConfig() returned nil")
	}

	// Verify default headers include DKIM-Signature
	hasDKIMSig := false
	for _, h := range config.Headers {
		if h == "dkim-signature" {
			hasDKIMSig = true
			break
		}
	}
	if !hasDKIMSig {
		t.Error("DefaultSignatureConfig() should include dkim-signature header")
	}

	// Verify canonicalization methods
	if config.HeaderCanonicalization != "relaxed" {
		t.Errorf("HeaderCanonicalization = %q, want %q",
			config.HeaderCanonicalization, "relaxed")
	}
	if config.BodyCanonicalization != "relaxed" {
		t.Errorf("BodyCanonicalization = %q, want %q",
			config.BodyCanonicalization, "relaxed")
	}
}

func TestChainValidation_String(t *testing.T) {
	tests := []struct {
		cv       ChainValidation
		expected string
	}{
		{ChainValidationNone, "none"},
		{ChainValidationPass, "pass"},
		{ChainValidationFail, "fail"},
		{ChainValidationUnknown, "unknown"},
	}

	for _, tt := range tests {
		t.Run(string(tt.cv), func(t *testing.T) {
			if string(tt.cv) != tt.expected {
				t.Errorf("ChainValidation = %q, want %q", string(tt.cv), tt.expected)
			}
		})
	}
}

func TestParseARCParams(t *testing.T) {
	tests := []struct {
		name     string
		header   string
		expected map[string]string
	}{
		{
			name:   "simple params",
			header: "i=1; a=rsa-sha256; d=example.com; s=selector",
			expected: map[string]string{
				"i": "1",
				"a": "rsa-sha256",
				"d": "example.com",
				"s": "selector",
			},
		},
		{
			name:   "with chain validation",
			header: "i=2; a=rsa-sha256; cv=pass; d=example.com; s=selector",
			expected: map[string]string{
				"i":  "2",
				"a":  "rsa-sha256",
				"cv": "pass",
				"d":  "example.com",
				"s":  "selector",
			},
		},
		{
			name:   "with folding",
			header: "i=1; a=rsa-sha256;\r\n d=example.com",
			expected: map[string]string{
				"i": "1",
				"a": "rsa-sha256",
				"d": "example.com",
			},
		},
		{
			name:   "with extra spaces",
			header: "i=1;  a=rsa-sha256;   d=example.com  ",
			expected: map[string]string{
				"i": "1",
				"a": "rsa-sha256",
				"d": "example.com",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseARCParams(tt.header)
			for key, expectedValue := range tt.expected {
				if result[key] != expectedValue {
					t.Errorf("parseARCParams()[%q] = %q, want %q",
						key, result[key], expectedValue)
				}
			}
		})
	}
}

func TestCanonicalizeBody(t *testing.T) {
	tests := []struct {
		name     string
		body     []byte
		method   string
		expected []byte
	}{
		{
			name:     "simple - trailing newlines",
			body:     []byte("Hello World\r\n\r\n\r\n"),
			method:   "simple",
			expected: []byte("Hello World\r\n"),
		},
		{
			name:     "relaxed - multiple spaces",
			body:     []byte("Hello    World"),
			method:   "relaxed",
			expected: []byte("Hello World\r\n"),
		},
		{
			name:     "relaxed - trailing whitespace",
			body:     []byte("Hello World   "),
			method:   "relaxed",
			expected: []byte("Hello World\r\n"),
		},
		{
			name:     "relaxed - empty body",
			body:     []byte{},
			method:   "relaxed",
			expected: []byte("\r\n"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := canonicalizeBody(tt.body, tt.method)
			if string(result) != string(tt.expected) {
				t.Errorf("canonicalizeBody() = %q, want %q",
					string(result), string(tt.expected))
			}
		})
	}
}

func TestCanonicalizeHeaderValue(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		method   string
		expected string
	}{
		{
			name:     "simple - unchanged",
			value:    "Hello   World",
			method:   "simple",
			expected: "Hello   World",
		},
		{
			name:     "relaxed - collapses spaces",
			value:    "Hello   World",
			method:   "relaxed",
			expected: "Hello World",
		},
		{
			name:     "relaxed - removes leading/trailing spaces",
			value:    "  Hello World  ",
			method:   "relaxed",
			expected: "Hello World",
		},
		{
			name:     "relaxed - handles folded headers",
			value:    "Hello\r\n World",
			method:   "relaxed",
			expected: "Hello World",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := canonicalizeHeaderValue(tt.value, tt.method)
			if result != tt.expected {
				t.Errorf("canonicalizeHeaderValue() = %q, want %q",
					result, tt.expected)
			}
		})
	}
}

func TestFoldSignature(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected int // expected number of line breaks
	}{
		{
			name:     "short signature",
			input:    "abc123",
			expected: 0,
		},
		{
			name:     "exactly 72 chars",
			input:    "123456789012345678901234567890123456789012345678901234567890123456789012",
			expected: 0,
		},
		{
			name:     "100 chars - should fold once",
			input:    "1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890",
			expected: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := foldSignature(tt.input)
			lineBreaks := 0
			for i := 0; i < len(result)-1; i++ {
				if result[i] == '\r' && result[i+1] == '\n' {
					lineBreaks++
				}
			}
			if lineBreaks != tt.expected {
				t.Errorf("foldSignature() produced %d line breaks, want %d",
					lineBreaks, tt.expected)
			}
		})
	}
}

func TestGetSignableHeaders(t *testing.T) {
	headers := map[string][]string{
		"From":       {"sender@example.com"},
		"To":         {"recipient@example.com"},
		"Subject":    {"Test Subject"},
		"Date":       {"Mon, 01 Jan 2024 00:00:00 +0000"},
		"Message-Id": {"<123@example.com>"},
	}

	tests := []struct {
		name        string
		wantHeaders []string
		expected    []string
	}{
		{
			name:        "all headers exist",
			wantHeaders: []string{"From", "To", "Subject"},
			expected:    []string{"From", "To", "Subject"},
		},
		{
			name:        "some headers missing",
			wantHeaders: []string{"From", "Cc", "Subject", "Reply-To"},
			expected:    []string{"From", "Subject"},
		},
		{
			name:        "no headers exist",
			wantHeaders: []string{"Cc", "Bcc", "Reply-To"},
			expected:    nil,
		},
	}

	// Convert to mail.Header format
	mailHeaders := make(map[string][]string)
	for k, v := range headers {
		mailHeaders[k] = v
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getSignableHeaders(mailHeaders, tt.wantHeaders)
			if len(result) != len(tt.expected) {
				t.Fatalf("getSignableHeaders() returned %d headers, want %d",
					len(result), len(tt.expected))
			}
			for i, h := range result {
				if h != tt.expected[i] {
					t.Errorf("getSignableHeaders()[%d] = %q, want %q",
						i, h, tt.expected[i])
				}
			}
		})
	}
}

func TestNewSigner(t *testing.T) {
	logger := zap.NewNop()
	provider := &mockKeyProvider{keys: map[string]*domain.DKIMKey{}}

	signer := NewSigner(provider, "mail.example.com", logger)

	if signer == nil {
		t.Fatal("NewSigner() returned nil")
	}
	if signer.hostname != "mail.example.com" {
		t.Errorf("hostname = %q, want %q", signer.hostname, "mail.example.com")
	}
	if signer.logger == nil {
		t.Error("logger should not be nil")
	}
}

func TestNewVerifier(t *testing.T) {
	logger := zap.NewNop()
	verifier := NewVerifier(logger)

	if verifier == nil {
		t.Fatal("NewVerifier() returned nil")
	}
	if verifier.logger == nil {
		t.Error("logger should not be nil")
	}
}

// Mock key provider
type mockKeyProvider struct {
	keys map[string]*domain.DKIMKey
}

func (m *mockKeyProvider) GetActiveDKIMKey(domainName string) *domain.DKIMKey {
	return m.keys[domainName]
}

func TestSigner_BuildAuthenticationResults(t *testing.T) {
	logger := zap.NewNop()
	provider := &mockKeyProvider{}
	signer := NewSigner(provider, "mail.example.com", logger)

	authResults := []AuthResult{
		{Method: "spf", Result: "pass"},
		{Method: "dkim", Result: "pass", Properties: map[string]string{"header.d": "example.com"}},
		{Method: "dmarc", Result: "pass"},
	}

	result := signer.buildAuthenticationResults(1, authResults, ChainValidationPass)

	// Verify instance is included
	if !contains(result, "i=1") {
		t.Error("Result should contain instance i=1")
	}

	// Verify hostname is included
	if !contains(result, "mail.example.com") {
		t.Error("Result should contain hostname")
	}

	// Verify arc chain validation
	if !contains(result, "arc=pass") {
		t.Error("Result should contain arc=pass")
	}

	// Verify auth results
	if !contains(result, "spf=pass") {
		t.Error("Result should contain spf=pass")
	}
	if !contains(result, "dkim=pass") {
		t.Error("Result should contain dkim=pass")
	}
	if !contains(result, "dmarc=pass") {
		t.Error("Result should contain dmarc=pass")
	}
}

func TestSigner_SignMessage_NoKey(t *testing.T) {
	logger := zap.NewNop()
	provider := &mockKeyProvider{keys: map[string]*domain.DKIMKey{}}
	signer := NewSigner(provider, "mail.example.com", logger)

	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody")
	authResults := []AuthResult{{Method: "spf", Result: "pass"}}

	_, err := signer.SignMessage("example.com", message, authResults, ChainValidationPass, nil)
	if err == nil {
		t.Error("SignMessage() should return error when no key exists")
	}
	if !contains(err.Error(), "no active signing key") {
		t.Errorf("Error should mention no active signing key, got: %v", err)
	}
}

func TestSigner_SignMessage_ValidMessage(t *testing.T) {
	logger := zap.NewNop()

	// Generate a test RSA key
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("Failed to generate RSA key: %v", err)
	}

	provider := &mockKeyProvider{
		keys: map[string]*domain.DKIMKey{
			"example.com": {
				ID:         "key-123",
				Selector:   "arc",
				Algorithm:  "rsa-sha256",
				PrivateKey: privateKey,
			},
		},
	}
	signer := NewSigner(provider, "mail.example.com", logger)

	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\nDate: Mon, 01 Jan 2024 00:00:00 +0000\r\n\r\nThis is the body.")
	authResults := []AuthResult{
		{Method: "spf", Result: "pass"},
		{Method: "dkim", Result: "pass"},
	}

	signed, err := signer.SignMessage("example.com", message, authResults, ChainValidationNone, nil)
	if err != nil {
		t.Fatalf("SignMessage() error = %v", err)
	}

	signedStr := string(signed)

	// Verify ARC-Seal header is present
	if !contains(signedStr, "ARC-Seal:") {
		t.Error("Signed message should contain ARC-Seal header")
	}

	// Verify ARC-Message-Signature header is present
	if !contains(signedStr, "ARC-Message-Signature:") {
		t.Error("Signed message should contain ARC-Message-Signature header")
	}

	// Verify ARC-Authentication-Results header is present
	if !contains(signedStr, "ARC-Authentication-Results:") {
		t.Error("Signed message should contain ARC-Authentication-Results header")
	}

	// Verify instance is 1 (first ARC set)
	if !contains(signedStr, "i=1") {
		t.Error("ARC headers should have instance i=1")
	}

	// Verify original message is preserved
	if !contains(signedStr, "From: sender@example.com") {
		t.Error("Original message should be preserved")
	}
}

func TestVerifier_VerifyChain_NoHeaders(t *testing.T) {
	logger := zap.NewNop()
	verifier := NewVerifier(logger)

	// Message without ARC headers
	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody")

	result, err := verifier.VerifyChain(message)
	if err != nil {
		t.Fatalf("VerifyChain() error = %v", err)
	}

	if result.Validation != ChainValidationNone {
		t.Errorf("Validation = %v, want %v", result.Validation, ChainValidationNone)
	}
	if result.TotalSets != 0 {
		t.Errorf("TotalSets = %d, want 0", result.TotalSets)
	}
}

func TestAuthResult_Fields(t *testing.T) {
	ar := AuthResult{
		Method: "dkim",
		Result: "pass",
		Reason: "good signature",
		Properties: map[string]string{
			"header.d": "example.com",
			"header.s": "selector",
		},
	}

	if ar.Method != "dkim" {
		t.Errorf("Method = %q, want %q", ar.Method, "dkim")
	}
	if ar.Result != "pass" {
		t.Errorf("Result = %q, want %q", ar.Result, "pass")
	}
	if ar.Reason != "good signature" {
		t.Errorf("Reason = %q, want %q", ar.Reason, "good signature")
	}
	if ar.Properties["header.d"] != "example.com" {
		t.Errorf("Properties[header.d] = %q, want %q", ar.Properties["header.d"], "example.com")
	}
}

func TestARCSet_Fields(t *testing.T) {
	set := ARCSet{
		Instance:              1,
		Seal:                  "i=1; a=rsa-sha256; cv=none; d=example.com; s=arc; b=...",
		MessageSignature:      "i=1; a=rsa-sha256; d=example.com; s=arc; h=from:to; bh=...; b=...",
		AuthenticationResults: "i=1; mail.example.com; arc=none; spf=pass; dkim=pass",
	}

	if set.Instance != 1 {
		t.Errorf("Instance = %d, want 1", set.Instance)
	}
	if set.Seal == "" {
		t.Error("Seal should not be empty")
	}
	if set.MessageSignature == "" {
		t.Error("MessageSignature should not be empty")
	}
	if set.AuthenticationResults == "" {
		t.Error("AuthenticationResults should not be empty")
	}
}

func TestChainResult_Fields(t *testing.T) {
	result := ChainResult{
		Validation:   ChainValidationPass,
		HighestValid: 3,
		TotalSets:    3,
		Sets: []*ARCSetResult{
			{Instance: 1, SealValid: true, MessageSignatureValid: true},
			{Instance: 2, SealValid: true, MessageSignatureValid: true},
			{Instance: 3, SealValid: true, MessageSignatureValid: true},
		},
	}

	if result.Validation != ChainValidationPass {
		t.Errorf("Validation = %v, want %v", result.Validation, ChainValidationPass)
	}
	if result.HighestValid != 3 {
		t.Errorf("HighestValid = %d, want 3", result.HighestValid)
	}
	if result.TotalSets != 3 {
		t.Errorf("TotalSets = %d, want 3", result.TotalSets)
	}
	if len(result.Sets) != 3 {
		t.Errorf("len(Sets) = %d, want 3", len(result.Sets))
	}
}

// Helper function
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstr(s, substr))
}

func containsSubstr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
