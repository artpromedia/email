package dkim

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"net/mail"
	"strings"
	"testing"
	"time"

	"go.uber.org/zap"

	"github.com/oonrumail/smtp-server/domain"
)

// mockDNSResolver is a mock DNS resolver for testing DKIM verification
type mockDNSResolver struct {
	records map[string][]string
	err     error
}

func (m *mockDNSResolver) LookupTXT(ctx context.Context, name string) ([]string, error) {
	if m.err != nil {
		return nil, m.err
	}
	if records, ok := m.records[name]; ok {
		return records, nil
	}
	return nil, fmt.Errorf("no records found for %s", name)
}

func TestDefaultSignatureConfig(t *testing.T) {
	config := DefaultSignatureConfig()

	if config == nil {
		t.Fatal("DefaultSignatureConfig() returned nil")
	}

	// Verify default headers
	expectedHeaders := []string{
		"from", "to", "cc", "subject", "date",
		"message-id", "reply-to", "references",
		"in-reply-to", "content-type", "mime-version",
	}

	if len(config.Headers) != len(expectedHeaders) {
		t.Errorf("DefaultSignatureConfig() headers count = %d, want %d",
			len(config.Headers), len(expectedHeaders))
	}

	for i, h := range config.Headers {
		if h != expectedHeaders[i] {
			t.Errorf("DefaultSignatureConfig() headers[%d] = %q, want %q",
				i, h, expectedHeaders[i])
		}
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

	// Verify defaults
	if config.BodyLengthLimit != 0 {
		t.Errorf("BodyLengthLimit = %d, want 0", config.BodyLengthLimit)
	}
	if config.ExpireAfter != 7*24*time.Hour {
		t.Errorf("ExpireAfter = %v, want %v", config.ExpireAfter, 7*24*time.Hour)
	}
}

func TestCanonicalizeBodySimple(t *testing.T) {
	tests := []struct {
		name     string
		input    []byte
		expected []byte
	}{
		{
			name:     "empty body",
			input:    []byte{},
			expected: []byte{},
		},
		{
			name:     "simple text",
			input:    []byte("Hello World"),
			expected: []byte("Hello World\r\n"),
		},
		{
			name:     "text with trailing newlines",
			input:    []byte("Hello World\r\n\r\n\r\n"),
			expected: []byte("Hello World\r\n"),
		},
		{
			name:     "multiline text",
			input:    []byte("Line 1\r\nLine 2\r\n"),
			expected: []byte("Line 1\r\nLine 2\r\n"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := canonicalizeBodySimple(tt.input)
			if string(result) != string(tt.expected) {
				t.Errorf("canonicalizeBodySimple() = %q, want %q",
					string(result), string(tt.expected))
			}
		})
	}
}

func TestCanonicalizeBodyRelaxed(t *testing.T) {
	tests := []struct {
		name     string
		input    []byte
		expected []byte
	}{
		{
			name:     "empty body",
			input:    []byte{},
			expected: []byte("\r\n"),
		},
		{
			name:     "simple text",
			input:    []byte("Hello World"),
			expected: []byte("Hello World\r\n"),
		},
		{
			name:     "text with multiple spaces",
			input:    []byte("Hello    World"),
			expected: []byte("Hello World\r\n"),
		},
		{
			name:     "text with tabs",
			input:    []byte("Hello\t\tWorld"),
			expected: []byte("Hello World\r\n"),
		},
		{
			name:     "text with trailing whitespace",
			input:    []byte("Hello World   "),
			expected: []byte("Hello World\r\n"),
		},
		{
			name:     "text with trailing empty lines",
			input:    []byte("Hello World\n\n\n"),
			expected: []byte("Hello World\r\n"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := canonicalizeBodyRelaxed(tt.input)
			if string(result) != string(tt.expected) {
				t.Errorf("canonicalizeBodyRelaxed() = %q, want %q",
					string(result), string(tt.expected))
			}
		})
	}
}

func TestCanonicalizeBody(t *testing.T) {
	input := []byte("Hello    World\r\n\r\n")

	t.Run("simple method", func(t *testing.T) {
		result := canonicalizeBody(input, "simple")
		expected := canonicalizeBodySimple(input)
		if string(result) != string(expected) {
			t.Errorf("canonicalizeBody(simple) = %q, want %q",
				string(result), string(expected))
		}
	})

	t.Run("relaxed method", func(t *testing.T) {
		result := canonicalizeBody(input, "relaxed")
		expected := canonicalizeBodyRelaxed(input)
		if string(result) != string(expected) {
			t.Errorf("canonicalizeBody(relaxed) = %q, want %q",
				string(result), string(expected))
		}
	})

	t.Run("default method", func(t *testing.T) {
		result := canonicalizeBody(input, "unknown")
		expected := canonicalizeBodyRelaxed(input)
		if string(result) != string(expected) {
			t.Errorf("canonicalizeBody(unknown) = %q, want %q",
				string(result), string(expected))
		}
	})
}

func TestCanonicalizeHeaderValue(t *testing.T) {
	tests := []struct {
		name     string
		value    string
		method   string
		expected string
	}{
		{
			name:     "simple method unchanged",
			value:    "Hello   World",
			method:   "simple",
			expected: "Hello   World",
		},
		{
			name:     "relaxed collapses spaces",
			value:    "Hello   World",
			method:   "relaxed",
			expected: "Hello World",
		},
		{
			name:     "relaxed removes leading/trailing spaces",
			value:    "  Hello World  ",
			method:   "relaxed",
			expected: "Hello World",
		},
		{
			name:     "relaxed handles folded headers",
			value:    "Hello\r\n World",
			method:   "relaxed",
			expected: "Hello World",
		},
		{
			name:     "relaxed handles tabs",
			value:    "Hello\t\tWorld",
			method:   "relaxed",
			expected: "Hello World",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := canonicalizeHeaderValue(tt.value, tt.method)
			if result != tt.expected {
				t.Errorf("canonicalizeHeaderValue(%q, %q) = %q, want %q",
					tt.value, tt.method, result, tt.expected)
			}
		})
	}
}

