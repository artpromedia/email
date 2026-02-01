package service

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"domain-manager/config"
	"domain-manager/domain"

	"go.uber.org/zap"
)

func TestDKIMService_GenerateKeyPair(t *testing.T) {
	logger := zap.NewNop()
	cfg := &config.DKIMConfig{
		KeySize:       2048,
		Algorithm:     "rsa-sha256",
		EncryptionKey: base64.StdEncoding.EncodeToString([]byte("12345678901234567890123456789012")), // 32 bytes
	}
	dnsCfg := &config.DNSConfig{
		DefaultDKIMSelector: "mail",
	}

	service := NewDKIMService(cfg, dnsCfg, logger)

	tests := []struct {
		name      string
		domainID  string
		selector  string
		expectErr bool
	}{
		{
			name:      "generate with custom selector",
			domainID:  "domain-1",
			selector:  "s1",
			expectErr: false,
		},
		{
			name:      "generate with default selector",
			domainID:  "domain-2",
			selector:  "",
			expectErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			key, err := service.GenerateKeyPair(tt.domainID, tt.selector)

			if tt.expectErr {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			// Verify key structure
			if key.ID == "" {
				t.Error("Expected key ID to be set")
			}
			if key.DomainID != tt.domainID {
				t.Errorf("Expected domain ID %s, got %s", tt.domainID, key.DomainID)
			}
			expectedSelector := tt.selector
			if expectedSelector == "" {
				expectedSelector = "mail"
			}
			if key.Selector != expectedSelector {
				t.Errorf("Expected selector %s, got %s", expectedSelector, key.Selector)
			}
			if key.Algorithm != "rsa-sha256" {
				t.Errorf("Expected algorithm rsa-sha256, got %s", key.Algorithm)
			}
			if key.KeySize != 2048 {
				t.Errorf("Expected key size 2048, got %d", key.KeySize)
			}
			if key.PublicKey == "" {
				t.Error("Expected public key to be set")
			}
			if key.PrivateKeyEncrypted == "" {
				t.Error("Expected encrypted private key to be set")
			}
			if key.IsActive {
				t.Error("Expected new key to be inactive")
			}
			if key.CreatedAt.IsZero() {
				t.Error("Expected created_at to be set")
			}

			// Verify public key format
			if !strings.Contains(key.PublicKey, "-----BEGIN PUBLIC KEY-----") {
				t.Error("Expected public key in PEM format")
			}
		})
	}
}

func TestDKIMService_EncryptDecryptPrivateKey(t *testing.T) {
	logger := zap.NewNop()
	encKey := base64.StdEncoding.EncodeToString([]byte("12345678901234567890123456789012"))
	cfg := &config.DKIMConfig{
		KeySize:       2048,
		Algorithm:     "rsa-sha256",
		EncryptionKey: encKey,
	}
	dnsCfg := &config.DNSConfig{
		DefaultDKIMSelector: "mail",
	}

	service := NewDKIMService(cfg, dnsCfg, logger)

	originalKey := []byte("-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...\n-----END RSA PRIVATE KEY-----")

	// Encrypt
	encrypted, err := service.encryptPrivateKey(originalKey)
	if err != nil {
		t.Fatalf("Failed to encrypt: %v", err)
	}

	if encrypted == "" {
		t.Error("Expected encrypted output")
	}

	// Decrypt
	decrypted, err := service.DecryptPrivateKey(encrypted)
	if err != nil {
		t.Fatalf("Failed to decrypt: %v", err)
	}

	if string(decrypted) != string(originalKey) {
		t.Errorf("Decrypted key doesn't match original")
	}
}

func TestDKIMService_GetDNSRecord(t *testing.T) {
	logger := zap.NewNop()
	cfg := &config.DKIMConfig{
		KeySize:       2048,
		Algorithm:     "rsa-sha256",
		EncryptionKey: base64.StdEncoding.EncodeToString([]byte("12345678901234567890123456789012")),
	}
	dnsCfg := &config.DNSConfig{
		DefaultDKIMSelector: "mail",
	}

	service := NewDKIMService(cfg, dnsCfg, logger)

	key := &domain.DKIMKey{
		ID:        "key-1",
		DomainID:  "domain-1",
		Selector:  "s1",
		Algorithm: "rsa-sha256",
		PublicKey: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
	}

	record := service.GetDNSRecord(key, "example.com")

	if !strings.HasPrefix(record, "v=DKIM1; k=rsa; p=") {
		t.Errorf("Expected DNS record to start with 'v=DKIM1; k=rsa; p=', got: %s", record)
	}

	// Should not contain PEM headers
	if strings.Contains(record, "BEGIN") {
		t.Error("DNS record should not contain PEM headers")
	}
}

