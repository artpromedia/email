package dkim

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net"
	"net/mail"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/oonrumail/smtp-server/domain"
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
	logger     *zap.Logger
	resolver   DNSResolver
	cache      *PublicKeyCache
	cacheMu    sync.RWMutex
	cacheItems map[string]*cachedPublicKey
}

// DNSResolver interface for DNS lookups (allows mocking in tests)
type DNSResolver interface {
	LookupTXT(ctx context.Context, name string) ([]string, error)
}

// DefaultDNSResolver uses the system DNS resolver
type DefaultDNSResolver struct{}

func (d *DefaultDNSResolver) LookupTXT(ctx context.Context, name string) ([]string, error) {
	return net.DefaultResolver.LookupTXT(ctx, name)
}

// PublicKeyCache caches DKIM public keys
type PublicKeyCache struct {
	mu      sync.RWMutex
	entries map[string]*cachedPublicKey
	maxTTL  time.Duration
}

type cachedPublicKey struct {
	publicKey *rsa.PublicKey
	record    *DKIMRecord
	fetchedAt time.Time
	expiresAt time.Time
	err       error
}

// DKIMRecord represents a parsed DKIM DNS record
type DKIMRecord struct {
	Version    string // v= (should be "DKIM1")
	KeyType    string // k= (rsa, ed25519)
	PublicKey  string // p= (base64 encoded)
	HashAlgos  string // h= (sha1:sha256)
	ServiceType string // s= (email, *)
	Flags      string // t= (y=testing, s=strict)
	Notes      string // n= (notes)
}

// NewVerifier creates a new DKIM verifier
func NewVerifier(logger *zap.Logger) *Verifier {
	return &Verifier{
		logger:     logger,
		resolver:   &DefaultDNSResolver{},
		cacheItems: make(map[string]*cachedPublicKey),
	}
}

// NewVerifierWithResolver creates a verifier with a custom DNS resolver
func NewVerifierWithResolver(logger *zap.Logger, resolver DNSResolver) *Verifier {
	return &Verifier{
		logger:     logger,
		resolver:   resolver,
		cacheItems: make(map[string]*cachedPublicKey),
	}
}