func TestFoldSignature(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "short signature",
			input:    "abc123",
			expected: "abc123",
		},
		{
			name:     "exactly 72 chars",
			input:    strings.Repeat("a", 72),
			expected: strings.Repeat("a", 72),
		},
		{
			name:     "longer than 72 chars",
			input:    strings.Repeat("a", 100),
			expected: strings.Repeat("a", 72) + "\r\n\t" + strings.Repeat("a", 28),
		},
		{
			name:     "144 chars (two full lines)",
			input:    strings.Repeat("b", 144),
			expected: strings.Repeat("b", 72) + "\r\n\t" + strings.Repeat("b", 72),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := foldSignature(tt.input)
			if result != tt.expected {
				t.Errorf("foldSignature() length = %d, want %d",
					len(result), len(tt.expected))
			}
		})
	}
}

func TestGetSignableHeaders(t *testing.T) {
	headers := mail.Header{
		"From":       []string{"sender@example.com"},
		"To":         []string{"recipient@example.com"},
		"Subject":    []string{"Test Subject"},
		"Date":       []string{"Mon, 01 Jan 2024 00:00:00 +0000"},
		"Message-Id": []string{"<123@example.com>"},
	}

	tests := []struct {
		name        string
		wantHeaders []string
		expected    []string
	}{
		{
			name:        "all headers exist",
			wantHeaders: []string{"from", "to", "subject"},
			expected:    []string{"from", "to", "subject"},
		},
		{
			name:        "some headers missing",
			wantHeaders: []string{"from", "cc", "subject", "reply-to"},
			expected:    []string{"from", "subject"},
		},
		{
			name:        "no headers exist",
			wantHeaders: []string{"cc", "bcc", "reply-to"},
			expected:    nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getSignableHeaders(headers, tt.wantHeaders)
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

func TestParseSignatureParams(t *testing.T) {
	tests := []struct {
		name      string
		signature string
		expected  map[string]string
	}{
		{
			name:      "simple signature",
			signature: "v=1; a=rsa-sha256; d=example.com; s=selector",
			expected: map[string]string{
				"v": "1",
				"a": "rsa-sha256",
				"d": "example.com",
				"s": "selector",
			},
		},
		{
			name:      "signature with body hash",
			signature: "v=1; a=rsa-sha256; d=example.com; bh=abc123; b=xyz789",
			expected: map[string]string{
				"v":  "1",
				"a":  "rsa-sha256",
				"d":  "example.com",
				"bh": "abc123",
				"b":  "xyz789",
			},
		},
		{
			name:      "signature with folding",
			signature: "v=1; a=rsa-sha256;\r\n d=example.com",
			expected: map[string]string{
				"v": "1",
				"a": "rsa-sha256",
				"d": "example.com",
			},
		},
		{
			name:      "signature with extra spaces",
			signature: "v=1;  a=rsa-sha256;   d=example.com  ",
			expected: map[string]string{
				"v": "1",
				"a": "rsa-sha256",
				"d": "example.com",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseSignatureParams(tt.signature)
			for key, expectedValue := range tt.expected {
				if result[key] != expectedValue {
					t.Errorf("parseSignatureParams()[%q] = %q, want %q",
						key, result[key], expectedValue)
				}
			}
		})
	}
}

func TestParseTimestamp(t *testing.T) {
	tests := []struct {
		name      string
		ts        string
		wantErr   bool
		checkTime bool
	}{
		{
			name:      "valid timestamp",
			ts:        "1704067200", // 2024-01-01 00:00:00 UTC
			wantErr:   false,
			checkTime: true,
		},
		{
			name:    "invalid timestamp",
			ts:      "not-a-number",
			wantErr: true,
		},
		{
			name:      "zero timestamp",
			ts:        "0",
			wantErr:   false,
			checkTime: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := parseTimestamp(tt.ts)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseTimestamp(%q) error = %v, wantErr = %v",
					tt.ts, err, tt.wantErr)
			}
			if !tt.wantErr && tt.checkTime {
				if result.IsZero() && tt.ts != "0" {
					t.Errorf("parseTimestamp(%q) returned zero time", tt.ts)
				}
			}
		})
	}
}

