package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"domain-manager/config"
	"domain-manager/domain"
)

// DKIMService handles DKIM key generation and management
type DKIMService struct {
	config *config.DKIMConfig
	dns    *config.DNSConfig
	logger *zap.Logger
}

// NewDKIMService creates a new DKIM service
func NewDKIMService(cfg *config.DKIMConfig, dns *config.DNSConfig, logger *zap.Logger) *DKIMService {
	return &DKIMService{
		config: cfg,
		dns:    dns,
		logger: logger,
	}
}

// GenerateKeyPair generates a new DKIM RSA key pair
func (s *DKIMService) GenerateKeyPair(domainID string, selector string) (*domain.DKIMKey, error) {
	// Use configured key size
	keySize := s.config.DefaultKeySize
	if keySize == 0 {
		keySize = 2048
	}

	// Generate RSA key pair
	privateKey, err := rsa.GenerateKey(rand.Reader, keySize)
	if err != nil {
		return nil, fmt.Errorf("generate rsa key: %w", err)
	}

	// Encode private key to PEM
	privateKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	})

	// Encode public key to PEM
	publicKeyBytes, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("marshal public key: %w", err)
	}
	publicKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyBytes,
	})

	// Encrypt private key
	encryptedPrivateKey, err := s.encryptPrivateKey(privateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("encrypt private key: %w", err)
	}

	// Use default selector if not provided
	if selector == "" {
		selector = s.dns.DefaultDKIMSelector
	}

	algorithm := s.config.DefaultAlgorithm
	if algorithm == "" {
		algorithm = "rsa-sha256"
	}

	now := time.Now()
	key := &domain.DKIMKey{
		ID:                  uuid.New().String(),
		DomainID:            domainID,
		Selector:            selector,
		Algorithm:           algorithm,
		KeySize:             keySize,
		PublicKey:           string(publicKeyPEM),
		PrivateKeyEncrypted: []byte(encryptedPrivateKey),
		IsActive:            false,
		CreatedAt:           now,
	}

	return key, nil
}

// encryptPrivateKey encrypts the private key using AES-GCM
func (s *DKIMService) encryptPrivateKey(privateKey []byte) (string, error) {
	// Decode the encryption key from base64
	key, err := base64.StdEncoding.DecodeString(s.config.EncryptionKey)
	if err != nil {
		// If not base64, use the key directly (padded/truncated to 32 bytes)
		key = []byte(s.config.EncryptionKey)
		if len(key) < 32 {
			paddedKey := make([]byte, 32)
			copy(paddedKey, key)
			key = paddedKey
		} else if len(key) > 32 {
			key = key[:32]
		}
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, privateKey, nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptPrivateKey decrypts an encrypted private key
func (s *DKIMService) DecryptPrivateKey(encryptedKey string) ([]byte, error) {
	ciphertext, err := base64.StdEncoding.DecodeString(encryptedKey)
	if err != nil {
		return nil, fmt.Errorf("decode ciphertext: %w", err)
	}

	// Decode the encryption key from base64
	key, err := base64.StdEncoding.DecodeString(s.config.EncryptionKey)
	if err != nil {
		// If not base64, use the key directly (padded/truncated to 32 bytes)
		key = []byte(s.config.EncryptionKey)
		if len(key) < 32 {
			paddedKey := make([]byte, 32)
			copy(paddedKey, key)
			key = paddedKey
		} else if len(key) > 32 {
			key = key[:32]
		}
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create gcm: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt: %w", err)
	}

	return plaintext, nil
}

// GetDNSRecord returns the DNS TXT record value for a DKIM key
func (s *DKIMService) GetDNSRecord(key *domain.DKIMKey, domainName string) string {
	// Extract public key without PEM headers
	pubKey := key.PublicKey
	pubKey = stripPEMHeaders(pubKey)

	return fmt.Sprintf("v=DKIM1; k=rsa; p=%s", pubKey)
}

// GetDNSRecordName returns the DNS record name for a DKIM key
func (s *DKIMService) GetDNSRecordName(selector, domainName string) string {
	return fmt.Sprintf("%s._domainkey.%s", selector, domainName)
}

// ToPublic converts a DKIMKey to its public representation
func (s *DKIMService) ToPublic(key *domain.DKIMKey, domainName string) *domain.DKIMKeyPublic {
	return &domain.DKIMKeyPublic{
		ID:          key.ID,
		Selector:    key.Selector,
		Algorithm:   key.Algorithm,
		KeySize:     key.KeySize,
		PublicKey:   key.PublicKey,
		DNSRecord:   s.GetDNSRecord(key, domainName),
		IsActive:    key.IsActive,
		CreatedAt:   key.CreatedAt,
		ActivatedAt: key.ActivatedAt,
	}
}

// ValidateKeyRotation validates that key rotation can proceed
func (s *DKIMService) ValidateKeyRotation(currentKey, newKey *domain.DKIMKey) error {
	if !currentKey.IsActive {
		return fmt.Errorf("current key is not active")
	}

	if newKey == nil {
		return fmt.Errorf("new key must be provided for rotation")
	}

	if newKey.IsActive {
		return fmt.Errorf("new key is already active")
	}

	return nil
}

// stripPEMHeaders removes PEM headers and newlines from a key
func stripPEMHeaders(key string) string {
	result := key
	result = removeSubstring(result, "-----BEGIN PUBLIC KEY-----")
	result = removeSubstring(result, "-----END PUBLIC KEY-----")
	result = removeSubstring(result, "-----BEGIN RSA PUBLIC KEY-----")
	result = removeSubstring(result, "-----END RSA PUBLIC KEY-----")
	result = removeSubstring(result, "\n")
	result = removeSubstring(result, "\r")
	return result
}

func removeSubstring(s, substr string) string {
	for {
		idx := indexOf(s, substr)
		if idx == -1 {
			return s
		}
		s = s[:idx] + s[idx+len(substr):]
	}
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