func TestDKIMService_GetDNSRecordName(t *testing.T) {
	logger := zap.NewNop()
	cfg := &config.DKIMConfig{
		KeySize:       2048,
		Algorithm:     "rsa-sha256",
		EncryptionKey: base64.StdEncoding.EncodeToString([]byte("12345678901234567890123456789012")),
	}
	dnsCfg := &config.DNSConfig{
		DefaultDKIMSelector: "mail",
	}

	service := NewDKIMService(cfg, dnsCfg, logger)

	tests := []struct {
		selector   string
		domainName string
		expected   string
	}{
		{"mail", "example.com", "mail._domainkey.example.com"},
		{"s1", "example.com", "s1._domainkey.example.com"},
		{"custom", "sub.example.com", "custom._domainkey.sub.example.com"},
	}

	for _, tt := range tests {
		result := service.GetDNSRecordName(tt.selector, tt.domainName)
		if result != tt.expected {
			t.Errorf("GetDNSRecordName(%s, %s) = %s, want %s",
				tt.selector, tt.domainName, result, tt.expected)
		}
	}
}

func TestDKIMService_ValidateKeyRotation(t *testing.T) {
	logger := zap.NewNop()
	cfg := &config.DKIMConfig{
		KeySize:       2048,
		Algorithm:     "rsa-sha256",
		EncryptionKey: base64.StdEncoding.EncodeToString([]byte("12345678901234567890123456789012")),
	}
	dnsCfg := &config.DNSConfig{
		DefaultDKIMSelector: "mail",
	}

	service := NewDKIMService(cfg, dnsCfg, logger)

	tests := []struct {
		name       string
		currentKey *domain.DKIMKey
		newKey     *domain.DKIMKey
		expectErr  bool
		errMsg     string
	}{
		{
			name: "valid rotation",
			currentKey: &domain.DKIMKey{
				ID:       "key-1",
				IsActive: true,
			},
			newKey: &domain.DKIMKey{
				ID:       "key-2",
				IsActive: false,
			},
			expectErr: false,
		},
		{
			name: "current key not active",
			currentKey: &domain.DKIMKey{
				ID:       "key-1",
				IsActive: false,
			},
			newKey: &domain.DKIMKey{
				ID:       "key-2",
				IsActive: false,
			},
			expectErr: true,
			errMsg:    "current key is not active",
		},
		{
			name: "new key is nil",
			currentKey: &domain.DKIMKey{
				ID:       "key-1",
				IsActive: true,
			},
			newKey:    nil,
			expectErr: true,
			errMsg:    "new key must be provided",
		},
		{
			name: "new key already active",
			currentKey: &domain.DKIMKey{
				ID:       "key-1",
				IsActive: true,
			},
			newKey: &domain.DKIMKey{
				ID:       "key-2",
				IsActive: true,
			},
			expectErr: true,
			errMsg:    "new key is already active",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := service.ValidateKeyRotation(tt.currentKey, tt.newKey)

			if tt.expectErr {
				if err == nil {
					t.Error("Expected error but got none")
				} else if !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("Expected error containing '%s', got '%s'", tt.errMsg, err.Error())
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

func TestDKIMService_ToPublic(t *testing.T) {
	logger := zap.NewNop()
	cfg := &config.DKIMConfig{
		KeySize:       2048,
		Algorithm:     "rsa-sha256",
		EncryptionKey: base64.StdEncoding.EncodeToString([]byte("12345678901234567890123456789012")),
	}
	dnsCfg := &config.DNSConfig{
		DefaultDKIMSelector: "mail",
	}

	service := NewDKIMService(cfg, dnsCfg, logger)

	now := time.Now()
	key := &domain.DKIMKey{
		ID:                  "key-1",
		DomainID:            "domain-1",
		Selector:            "s1",
		Algorithm:           "rsa-sha256",
		KeySize:             2048,
		PublicKey:           "-----BEGIN PUBLIC KEY-----\nMIIBIjAN...\n-----END PUBLIC KEY-----",
		PrivateKeyEncrypted: "encrypted-data",
		IsActive:            true,
		CreatedAt:           now,
		ActivatedAt:         &now,
	}

	public := service.ToPublic(key, "example.com")

	// Verify public fields
	if public.ID != key.ID {
		t.Errorf("Expected ID %s, got %s", key.ID, public.ID)
	}
	if public.DomainID != key.DomainID {
		t.Errorf("Expected DomainID %s, got %s", key.DomainID, public.DomainID)
	}
	if public.Selector != key.Selector {
		t.Errorf("Expected Selector %s, got %s", key.Selector, public.Selector)
	}
	if public.PublicKey != key.PublicKey {
		t.Error("Public key should be included")
	}
	if public.DNSRecord == "" {
		t.Error("DNS record should be generated")
	}
	if public.DNSName != "s1._domainkey.example.com" {
		t.Errorf("Expected DNS name 's1._domainkey.example.com', got %s", public.DNSName)
	}
}

func TestStripPEMHeaders(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{
			input:    "-----BEGIN PUBLIC KEY-----\nMIIBIjAN\n-----END PUBLIC KEY-----",
			expected: "MIIBIjAN",
		},
		{
			input:    "-----BEGIN RSA PUBLIC KEY-----\nABC123\n-----END RSA PUBLIC KEY-----",
			expected: "ABC123",
		},
		{
			input:    "NoHeadersHere",
			expected: "NoHeadersHere",
		},
	}

	for _, tt := range tests {
		result := stripPEMHeaders(tt.input)
		if result != tt.expected {
			t.Errorf("stripPEMHeaders(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}