func TestVerifier_NewVerifier(t *testing.T) {
	logger := zap.NewNop()
	verifier := NewVerifier(logger)

	if verifier == nil {
		t.Fatal("NewVerifier() returned nil")
	}
	if verifier.logger == nil {
		t.Error("NewVerifier() did not set logger")
	}
}

func TestKeyManager_NewKeyManager(t *testing.T) {
	logger := zap.NewNop()
	km := NewKeyManager(logger)

	if km == nil {
		t.Fatal("NewKeyManager() returned nil")
	}
	if km.logger == nil {
		t.Error("NewKeyManager() did not set logger")
	}
}

func TestKeyManager_GenerateDNSRecord(t *testing.T) {
	logger := zap.NewNop()
	km := NewKeyManager(logger)

	key := &domain.DKIMKey{
		ID:        "key-123",
		Selector:  "default",
		PublicKey: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
	}

	record := km.GenerateDNSRecord(key, "example.com")

	// Verify record format
	if !strings.HasPrefix(record, "default._domainkey.example.com TXT") {
		t.Errorf("GenerateDNSRecord() prefix incorrect: %s", record)
	}
	if !strings.Contains(record, "v=DKIM1") {
		t.Error("GenerateDNSRecord() missing v=DKIM1")
	}
	if !strings.Contains(record, "k=rsa") {
		t.Error("GenerateDNSRecord() missing k=rsa")
	}
	if !strings.Contains(record, "p=") {
		t.Error("GenerateDNSRecord() missing p= (public key)")
	}
	// Verify PEM headers are removed
	if strings.Contains(record, "BEGIN PUBLIC KEY") {
		t.Error("GenerateDNSRecord() should not contain PEM header")
	}
}

func TestKeyManager_GetRotationCandidates(t *testing.T) {
	logger := zap.NewNop()
	km := NewKeyManager(logger)

	now := time.Now()
	rotationAge := 90 * 24 * time.Hour

	keys := []*domain.DKIMKey{
		{
			ID:        "old-active",
			IsActive:  true,
			CreatedAt: now.Add(-100 * 24 * time.Hour), // 100 days old
		},
		{
			ID:        "new-active",
			IsActive:  true,
			CreatedAt: now.Add(-30 * 24 * time.Hour), // 30 days old
		},
		{
			ID:        "inactive",
			IsActive:  false,
			CreatedAt: now.Add(-200 * 24 * time.Hour), // 200 days old but inactive
		},
		{
			ID:       "expiring-soon",
			IsActive: true,
			CreatedAt: now.Add(-60 * 24 * time.Hour),
			ExpiresAt: func() *time.Time { t := now.Add(5 * 24 * time.Hour); return &t }(), // Expires in 5 days
		},
	}

	candidates := km.GetRotationCandidates(keys, rotationAge)

	// Should include old-active (over 90 days) and expiring-soon (expires in < 7 days)
	if len(candidates) != 2 {
		t.Fatalf("GetRotationCandidates() returned %d candidates, want 2", len(candidates))
	}

	// Verify the candidates are correct
	ids := make(map[string]bool)
	for _, c := range candidates {
		ids[c.ID] = true
	}

	if !ids["old-active"] {
		t.Error("GetRotationCandidates() should include old-active key")
	}
	if !ids["expiring-soon"] {
		t.Error("GetRotationCandidates() should include expiring-soon key")
	}
	if ids["new-active"] {
		t.Error("GetRotationCandidates() should not include new-active key")
	}
	if ids["inactive"] {
		t.Error("GetRotationCandidates() should not include inactive key")
	}
}

