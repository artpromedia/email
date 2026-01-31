package dkim

import (
	"crypto/rand"
	"crypto/rsa"
	"net/mail"
	"strings"
	"testing"
	"time"

	"go.uber.org/zap"

	"smtp-server/domain"
)

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
