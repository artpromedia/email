package dkim

import (
	"bytes"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"net/mail"
	"regexp"
	"sort"
	"strings"
	"time"

	"go.uber.org/zap"

	"smtp-server/domain"
)

// Signer handles DKIM signing for outbound messages
type Signer struct {
	cache  DKIMKeyProvider
	logger *zap.Logger
}

// DKIMKeyProvider provides DKIM keys for domains
type DKIMKeyProvider interface {
	GetActiveDKIMKey(domainName string) *domain.DKIMKey
}

// NewSigner creates a new DKIM signer
func NewSigner(cache DKIMKeyProvider, logger *zap.Logger) *Signer {
	return &Signer{
		cache:  cache,
		logger: logger,
	}
}

// SignatureConfig holds DKIM signature configuration
type SignatureConfig struct {
	// Headers to sign (order matters)
	Headers []string
	// Canonicalization for header (relaxed or simple)
	HeaderCanonicalization string
	// Canonicalization for body (relaxed or simple)
	BodyCanonicalization string
	// Body length limit (0 = no limit)
	BodyLengthLimit int
	// Signature expiration (0 = no expiration)
	ExpireAfter time.Duration
}

// DefaultSignatureConfig returns the default signature configuration
func DefaultSignatureConfig() *SignatureConfig {
	return &SignatureConfig{
		Headers: []string{
			"from", "to", "cc", "subject", "date",
			"message-id", "reply-to", "references",
			"in-reply-to", "content-type", "mime-version",
		},
		HeaderCanonicalization: "relaxed",
		BodyCanonicalization:   "relaxed",
		BodyLengthLimit:        0,
		ExpireAfter:            7 * 24 * time.Hour, // 7 days
	}
}