// Mock DKIM key provider for testing
type mockKeyProvider struct {
	keys map[string]*domain.DKIMKey
}

func (m *mockKeyProvider) GetActiveDKIMKey(domainName string) *domain.DKIMKey {
	return m.keys[domainName]
}

func TestSigner_NewSigner(t *testing.T) {
	logger := zap.NewNop()
	provider := &mockKeyProvider{}
	signer := NewSigner(provider, logger)

	if signer == nil {
		t.Fatal("NewSigner() returned nil")
	}
	if signer.cache == nil {
		t.Error("NewSigner() did not set cache")
	}
	if signer.logger == nil {
		t.Error("NewSigner() did not set logger")
	}
}

func TestSigner_SignMessage_NoKey(t *testing.T) {
	logger := zap.NewNop()
	provider := &mockKeyProvider{keys: map[string]*domain.DKIMKey{}}
	signer := NewSigner(provider, logger)

	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody")

	_, err := signer.SignMessage("example.com", message, nil)
	if err == nil {
		t.Error("SignMessage() should return error when no DKIM key exists")
	}
	if !strings.Contains(err.Error(), "no active DKIM key") {
		t.Errorf("SignMessage() error = %v, want error about no active DKIM key", err)
	}
}

func TestSigner_SignMessage_InvalidMessage(t *testing.T) {
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
				Selector:   "default",
				Algorithm:  "rsa-sha256",
				PrivateKey: privateKey,
			},
		},
	}
	signer := NewSigner(provider, logger)

	// Invalid message (not RFC 5322 compliant)
	invalidMessage := []byte("This is not a valid email message")

	_, err = signer.SignMessage("example.com", invalidMessage, nil)
	if err == nil {
		t.Error("SignMessage() should return error for invalid message format")
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
				Selector:   "default",
				Algorithm:  "rsa-sha256",
				PrivateKey: privateKey,
			},
		},
	}
	signer := NewSigner(provider, logger)

	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\nDate: Mon, 01 Jan 2024 00:00:00 +0000\r\n\r\nThis is the body.")

	signed, err := signer.SignMessage("example.com", message, nil)
	if err != nil {
		t.Fatalf("SignMessage() error = %v", err)
	}

	// Verify DKIM-Signature header is present
	if !strings.HasPrefix(string(signed), "DKIM-Signature:") {
		t.Error("SignMessage() result should start with DKIM-Signature header")
	}

	// Verify signature contains required fields
	signedStr := string(signed)
	requiredParams := []string{"v=1", "a=rsa-sha256", "d=example.com", "s=default", "bh=", "b="}
	for _, param := range requiredParams {
		if !strings.Contains(signedStr, param) {
			t.Errorf("SignMessage() result missing parameter: %s", param)
		}
	}

	// Verify original message is preserved
	if !strings.Contains(signedStr, "From: sender@example.com") {
		t.Error("SignMessage() should preserve original message")
	}
}

// Helper function to generate a test key pair and DNS record
func generateTestKeyPair(t *testing.T) (*rsa.PrivateKey, string) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("Failed to generate RSA key: %v", err)
	}

	// Generate public key in DER format
	pubDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		t.Fatalf("Failed to marshal public key: %v", err)
	}

	pubB64 := base64.StdEncoding.EncodeToString(pubDER)
	dnsRecord := fmt.Sprintf("v=DKIM1; k=rsa; p=%s", pubB64)

	return privateKey, dnsRecord
}

func TestVerifier_VerifyMessage_ValidSignature(t *testing.T) {
	logger := zap.NewNop()

	// Generate test key pair
	privateKey, dnsRecord := generateTestKeyPair(t)

	// Set up mock DNS resolver
	resolver := &mockDNSResolver{
		records: map[string][]string{
			"default._domainkey.example.com": {dnsRecord},
		},
	}

	// Create signer and sign a message
	provider := &mockKeyProvider{
		keys: map[string]*domain.DKIMKey{
			"example.com": {
				ID:         "key-123",
				Selector:   "default",
				Algorithm:  "rsa-sha256",
				PrivateKey: privateKey,
			},
		},
	}
	signer := NewSigner(provider, logger)

	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\nDate: Mon, 01 Jan 2024 00:00:00 +0000\r\n\r\nThis is the body.")

	signed, err := signer.SignMessage("example.com", message, nil)
	if err != nil {
		t.Fatalf("SignMessage() error = %v", err)
	}

	// Create verifier and verify the signature
	verifier := NewVerifierWithResolver(logger, resolver)

	results, err := verifier.VerifyMessage(signed)
	if err != nil {
		t.Fatalf("VerifyMessage() error = %v", err)
	}

	if len(results) == 0 {
		t.Fatal("VerifyMessage() returned no results")
	}

	if results[0].Status != VerificationPass {
		t.Errorf("VerifyMessage() status = %v, want %v, error: %v",
			results[0].Status, VerificationPass, results[0].Error)
	}

	if !results[0].Valid {
		t.Error("VerifyMessage() result should be valid")
	}

	if results[0].Domain != "example.com" {
		t.Errorf("VerifyMessage() domain = %v, want example.com", results[0].Domain)
	}

	if results[0].Selector != "default" {
		t.Errorf("VerifyMessage() selector = %v, want default", results[0].Selector)
	}
}