// VerificationResult holds the result of DKIM verification
type VerificationResult struct {
	Domain    string
	Selector  string
	Valid     bool
	Status    VerificationStatus
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

// VerificationStatus represents the result status of DKIM verification
type VerificationStatus string

const (
	VerificationPass     VerificationStatus = "pass"
	VerificationFail     VerificationStatus = "fail"
	VerificationTempFail VerificationStatus = "temperror"
	VerificationPermFail VerificationStatus = "permerror"
	VerificationNone     VerificationStatus = "none"
)

func (v *Verifier) verifySignature(signature string, headers mail.Header, message []byte) *VerificationResult {
	result := &VerificationResult{
		Timestamp: time.Now(),
	}

	// Parse signature parameters
	params := parseSignatureParams(signature)

	result.Domain = params["d"]
	result.Selector = params["s"]
	if params["h"] != "" {
		result.Headers = strings.Split(params["h"], ":")
	}

	// Validate required parameters
	requiredParams := []string{"v", "a", "d", "s", "h", "bh", "b"}
	for _, p := range requiredParams {
		if params[p] == "" {
			result.Error = fmt.Errorf("missing required parameter: %s", p)
			result.Status = VerificationPermFail
			return result
		}
	}

	// Check version
	if params["v"] != "1" {
		result.Error = fmt.Errorf("unsupported DKIM version: %s", params["v"])
		result.Status = VerificationPermFail
		return result
	}

	// Check algorithm - support both rsa-sha256 and rsa-sha1
	algorithm := params["a"]
	if algorithm != "rsa-sha256" && algorithm != "rsa-sha1" {
		result.Error = fmt.Errorf("unsupported algorithm: %s", algorithm)
		result.Status = VerificationPermFail
		return result
	}

	// Check expiration (x= tag)
	if params["x"] != "" {
		expiration, err := parseTimestamp(params["x"])
		if err != nil {
			result.Error = fmt.Errorf("invalid expiration: %w", err)
			result.Status = VerificationPermFail
			return result
		}
		if time.Now().After(expiration) {
			result.Error = fmt.Errorf("signature expired at %v", expiration)
			result.Status = VerificationFail
			return result
		}
	}

	// Get canonicalization methods
	canon := params["c"]
	headerCanon, bodyCanon := "simple", "simple"
	if canon != "" {
		parts := strings.Split(canon, "/")
		headerCanon = parts[0]
		if len(parts) > 1 {
			bodyCanon = parts[1]
		} else {
			bodyCanon = headerCanon
		}
	}

	// Fetch public key from DNS
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	publicKey, record, err := v.fetchPublicKey(ctx, result.Domain, result.Selector)
	if err != nil {
		v.logger.Warn("Failed to fetch DKIM public key",
			zap.String("domain", result.Domain),
			zap.String("selector", result.Selector),
			zap.Error(err))
		result.Error = err
		// Determine if tempfail or permfail
		if isDNSTempError(err) {
			result.Status = VerificationTempFail
		} else {
			result.Status = VerificationPermFail
		}
		return result
	}

	// Check key flags
	if record != nil && strings.Contains(record.Flags, "s") {
		// Strict mode - domain must match exactly
		fromDomain := extractDomainFromHeader(headers.Get("From"))
		if fromDomain != result.Domain {
			result.Error = fmt.Errorf("domain mismatch in strict mode: %s vs %s", fromDomain, result.Domain)
			result.Status = VerificationFail
			return result
		}
	}

	// Parse the body from the raw message
	bodyStart := bytes.Index(message, []byte("\r\n\r\n"))
	if bodyStart == -1 {
		bodyStart = bytes.Index(message, []byte("\n\n"))
		if bodyStart == -1 {
			result.Error = fmt.Errorf("cannot find message body")
			result.Status = VerificationPermFail
			return result
		}
		bodyStart += 2
	} else {
		bodyStart += 4
	}
	body := message[bodyStart:]

	// Canonicalize body
	canonBody := canonicalizeBody(body, bodyCanon)

	// Apply body length limit if specified
	if params["l"] != "" {
		var bodyLen int
		if _, err := fmt.Sscanf(params["l"], "%d", &bodyLen); err == nil && bodyLen >= 0 {
			if len(canonBody) > bodyLen {
				canonBody = canonBody[:bodyLen]
			}
		}
	}

	// Verify body hash
	var bodyHash []byte
	if algorithm == "rsa-sha256" {
		h := sha256.Sum256(canonBody)
		bodyHash = h[:]
	} else {
		// sha1 - not recommended but still in use
		// Would need to import crypto/sha1
		result.Error = fmt.Errorf("rsa-sha1 not supported for body hash verification")
		result.Status = VerificationPermFail
		return result
	}

	expectedBodyHash := params["bh"]
	// Remove whitespace from expected hash
	expectedBodyHash = strings.ReplaceAll(expectedBodyHash, " ", "")
	expectedBodyHash = strings.ReplaceAll(expectedBodyHash, "\t", "")

	actualBodyHashB64 := base64.StdEncoding.EncodeToString(bodyHash)
	if actualBodyHashB64 != expectedBodyHash {
		result.Error = fmt.Errorf("body hash mismatch")
		result.Status = VerificationFail
		v.logger.Debug("DKIM body hash mismatch",
			zap.String("expected", expectedBodyHash),
			zap.String("actual", actualBodyHashB64))
		return result
	}

	// Build header data for signature verification
	signedHeaders := strings.Split(params["h"], ":")
	headerData := v.buildSignedHeaderData(headers, signedHeaders, headerCanon)

	// Add the DKIM-Signature header itself (without the b= value)
	dkimHeader := v.buildDKIMHeaderForVerification(signature, headerCanon)
	headerData = append(headerData, dkimHeader...)

	// Decode signature
	sigValue := params["b"]
	sigValue = strings.ReplaceAll(sigValue, " ", "")
	sigValue = strings.ReplaceAll(sigValue, "\t", "")
	sigValue = strings.ReplaceAll(sigValue, "\r\n", "")
	sigValue = strings.ReplaceAll(sigValue, "\n", "")

	sigBytes, err := base64.StdEncoding.DecodeString(sigValue)
	if err != nil {
		result.Error = fmt.Errorf("invalid signature encoding: %w", err)
		result.Status = VerificationPermFail
		return result
	}

	// Verify signature
	var hashType crypto.Hash
	if algorithm == "rsa-sha256" {
		hashType = crypto.SHA256
	} else {
		hashType = crypto.SHA1
	}

	h := sha256.Sum256(headerData)
	err = rsa.VerifyPKCS1v15(publicKey, hashType, h[:], sigBytes)
	if err != nil {
		result.Error = fmt.Errorf("signature verification failed: %w", err)
		result.Status = VerificationFail
		v.logger.Debug("DKIM signature verification failed",
			zap.String("domain", result.Domain),
			zap.String("selector", result.Selector),
			zap.Error(err))
		return result
	}

	// Success!
	result.Valid = true
	result.Status = VerificationPass
	v.logger.Info("DKIM signature verified",
		zap.String("domain", result.Domain),
		zap.String("selector", result.Selector))

	return result
}

// fetchPublicKey fetches and caches the DKIM public key from DNS
func (v *Verifier) fetchPublicKey(ctx context.Context, domain, selector string) (*rsa.PublicKey, *DKIMRecord, error) {
	cacheKey := fmt.Sprintf("%s._domainkey.%s", selector, domain)

	// Check cache first
	v.cacheMu.RLock()
	cached, ok := v.cacheItems[cacheKey]
	v.cacheMu.RUnlock()

	if ok && time.Now().Before(cached.expiresAt) {
		if cached.err != nil {
			return nil, nil, cached.err
		}
		return cached.publicKey, cached.record, nil
	}

	// Fetch from DNS
	dnsName := fmt.Sprintf("%s._domainkey.%s", selector, domain)
	records, err := v.resolver.LookupTXT(ctx, dnsName)
	if err != nil {
		// Cache the error for a short time to avoid hammering DNS
		v.cacheError(cacheKey, err, 5*time.Minute)
		return nil, nil, fmt.Errorf("DNS lookup failed for %s: %w", dnsName, err)
	}

	if len(records) == 0 {
		err := fmt.Errorf("no DKIM record found for %s", dnsName)
		v.cacheError(cacheKey, err, 5*time.Minute)
		return nil, nil, err
	}

	// Concatenate records (they may be split due to DNS length limits)
	fullRecord := strings.Join(records, "")

	// Parse the DKIM record
	dkimRecord, err := parseDKIMRecord(fullRecord)
	if err != nil {
		v.cacheError(cacheKey, err, 5*time.Minute)
		return nil, nil, fmt.Errorf("failed to parse DKIM record: %w", err)
	}

	// Check if key is revoked (empty p= value)
	if dkimRecord.PublicKey == "" {
		err := fmt.Errorf("DKIM key has been revoked for %s", dnsName)
		v.cacheError(cacheKey, err, 1*time.Hour)
		return nil, dkimRecord, err
	}

	// Parse public key
	publicKey, err := parsePublicKey(dkimRecord.PublicKey)
	if err != nil {
		v.cacheError(cacheKey, err, 5*time.Minute)
		return nil, dkimRecord, fmt.Errorf("failed to parse public key: %w", err)
	}

	// Cache the result (max 1 hour)
	v.cacheMu.Lock()
	v.cacheItems[cacheKey] = &cachedPublicKey{
		publicKey: publicKey,
		record:    dkimRecord,
		fetchedAt: time.Now(),
		expiresAt: time.Now().Add(1 * time.Hour),
	}
	v.cacheMu.Unlock()

	return publicKey, dkimRecord, nil
}

func (v *Verifier) cacheError(key string, err error, ttl time.Duration) {
	v.cacheMu.Lock()
	v.cacheItems[key] = &cachedPublicKey{
		fetchedAt: time.Now(),
		expiresAt: time.Now().Add(ttl),
		err:       err,
	}
	v.cacheMu.Unlock()
}

// parseDKIMRecord parses a DKIM TXT record
func parseDKIMRecord(record string) (*DKIMRecord, error) {
	result := &DKIMRecord{}

	// Parse tag=value pairs
	params := parseSignatureParams(record)

	result.Version = params["v"]
	result.KeyType = params["k"]
	result.PublicKey = params["p"]
	result.HashAlgos = params["h"]
	result.ServiceType = params["s"]
	result.Flags = params["t"]
	result.Notes = params["n"]

	// Validate version
	if result.Version != "" && result.Version != "DKIM1" {
		return nil, fmt.Errorf("unsupported DKIM record version: %s", result.Version)
	}

	// Default key type is RSA
	if result.KeyType == "" {
		result.KeyType = "rsa"
	}

	// Only RSA is widely supported
	if result.KeyType != "rsa" {
		return nil, fmt.Errorf("unsupported key type: %s", result.KeyType)
	}

	return result, nil
}

// parsePublicKey parses a base64-encoded public key
func parsePublicKey(keyData string) (*rsa.PublicKey, error) {
	// Remove any whitespace
	keyData = strings.ReplaceAll(keyData, " ", "")
	keyData = strings.ReplaceAll(keyData, "\t", "")
	keyData = strings.ReplaceAll(keyData, "\n", "")
	keyData = strings.ReplaceAll(keyData, "\r", "")

	// Decode base64
	der, err := base64.StdEncoding.DecodeString(keyData)
	if err != nil {
		return nil, fmt.Errorf("base64 decode failed: %w", err)
	}

	// Try parsing as PKIX public key first
	pub, err := x509.ParsePKIXPublicKey(der)
	if err == nil {
		if rsaKey, ok := pub.(*rsa.PublicKey); ok {
			return rsaKey, nil
		}
		return nil, fmt.Errorf("key is not RSA")
	}

	// Try parsing as PKCS1 public key
	rsaKey, err := x509.ParsePKCS1PublicKey(der)
	if err == nil {
		return rsaKey, nil
	}

	// Try as PEM
	block, _ := pem.Decode(der)
	if block != nil {
		pub, err = x509.ParsePKIXPublicKey(block.Bytes)
		if err == nil {
			if rsaKey, ok := pub.(*rsa.PublicKey); ok {
				return rsaKey, nil
			}
		}
	}

	return nil, fmt.Errorf("unable to parse public key")
}

// buildSignedHeaderData builds the header data that was signed
func (v *Verifier) buildSignedHeaderData(headers mail.Header, signedHeaders []string, canon string) []byte {
	var result bytes.Buffer

	// Track which headers we've used (for handling multiple headers with same name)
	usedHeaders := make(map[string]int)

	for _, name := range signedHeaders {
		name = strings.TrimSpace(name)
		nameLower := strings.ToLower(name)

		// Get all values for this header
		values := headers[canonicalHeaderName(name)]
		if len(values) == 0 {
			continue
		}

		// Use the next unused instance of this header
		idx := usedHeaders[nameLower]
		if idx >= len(values) {
			continue
		}
		usedHeaders[nameLower]++

		value := values[idx]

		var line string
		switch canon {
		case "simple":
			line = fmt.Sprintf("%s: %s\r\n", name, value)
		case "relaxed":
			line = fmt.Sprintf("%s:%s\r\n", nameLower, canonicalizeHeaderValue(value, "relaxed"))
		default:
			line = fmt.Sprintf("%s:%s\r\n", nameLower, canonicalizeHeaderValue(value, "relaxed"))
		}

		result.WriteString(line)
	}

	return result.Bytes()
}

// buildDKIMHeaderForVerification builds the DKIM-Signature header for verification
// The b= tag value is replaced with empty string
func (v *Verifier) buildDKIMHeaderForVerification(signature, canon string) []byte {
	// Remove the signature value from b= tag
	bTagRegex := regexp.MustCompile(`b=[^;]*`)
	withoutSig := bTagRegex.ReplaceAllString(signature, "b=")

	var line string
	switch canon {
	case "simple":
		line = fmt.Sprintf("DKIM-Signature: %s", withoutSig)
	case "relaxed":
		line = fmt.Sprintf("dkim-signature:%s", canonicalizeHeaderValue(withoutSig, "relaxed"))
	default:
		line = fmt.Sprintf("dkim-signature:%s", canonicalizeHeaderValue(withoutSig, "relaxed"))
	}

	return []byte(line)
}

// canonicalHeaderName converts header name to canonical form (e.g., "from" -> "From")
func canonicalHeaderName(name string) string {
	return strings.Title(strings.ToLower(name))
}

// extractDomainFromHeader extracts the domain from an email address in a header
func extractDomainFromHeader(header string) string {
	// Simple extraction - find @ and take everything after
	idx := strings.LastIndex(header, "@")
	if idx == -1 {
		return ""
	}
	rest := header[idx+1:]

	// Remove any trailing > or whitespace
	rest = strings.TrimRight(rest, "> \t\r\n")
	return strings.ToLower(rest)
}

// isDNSTempError checks if an error is a temporary DNS error
func isDNSTempError(err error) bool {
	if err == nil {
		return false
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return dnsErr.Temporary()
	}
	// Also check for timeout errors
	return strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "temporary")
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
	publicKey := strings.ReplaceAll(key.PublicKeyPEM, "-----BEGIN PUBLIC KEY-----", "")
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