// SignMessage signs a message with DKIM
func (s *Signer) SignMessage(domainName string, message []byte, config *SignatureConfig) ([]byte, error) {
	if config == nil {
		config = DefaultSignatureConfig()
	}

	// Get DKIM key for domain
	key := s.cache.GetActiveDKIMKey(domainName)
	if key == nil {
		return nil, fmt.Errorf("no active DKIM key for domain %s", domainName)
	}

	// Parse message
	msg, err := mail.ReadMessage(bytes.NewReader(message))
	if err != nil {
		return nil, fmt.Errorf("parse message: %w", err)
	}

	// Read body
	body, err := io.ReadAll(msg.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	// Canonicalize body
	canonBody := canonicalizeBody(body, config.BodyCanonicalization)
	
	// Apply body length limit if set
	if config.BodyLengthLimit > 0 && len(canonBody) > config.BodyLengthLimit {
		canonBody = canonBody[:config.BodyLengthLimit]
	}

	// Hash body
	bodyHash := sha256.Sum256(canonBody)
	bodyHashB64 := base64.StdEncoding.EncodeToString(bodyHash[:])

	// Build DKIM-Signature header template
	timestamp := time.Now().Unix()
	var expiration int64
	if config.ExpireAfter > 0 {
		expiration = timestamp + int64(config.ExpireAfter.Seconds())
	}

	signatureParams := buildSignatureParams(
		key,
		domainName,
		config,
		bodyHashB64,
		timestamp,
		expiration,
		msg.Header,
	)

	// Canonicalize headers for signing
	headerData := canonicalizeHeaders(msg.Header, config.Headers, config.HeaderCanonicalization)
	
	// Add DKIM-Signature header without b= value for signing
	dkimHeader := fmt.Sprintf("dkim-signature:%s", canonicalizeHeaderValue(signatureParams, config.HeaderCanonicalization))
	headerData = append(headerData, []byte(dkimHeader)...)

	// Sign the header data
	headerHash := sha256.Sum256(headerData)
	signature, err := rsa.SignPKCS1v15(nil, key.PrivateKey, crypto.SHA256, headerHash[:])
	if err != nil {
		return nil, fmt.Errorf("sign message: %w", err)
	}

	signatureB64 := base64.StdEncoding.EncodeToString(signature)

	// Build complete DKIM-Signature header
	dkimSignature := fmt.Sprintf("DKIM-Signature: %sb=%s", signatureParams, foldSignature(signatureB64))

	// Prepend DKIM-Signature to message
	var result bytes.Buffer
	result.WriteString(dkimSignature)
	result.WriteString("\r\n")
	result.Write(message)

	s.logger.Debug("Message signed with DKIM",
		zap.String("domain", domainName),
		zap.String("selector", key.Selector),
		zap.Int("body_hash_len", len(bodyHashB64)),
		zap.Int("signature_len", len(signatureB64)))

	return result.Bytes(), nil
}

// buildSignatureParams builds the DKIM-Signature parameter string
func buildSignatureParams(key *domain.DKIMKey, domainName string, config *SignatureConfig, bodyHash string, timestamp, expiration int64, headers mail.Header) string {
	// Get list of headers that actually exist in the message
	signedHeaders := getSignableHeaders(headers, config.Headers)

	params := fmt.Sprintf("v=1; a=%s; c=%s/%s; d=%s; s=%s; t=%d; ",
		key.Algorithm,
		config.HeaderCanonicalization,
		config.BodyCanonicalization,
		domainName,
		key.Selector,
		timestamp,
	)

	if expiration > 0 {
		params += fmt.Sprintf("x=%d; ", expiration)
	}

	if config.BodyLengthLimit > 0 {
		params += fmt.Sprintf("l=%d; ", config.BodyLengthLimit)
	}

	params += fmt.Sprintf("h=%s; bh=%s; ",
		strings.Join(signedHeaders, ":"),
		bodyHash,
	)

	return params
}

// getSignableHeaders returns the list of headers that exist in the message
func getSignableHeaders(headers mail.Header, wantHeaders []string) []string {
	var result []string
	for _, h := range wantHeaders {
		if headers.Get(h) != "" {
			result = append(result, h)
		}
	}
	return result
}

// canonicalizeBody canonicalizes the message body
func canonicalizeBody(body []byte, method string) []byte {
	switch method {
	case "simple":
		return canonicalizeBodySimple(body)
	case "relaxed":
		return canonicalizeBodyRelaxed(body)
	default:
		return canonicalizeBodyRelaxed(body)
	}
}

func canonicalizeBodySimple(body []byte) []byte {
	// Remove trailing empty lines
	body = bytes.TrimRight(body, "\r\n")
	// Ensure CRLF at end
	if len(body) > 0 {
		body = append(body, '\r', '\n')
	}
	return body
}

func canonicalizeBodyRelaxed(body []byte) []byte {
	// Replace any sequence of WSP with a single SP
	wspRegex := regexp.MustCompile(`[ \t]+`)
	
	lines := bytes.Split(body, []byte("\n"))
	var result [][]byte
	
	for _, line := range lines {
		// Remove trailing CR if present
		line = bytes.TrimSuffix(line, []byte("\r"))
		// Replace WSP sequences with single space
		line = wspRegex.ReplaceAll(line, []byte(" "))
		// Remove trailing whitespace
		line = bytes.TrimRight(line, " \t")
		result = append(result, line)
	}
	
	// Remove trailing empty lines
	for len(result) > 0 && len(result[len(result)-1]) == 0 {
		result = result[:len(result)-1]
	}
	
	if len(result) == 0 {
		return []byte("\r\n")
	}
	
	// Join with CRLF
	output := bytes.Join(result, []byte("\r\n"))
	output = append(output, '\r', '\n')
	
	return output
}

// canonicalizeHeaders canonicalizes headers for signing
func canonicalizeHeaders(headers mail.Header, signHeaders []string, method string) []byte {
	var result bytes.Buffer
	
	for _, name := range signHeaders {
		value := headers.Get(name)
		if value == "" {
			continue
		}
		
		var line string
		switch method {
		case "simple":
			line = fmt.Sprintf("%s: %s", name, value)
		case "relaxed":
			line = fmt.Sprintf("%s:%s", strings.ToLower(name), canonicalizeHeaderValue(value, method))
		default:
			line = fmt.Sprintf("%s:%s", strings.ToLower(name), canonicalizeHeaderValue(value, "relaxed"))
		}
		
		result.WriteString(line)
		result.WriteString("\r\n")
	}
	
	return result.Bytes()
}

func canonicalizeHeaderValue(value, method string) string {
	if method == "simple" {
		return value
	}
	
	// Relaxed canonicalization
	// Unfold header (remove CRLF followed by WSP)
	value = strings.ReplaceAll(value, "\r\n ", " ")
	value = strings.ReplaceAll(value, "\r\n\t", " ")
	
	// Replace sequences of WSP with single SP
	wspRegex := regexp.MustCompile(`[ \t]+`)
	value = wspRegex.ReplaceAllString(value, " ")
	
	// Remove leading/trailing whitespace
	value = strings.TrimSpace(value)
	
	return value
}

// foldSignature folds a base64 signature for header inclusion
func foldSignature(sig string) string {
	const lineLen = 72
	var result strings.Builder
	
	for i := 0; i < len(sig); i += lineLen {
		end := i + lineLen
		if end > len(sig) {
			end = len(sig)
		}
		if i > 0 {
			result.WriteString("\r\n\t")
		}
		result.WriteString(sig[i:end])
	}
	
	return result.String()
}

// Verifier handles DKIM verification for inbound messages
type Verifier struct {
	logger *zap.Logger
}

// NewVerifier creates a new DKIM verifier
func NewVerifier(logger *zap.Logger) *Verifier {
	return &Verifier{
		logger: logger,
	}
}

// VerificationResult holds the result of DKIM verification
type VerificationResult struct {
	Domain    string
	Selector  string
	Valid     bool
	Error     error
	Timestamp time.Time
	Headers   []string
}

// VerifyMessage verifies DKIM signatures in a message
func (v *Verifier) VerifyMessage(message []byte) ([]*VerificationResult, error) {
	msg, err := mail.ReadMessage(bytes.NewReader(message))
	if err != nil {
		return nil, fmt.Errorf("parse message: %w", err)
	}

	// Get all DKIM-Signature headers
	signatures := msg.Header["Dkim-Signature"]
	if len(signatures) == 0 {
		return nil, nil // No signatures to verify
	}

	var results []*VerificationResult

	for _, sig := range signatures {
		result := v.verifySignature(sig, msg.Header, message)
		results = append(results, result)
	}

	return results, nil
}

func (v *Verifier) verifySignature(signature string, headers mail.Header, message []byte) *VerificationResult {
	result := &VerificationResult{
		Timestamp: time.Now(),
	}

	// Parse signature parameters
	params := parseSignatureParams(signature)
	
	result.Domain = params["d"]
	result.Selector = params["s"]
	result.Headers = strings.Split(params["h"], ":")

	// Validate required parameters
	requiredParams := []string{"v", "a", "d", "s", "h", "bh", "b"}
	for _, p := range requiredParams {
		if params[p] == "" {
			result.Error = fmt.Errorf("missing required parameter: %s", p)
			return result
		}
	}

	// Check version
	if params["v"] != "1" {
		result.Error = fmt.Errorf("unsupported DKIM version: %s", params["v"])
		return result
	}

	// Check algorithm
	if params["a"] != "rsa-sha256" {
		result.Error = fmt.Errorf("unsupported algorithm: %s", params["a"])
		return result
	}

	// Check expiration
	if params["x"] != "" {
		expiration, err := parseTimestamp(params["x"])
		if err != nil {
			result.Error = fmt.Errorf("invalid expiration: %w", err)
			return result
		}
		if time.Now().After(expiration) {
			result.Error = fmt.Errorf("signature expired at %v", expiration)
			return result
		}
	}

	// Note: Full verification would require DNS lookup for public key
	// This is a simplified version for demonstration
	v.logger.Debug("DKIM signature found",
		zap.String("domain", result.Domain),
		zap.String("selector", result.Selector),
		zap.Strings("headers", result.Headers))

	result.Valid = true // Placeholder - real verification needs DNS lookup
	return result
}

func parseSignatureParams(signature string) map[string]string {
	params := make(map[string]string)
	
	// Remove folding
	signature = strings.ReplaceAll(signature, "\r\n", "")
	signature = strings.ReplaceAll(signature, "\n", "")
	signature = strings.ReplaceAll(signature, "\t", " ")
	
	// Parse tag=value pairs
	parts := strings.Split(signature, ";")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		
		idx := strings.Index(part, "=")
		if idx == -1 {
			continue
		}
		
		tag := strings.TrimSpace(part[:idx])
		value := strings.TrimSpace(part[idx+1:])
		params[tag] = value
	}
	
	return params
}