func TestVerifier_VerifyMessage_InvalidSignature(t *testing.T) {
	logger := zap.NewNop()

	// Generate two different key pairs
	privateKey, _ := generateTestKeyPair(t)
	_, differentDnsRecord := generateTestKeyPair(t) // Different key in DNS

	// Set up mock DNS resolver with a DIFFERENT key
	resolver := &mockDNSResolver{
		records: map[string][]string{
			"default._domainkey.example.com": {differentDnsRecord},
		},
	}

	// Create signer and sign a message with the first key
	provider := &mockKeyProvider{
		keys: map[string]*domain.DKIMKey{
			"example.com": {
				ID:         "key-123",
				Selector:   "default",
				Algorithm:  "rsa-sha256",
				PrivateKey: privateKey,
			},
		},
	}
	signer := NewSigner(provider, logger)

	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\nDate: Mon, 01 Jan 2024 00:00:00 +0000\r\n\r\nThis is the body.")

	signed, err := signer.SignMessage("example.com", message, nil)
	if err != nil {
		t.Fatalf("SignMessage() error = %v", err)
	}

	// Create verifier - should fail because DNS has different key
	verifier := NewVerifierWithResolver(logger, resolver)

	results, err := verifier.VerifyMessage(signed)
	if err != nil {
		t.Fatalf("VerifyMessage() error = %v", err)
	}

	if len(results) == 0 {
		t.Fatal("VerifyMessage() returned no results")
	}

	if results[0].Status != VerificationFail {
		t.Errorf("VerifyMessage() status = %v, want %v", results[0].Status, VerificationFail)
	}

	if results[0].Valid {
		t.Error("VerifyMessage() result should not be valid")
	}
}

func TestVerifier_VerifyMessage_DNSFailure(t *testing.T) {
	logger := zap.NewNop()

	// Generate test key pair
	privateKey, _ := generateTestKeyPair(t)

	// Set up mock DNS resolver that returns an error
	resolver := &mockDNSResolver{
		err: fmt.Errorf("DNS lookup failed: connection refused"),
	}

	// Create signer and sign a message
	provider := &mockKeyProvider{
		keys: map[string]*domain.DKIMKey{
			"example.com": {
				ID:         "key-123",
				Selector:   "default",
				Algorithm:  "rsa-sha256",
				PrivateKey: privateKey,
			},
		},
	}
	signer := NewSigner(provider, logger)

	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\nDate: Mon, 01 Jan 2024 00:00:00 +0000\r\n\r\nThis is the body.")

	signed, err := signer.SignMessage("example.com", message, nil)
	if err != nil {
		t.Fatalf("SignMessage() error = %v", err)
	}

	// Create verifier - should return permerror due to DNS failure
	verifier := NewVerifierWithResolver(logger, resolver)

	results, err := verifier.VerifyMessage(signed)
	if err != nil {
		t.Fatalf("VerifyMessage() error = %v", err)
	}

	if len(results) == 0 {
		t.Fatal("VerifyMessage() returned no results")
	}

	// DNS failure should result in permerror or temperror
	if results[0].Status != VerificationPermFail && results[0].Status != VerificationTempFail {
		t.Errorf("VerifyMessage() status = %v, want permerror or temperror", results[0].Status)
	}

	if results[0].Valid {
		t.Error("VerifyMessage() result should not be valid")
	}
}

func TestVerifier_VerifyMessage_ExpiredSignature(t *testing.T) {
	logger := zap.NewNop()

	// Generate test key pair
	privateKey, dnsRecord := generateTestKeyPair(t)

	// Set up mock DNS resolver
	resolver := &mockDNSResolver{
		records: map[string][]string{
			"default._domainkey.example.com": {dnsRecord},
		},
	}

	// Create a message with an expired DKIM signature
	// We'll manually craft a message with x= in the past
	expiredTime := time.Now().Add(-1 * time.Hour).Unix()
	signTime := time.Now().Add(-2 * time.Hour).Unix()

	// The signature is invalid anyway, but we're testing expiration check
	expiredMessage := fmt.Sprintf(`DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com; s=default; t=%d; x=%d; h=from:to:subject:date; bh=test; b=test
From: sender@example.com
To: recipient@example.com
Subject: Test
Date: Mon, 01 Jan 2024 00:00:00 +0000

This is the body.`, signTime, expiredTime)

	// Create verifier
	verifier := NewVerifierWithResolver(logger, resolver)

	results, err := verifier.VerifyMessage([]byte(expiredMessage))
	if err != nil {
		t.Fatalf("VerifyMessage() error = %v", err)
	}

	if len(results) == 0 {
		t.Fatal("VerifyMessage() returned no results")
	}

	// Should fail due to expiration
	if results[0].Status != VerificationFail {
		t.Errorf("VerifyMessage() status = %v, want %v", results[0].Status, VerificationFail)
	}

	if results[0].Error == nil || !strings.Contains(results[0].Error.Error(), "expired") {
		t.Errorf("VerifyMessage() error should mention expiration, got: %v", results[0].Error)
	}

	_ = privateKey // Silence unused variable warning
}

func TestVerifier_VerifyMessage_RevokedKey(t *testing.T) {
	logger := zap.NewNop()

	// Generate test key pair
	privateKey, _ := generateTestKeyPair(t)

	// Set up mock DNS resolver with REVOKED key (empty p= value)
	resolver := &mockDNSResolver{
		records: map[string][]string{
			"default._domainkey.example.com": {"v=DKIM1; k=rsa; p="}, // Empty p= means revoked
		},
	}

	// Create signer and sign a message
	provider := &mockKeyProvider{
		keys: map[string]*domain.DKIMKey{
			"example.com": {
				ID:         "key-123",
				Selector:   "default",
				Algorithm:  "rsa-sha256",
				PrivateKey: privateKey,
			},
		},
	}
	signer := NewSigner(provider, logger)

	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\nDate: Mon, 01 Jan 2024 00:00:00 +0000\r\n\r\nThis is the body.")

	signed, err := signer.SignMessage("example.com", message, nil)
	if err != nil {
		t.Fatalf("SignMessage() error = %v", err)
	}

	// Create verifier - should fail because key is revoked
	verifier := NewVerifierWithResolver(logger, resolver)

	results, err := verifier.VerifyMessage(signed)
	if err != nil {
		t.Fatalf("VerifyMessage() error = %v", err)
	}

	if len(results) == 0 {
		t.Fatal("VerifyMessage() returned no results")
	}

	if results[0].Status != VerificationPermFail {
		t.Errorf("VerifyMessage() status = %v, want %v", results[0].Status, VerificationPermFail)
	}

	if results[0].Error == nil || !strings.Contains(results[0].Error.Error(), "revoked") {
		t.Errorf("VerifyMessage() error should mention revoked, got: %v", results[0].Error)
	}
}

func TestVerifier_VerifyMessage_BodyModified(t *testing.T) {
	logger := zap.NewNop()

	// Generate test key pair
	privateKey, dnsRecord := generateTestKeyPair(t)

	// Set up mock DNS resolver
	resolver := &mockDNSResolver{
		records: map[string][]string{
			"default._domainkey.example.com": {dnsRecord},
		},
	}

	// Create signer and sign a message
	provider := &mockKeyProvider{
		keys: map[string]*domain.DKIMKey{
			"example.com": {
				ID:         "key-123",
				Selector:   "default",
				Algorithm:  "rsa-sha256",
				PrivateKey: privateKey,
			},
		},
	}
	signer := NewSigner(provider, logger)

	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\nDate: Mon, 01 Jan 2024 00:00:00 +0000\r\n\r\nThis is the body.")

	signed, err := signer.SignMessage("example.com", message, nil)
	if err != nil {
		t.Fatalf("SignMessage() error = %v", err)
	}

	// Modify the body after signing
	modifiedMessage := strings.Replace(string(signed), "This is the body.", "This is the MODIFIED body.", 1)

	// Create verifier - should fail because body was modified
	verifier := NewVerifierWithResolver(logger, resolver)

	results, err := verifier.VerifyMessage([]byte(modifiedMessage))
	if err != nil {
		t.Fatalf("VerifyMessage() error = %v", err)
	}

	if len(results) == 0 {
		t.Fatal("VerifyMessage() returned no results")
	}

	if results[0].Status != VerificationFail {
		t.Errorf("VerifyMessage() status = %v, want %v", results[0].Status, VerificationFail)
	}

	if results[0].Error == nil || !strings.Contains(results[0].Error.Error(), "body hash") {
		t.Errorf("VerifyMessage() error should mention body hash, got: %v", results[0].Error)
	}
}