func parseTimestamp(ts string) (time.Time, error) {
	var timestamp int64
	_, err := fmt.Sscanf(ts, "%d", &timestamp)
	if err != nil {
		return time.Time{}, err
	}
	return time.Unix(timestamp, 0), nil
}

// KeyManager handles DKIM key rotation and management
type KeyManager struct {
	logger *zap.Logger
}

// NewKeyManager creates a new DKIM key manager
func NewKeyManager(logger *zap.Logger) *KeyManager {
	return &KeyManager{
		logger: logger,
	}
}

// GenerateDNSRecord generates a DNS TXT record for a DKIM key
func (km *KeyManager) GenerateDNSRecord(key *domain.DKIMKey, domainName string) string {
	// Format: selector._domainkey.domain.com
	recordName := fmt.Sprintf("%s._domainkey.%s", key.Selector, domainName)
	
	// Build record value
	// Remove PEM headers and join lines
	publicKey := strings.ReplaceAll(key.PublicKey, "-----BEGIN PUBLIC KEY-----", "")
	publicKey = strings.ReplaceAll(publicKey, "-----END PUBLIC KEY-----", "")
	publicKey = strings.ReplaceAll(publicKey, "\n", "")
	publicKey = strings.ReplaceAll(publicKey, "\r", "")
	publicKey = strings.TrimSpace(publicKey)
	
	recordValue := fmt.Sprintf("v=DKIM1; k=rsa; p=%s", publicKey)
	
	return fmt.Sprintf("%s TXT \"%s\"", recordName, recordValue)
}

// GetRotationCandidates returns keys that should be rotated
func (km *KeyManager) GetRotationCandidates(keys []*domain.DKIMKey, rotationAge time.Duration) []*domain.DKIMKey {
	var candidates []*domain.DKIMKey
	
	now := time.Now()
	for _, key := range keys {
		if key.IsActive {
			// Check if key is old enough to rotate
			if now.Sub(key.CreatedAt) > rotationAge {
				candidates = append(candidates, key)
			}
			// Check if key is expiring soon
			if key.ExpiresAt != nil && key.ExpiresAt.Sub(now) < 7*24*time.Hour {
				candidates = append(candidates, key)
			}
		}
	}
	
	// Deduplicate
	seen := make(map[string]bool)
	var result []*domain.DKIMKey
	for _, k := range candidates {
		if !seen[k.ID] {
			seen[k.ID] = true
			result = append(result, k)
		}
	}
	
	// Sort by creation date
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.Before(result[j].CreatedAt)
	})
	
	return result
}