func TestVerifier_VerifyMessage_NoSignature(t *testing.T) {
	logger := zap.NewNop()

	// Message without DKIM signature
	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\nDate: Mon, 01 Jan 2024 00:00:00 +0000\r\n\r\nThis is the body.")

	verifier := NewVerifier(logger)

	results, err := verifier.VerifyMessage(message)
	if err != nil {
		t.Fatalf("VerifyMessage() error = %v", err)
	}

	// Should return nil (no signatures to verify)
	if results != nil {
		t.Errorf("VerifyMessage() should return nil for message without signature, got: %v", results)
	}
}

func TestVerifier_VerifyMessage_MissingRequiredParam(t *testing.T) {
	logger := zap.NewNop()

	// Message with DKIM signature missing required parameter (no h= header list)
	message := []byte(`DKIM-Signature: v=1; a=rsa-sha256; d=example.com; s=default; bh=test; b=test
From: sender@example.com
To: recipient@example.com
Subject: Test

This is the body.`)

	verifier := NewVerifier(logger)

	results, err := verifier.VerifyMessage(message)
	if err != nil {
		t.Fatalf("VerifyMessage() error = %v", err)
	}

	if len(results) == 0 {
		t.Fatal("VerifyMessage() returned no results")
	}

	if results[0].Status != VerificationPermFail {
		t.Errorf("VerifyMessage() status = %v, want %v", results[0].Status, VerificationPermFail)
	}

	if results[0].Error == nil || !strings.Contains(results[0].Error.Error(), "missing required parameter") {
		t.Errorf("VerifyMessage() error should mention missing parameter, got: %v", results[0].Error)
	}
}

func TestVerifier_VerifyMessage_UnsupportedAlgorithm(t *testing.T) {
	logger := zap.NewNop()

	// Message with unsupported algorithm
	message := []byte(`DKIM-Signature: v=1; a=ed25519-sha256; d=example.com; s=default; h=from; bh=test; b=test
From: sender@example.com
To: recipient@example.com
Subject: Test

This is the body.`)

	verifier := NewVerifier(logger)

	results, err := verifier.VerifyMessage(message)
	if err != nil {
		t.Fatalf("VerifyMessage() error = %v", err)
	}

	if len(results) == 0 {
		t.Fatal("VerifyMessage() returned no results")
	}

	if results[0].Status != VerificationPermFail {
		t.Errorf("VerifyMessage() status = %v, want %v", results[0].Status, VerificationPermFail)
	}

	if results[0].Error == nil || !strings.Contains(results[0].Error.Error(), "unsupported algorithm") {
		t.Errorf("VerifyMessage() error should mention unsupported algorithm, got: %v", results[0].Error)
	}
}

func TestVerifier_PublicKeyCache(t *testing.T) {
	logger := zap.NewNop()

	// Generate test key pair
	privateKey, dnsRecord := generateTestKeyPair(t)

	lookupCount := 0
	resolver := &mockDNSResolver{
		records: map[string][]string{
			"default._domainkey.example.com": {dnsRecord},
		},
	}

	// Create custom resolver that counts lookups
	countingResolver := &countingDNSResolver{
		delegate: resolver,
		count:    &lookupCount,
	}

	// Create signer and sign a message
	provider := &mockKeyProvider{
		keys: map[string]*domain.DKIMKey{
			"example.com": {
				ID:         "key-123",
				Selector:   "default",
				Algorithm:  "rsa-sha256",
				PrivateKey: privateKey,
			},
		},
	}
	signer := NewSigner(provider, logger)

	message := []byte("From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\nDate: Mon, 01 Jan 2024 00:00:00 +0000\r\n\r\nThis is the body.")

	signed, err := signer.SignMessage("example.com", message, nil)
	if err != nil {
		t.Fatalf("SignMessage() error = %v", err)
	}

	// Create verifier
	verifier := NewVerifierWithResolver(logger, countingResolver)

	// Verify same message multiple times
	for i := 0; i < 3; i++ {
		results, err := verifier.VerifyMessage(signed)
		if err != nil {
			t.Fatalf("VerifyMessage() error = %v", err)
		}
		if len(results) == 0 || results[0].Status != VerificationPass {
			t.Fatalf("VerifyMessage() iteration %d failed", i)
		}
	}

	// Should only have done 1 DNS lookup due to caching
	if lookupCount != 1 {
		t.Errorf("Expected 1 DNS lookup due to caching, got %d", lookupCount)
	}
}

type countingDNSResolver struct {
	delegate DNSResolver
	count    *int
}

func (c *countingDNSResolver) LookupTXT(ctx context.Context, name string) ([]string, error) {
	*c.count++
	return c.delegate.LookupTXT(ctx, name)
}

func TestParseDKIMRecord(t *testing.T) {
	tests := []struct {
		name    string
		record  string
		wantErr bool
		check   func(*DKIMRecord) error
	}{
		{
			name:    "valid record",
			record:  "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...",
			wantErr: false,
			check: func(r *DKIMRecord) error {
				if r.Version != "DKIM1" {
					return fmt.Errorf("version = %s, want DKIM1", r.Version)
				}
				if r.KeyType != "rsa" {
					return fmt.Errorf("keyType = %s, want rsa", r.KeyType)
				}
				return nil
			},
		},
		{
			name:    "record with flags",
			record:  "v=DKIM1; k=rsa; t=y; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...",
			wantErr: false,
			check: func(r *DKIMRecord) error {
				if r.Flags != "y" {
					return fmt.Errorf("flags = %s, want y", r.Flags)
				}
				return nil
			},
		},
		{
			name:    "default key type",
			record:  "v=DKIM1; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...",
			wantErr: false,
			check: func(r *DKIMRecord) error {
				if r.KeyType != "rsa" {
					return fmt.Errorf("keyType = %s, want rsa (default)", r.KeyType)
				}
				return nil
			},
		},
		{
			name:    "unsupported version",
			record:  "v=DKIM2; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...",
			wantErr: true,
		},
		{
			name:    "unsupported key type",
			record:  "v=DKIM1; k=ed25519; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			record, err := parseDKIMRecord(tt.record)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseDKIMRecord() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && tt.check != nil {
				if err := tt.check(record); err != nil {
					t.Errorf("parseDKIMRecord() %v", err)
				}
			}
		})
	}
}

func TestParsePublicKey(t *testing.T) {
	// Generate a test key
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("Failed to generate RSA key: %v", err)
	}

	// Test PKIX format
	pubDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		t.Fatalf("Failed to marshal public key: %v", err)
	}
	pubB64 := base64.StdEncoding.EncodeToString(pubDER)

	parsed, err := parsePublicKey(pubB64)
	if err != nil {
		t.Errorf("parsePublicKey(PKIX) error = %v", err)
	}
	if parsed == nil {
		t.Error("parsePublicKey(PKIX) returned nil")
	}

	// Test with whitespace
	pubB64WithWS := pubB64[:20] + " \t\n" + pubB64[20:]
	parsed, err = parsePublicKey(pubB64WithWS)
	if err != nil {
		t.Errorf("parsePublicKey with whitespace error = %v", err)
	}
	if parsed == nil {
		t.Error("parsePublicKey with whitespace returned nil")
	}

	// Test invalid base64
	_, err = parsePublicKey("not-valid-base64!!!")
	if err == nil {
		t.Error("parsePublicKey should fail for invalid base64")
	}

	// Test invalid key data
	_, err = parsePublicKey(base64.StdEncoding.EncodeToString([]byte("not a key")))
	if err == nil {
		t.Error("parsePublicKey should fail for invalid key data")
	}
}

func TestIsDNSTempError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		wantTemp bool
	}{
		{
			name:     "nil error",
			err:      nil,
			wantTemp: false,
		},
		{
			name:     "timeout error",
			err:      fmt.Errorf("DNS lookup timeout"),
			wantTemp: true,
		},
		{
			name:     "temporary error",
			err:      fmt.Errorf("temporary failure"),
			wantTemp: true,
		},
		{
			name:     "permanent error",
			err:      fmt.Errorf("no such domain"),
			wantTemp: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isDNSTempError(tt.err); got != tt.wantTemp {
				t.Errorf("isDNSTempError() = %v, want %v", got, tt.wantTemp)
			}
		})
	}
}

func TestExtractDomainFromHeader(t *testing.T) {
	tests := []struct {
		name   string
		header string
		want   string
	}{
		{
			name:   "simple email",
			header: "user@example.com",
			want:   "example.com",
		},
		{
			name:   "email with name",
			header: "John Doe <john@example.com>",
			want:   "example.com",
		},
		{
			name:   "email with whitespace",
			header: "  user@example.com  ",
			want:   "example.com",
		},
		{
			name:   "no @ symbol",
			header: "invalid-email",
			want:   "",
		},
		{
			name:   "subdomain",
			header: "user@mail.example.com",
			want:   "mail.example.com",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := extractDomainFromHeader(tt.header); got != tt.want {
				t.Errorf("extractDomainFromHeader() = %v, want %v", got, tt.want)
			}
		})
	}
}
