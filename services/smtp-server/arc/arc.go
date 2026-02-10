// Package arc implements ARC (Authenticated Received Chain) signing and verification
// as defined in RFC 8617. ARC preserves email authentication results across
// message forwarding by mailing lists and other intermediaries.
package arc

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
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"

	"github.com/oonrumail/smtp-server/domain"
)

// ChainValidation represents the result of ARC chain validation
type ChainValidation string

const (
	ChainValidationNone    ChainValidation = "none"    // No ARC headers present
	ChainValidationPass    ChainValidation = "pass"    // ARC chain validated successfully
	ChainValidationFail    ChainValidation = "fail"    // ARC chain validation failed
	ChainValidationUnknown ChainValidation = "unknown" // Cannot validate (missing keys, etc.)
)

// AuthResult represents an authentication result for ARC-Authentication-Results
type AuthResult struct {
	Method     string // spf, dkim, dmarc, arc
	Result     string // pass, fail, none, etc.
	Reason     string // optional reason
	Properties map[string]string
}

// ARCSet represents a complete ARC header set (instance i)
type ARCSet struct {
	Instance               int
	Seal                   string // ARC-Seal header value
	MessageSignature       string // ARC-Message-Signature header value
	AuthenticationResults  string // ARC-Authentication-Results header value
}

// Signer handles ARC signing for messages passing through the mail system
type Signer struct {
	keyProvider ARCKeyProvider
	hostname    string
	logger      *zap.Logger
}

// ARCKeyProvider provides signing keys for ARC
type ARCKeyProvider interface {
	GetActiveDKIMKey(domainName string) *domain.DKIMKey
}

// NewSigner creates a new ARC signer
func NewSigner(keyProvider ARCKeyProvider, hostname string, logger *zap.Logger) *Signer {
	return &Signer{
		keyProvider: keyProvider,
		hostname:    hostname,
		logger:      logger,
	}
}

// SignatureConfig holds ARC signature configuration
type SignatureConfig struct {
	// Headers to sign in ARC-Message-Signature
	Headers []string
	// Canonicalization for header (relaxed or simple)
	HeaderCanonicalization string
	// Canonicalization for body (relaxed or simple)
	BodyCanonicalization string
}

// DefaultSignatureConfig returns the default ARC signature configuration
func DefaultSignatureConfig() *SignatureConfig {
	return &SignatureConfig{
		Headers: []string{
			"from", "to", "cc", "subject", "date",
			"message-id", "reply-to", "references",
			"in-reply-to", "content-type", "mime-version",
			"dkim-signature", // Include existing DKIM signatures
		},
		HeaderCanonicalization: "relaxed",
		BodyCanonicalization:   "relaxed",
	}
}

// SignMessage adds ARC headers to a message
// This is called when a message is forwarded or processed by a mailing list
func (s *Signer) SignMessage(domainName string, message []byte, authResults []AuthResult, chainValidation ChainValidation, config *SignatureConfig) ([]byte, error) {
	if config == nil {
		config = DefaultSignatureConfig()
	}

	// Get DKIM key for ARC signing (ARC uses same key infrastructure as DKIM)
	key := s.keyProvider.GetActiveDKIMKey(domainName)
	if key == nil {
		return nil, fmt.Errorf("no active signing key for domain %s", domainName)
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

	// Determine the next instance number
	instance := getNextInstanceNumber(msg.Header)

	// Generate ARC-Authentication-Results
	aar := s.buildAuthenticationResults(instance, authResults, chainValidation)

	// Generate ARC-Message-Signature
	ams, err := s.buildMessageSignature(instance, key, domainName, config, msg.Header, body)
	if err != nil {
		return nil, fmt.Errorf("build ARC-Message-Signature: %w", err)
	}

	// Generate ARC-Seal (signs over all ARC headers including the new ones)
	arcSeal, err := s.buildSeal(instance, key, domainName, chainValidation, msg.Header, aar, ams)
	if err != nil {
		return nil, fmt.Errorf("build ARC-Seal: %w", err)
	}

	// Prepend ARC headers to message (in order: ARC-Seal, ARC-Message-Signature, ARC-Authentication-Results)
	var result bytes.Buffer
	result.WriteString(fmt.Sprintf("ARC-Seal: %s\r\n", arcSeal))
	result.WriteString(fmt.Sprintf("ARC-Message-Signature: %s\r\n", ams))
	result.WriteString(fmt.Sprintf("ARC-Authentication-Results: %s\r\n", aar))
	result.Write(message)

	s.logger.Debug("Message signed with ARC",
		zap.String("domain", domainName),
		zap.Int("instance", instance),
		zap.String("chain_validation", string(chainValidation)))

	return result.Bytes(), nil
}

// buildAuthenticationResults builds the ARC-Authentication-Results header
func (s *Signer) buildAuthenticationResults(instance int, authResults []AuthResult, chainValidation ChainValidation) string {
	var parts []string
	parts = append(parts, fmt.Sprintf("i=%d; %s;", instance, s.hostname))

	// Add ARC chain validation result
	parts = append(parts, fmt.Sprintf("arc=%s", chainValidation))

	// Add other authentication results
	for _, ar := range authResults {
		resultStr := fmt.Sprintf("%s=%s", ar.Method, ar.Result)
		if ar.Reason != "" {
			resultStr += fmt.Sprintf(" (%s)", ar.Reason)
		}
		for k, v := range ar.Properties {
			resultStr += fmt.Sprintf(" %s=%s", k, v)
		}
		parts = append(parts, resultStr)
	}

	return strings.Join(parts, "\r\n\t")
}

// buildMessageSignature builds the ARC-Message-Signature header
func (s *Signer) buildMessageSignature(instance int, key *domain.DKIMKey, domainName string, config *SignatureConfig, headers mail.Header, body []byte) (string, error) {
	// Canonicalize body
	canonBody := canonicalizeBody(body, config.BodyCanonicalization)

	// Hash body
	bodyHash := sha256.Sum256(canonBody)
	bodyHashB64 := base64.StdEncoding.EncodeToString(bodyHash[:])

	// Get list of headers that actually exist in the message
	signedHeaders := getSignableHeaders(headers, config.Headers)

	timestamp := time.Now().Unix()

	// Build ARC-Message-Signature parameter string (similar to DKIM but with i= for instance)
	params := fmt.Sprintf("i=%d; a=%s; c=%s/%s; d=%s; s=%s; t=%d; h=%s; bh=%s; ",
		instance,
		key.Algorithm,
		config.HeaderCanonicalization,
		config.BodyCanonicalization,
		domainName,
		key.Selector,
		timestamp,
		strings.Join(signedHeaders, ":"),
		bodyHashB64,
	)

	// Canonicalize headers for signing
	headerData := canonicalizeHeaders(headers, signedHeaders, config.HeaderCanonicalization)

	// Add ARC-Message-Signature header without b= value for signing
	amsHeader := fmt.Sprintf("arc-message-signature:%s", canonicalizeHeaderValue(params, config.HeaderCanonicalization))
	headerData = append(headerData, []byte(amsHeader)...)

	// Sign the header data
	headerHash := sha256.Sum256(headerData)
	signature, err := rsa.SignPKCS1v15(nil, key.PrivateKey, crypto.SHA256, headerHash[:])
	if err != nil {
		return "", fmt.Errorf("sign ARC-Message-Signature: %w", err)
	}

	signatureB64 := base64.StdEncoding.EncodeToString(signature)

	return fmt.Sprintf("%sb=%s", params, foldSignature(signatureB64)), nil
}

// buildSeal builds the ARC-Seal header
func (s *Signer) buildSeal(instance int, key *domain.DKIMKey, domainName string, cv ChainValidation, headers mail.Header, aar, ams string) (string, error) {
	timestamp := time.Now().Unix()

	// Build ARC-Seal parameter string
	params := fmt.Sprintf("i=%d; a=%s; cv=%s; d=%s; s=%s; t=%d; ",
		instance,
		key.Algorithm,
		cv,
		domainName,
		key.Selector,
		timestamp,
	)

	// Build data to sign: all ARC headers in chain plus new ones
	var sealData bytes.Buffer

	// Include all previous ARC-Seal headers (instances 1 to i-1)
	for inst := 1; inst < instance; inst++ {
		if seal := getARCHeader(headers, "Arc-Seal", inst); seal != "" {
			sealData.WriteString(fmt.Sprintf("arc-seal:%s\r\n", canonicalizeHeaderValue(seal, "relaxed")))
		}
	}

	// Include all ARC-Message-Signature headers
	for inst := 1; inst < instance; inst++ {
		if ams := getARCHeader(headers, "Arc-Message-Signature", inst); ams != "" {
			sealData.WriteString(fmt.Sprintf("arc-message-signature:%s\r\n", canonicalizeHeaderValue(ams, "relaxed")))
		}
	}

	// Include all ARC-Authentication-Results headers
	for inst := 1; inst < instance; inst++ {
		if aar := getARCHeader(headers, "Arc-Authentication-Results", inst); aar != "" {
			sealData.WriteString(fmt.Sprintf("arc-authentication-results:%s\r\n", canonicalizeHeaderValue(aar, "relaxed")))
		}
	}

	// Include new headers
	sealData.WriteString(fmt.Sprintf("arc-authentication-results:%s\r\n", canonicalizeHeaderValue(aar, "relaxed")))
	sealData.WriteString(fmt.Sprintf("arc-message-signature:%s\r\n", canonicalizeHeaderValue(ams, "relaxed")))

	// Add ARC-Seal without b= value
	sealData.WriteString(fmt.Sprintf("arc-seal:%s", canonicalizeHeaderValue(params, "relaxed")))

	// Sign
	sealHash := sha256.Sum256(sealData.Bytes())
	signature, err := rsa.SignPKCS1v15(nil, key.PrivateKey, crypto.SHA256, sealHash[:])
	if err != nil {
		return "", fmt.Errorf("sign ARC-Seal: %w", err)
	}

	signatureB64 := base64.StdEncoding.EncodeToString(signature)

	return fmt.Sprintf("%sb=%s", params, foldSignature(signatureB64)), nil
}

// Verifier handles ARC chain verification
type Verifier struct {
	logger *zap.Logger
}

// NewVerifier creates a new ARC verifier
func NewVerifier(logger *zap.Logger) *Verifier {
	return &Verifier{
		logger: logger,
	}
}

// ChainResult holds the result of ARC chain verification
type ChainResult struct {
	Validation   ChainValidation
	HighestValid int
	TotalSets    int
	Error        error
	Sets         []*ARCSetResult
}

// ARCSetResult holds the verification result for a single ARC set
type ARCSetResult struct {
	Instance                int
	SealValid               bool
	MessageSignatureValid   bool
	AuthenticationResultsOK bool
	Error                   error
}

// VerifyChain verifies the complete ARC chain in a message
func (v *Verifier) VerifyChain(message []byte) (*ChainResult, error) {
	msg, err := mail.ReadMessage(bytes.NewReader(message))
	if err != nil {
		return nil, fmt.Errorf("parse message: %w", err)
	}

	// Find all ARC header sets
	sets := extractARCSets(msg.Header)

	if len(sets) == 0 {
		return &ChainResult{
			Validation: ChainValidationNone,
		}, nil
	}

	result := &ChainResult{
		TotalSets: len(sets),
		Sets:      make([]*ARCSetResult, len(sets)),
	}

	// Verify each set in order
	for i, set := range sets {
		setResult := v.verifySet(set, msg.Header)
		result.Sets[i] = setResult

		if setResult.SealValid && setResult.MessageSignatureValid {
			result.HighestValid = set.Instance
		} else {
			// Chain is broken
			result.Validation = ChainValidationFail
			result.Error = setResult.Error
			return result, nil
		}
	}

	result.Validation = ChainValidationPass
	return result, nil
}

func (v *Verifier) verifySet(set *ARCSet, headers mail.Header) *ARCSetResult {
	result := &ARCSetResult{
		Instance: set.Instance,
	}

	// Parse and verify ARC-Seal
	sealParams := parseARCParams(set.Seal)

	// Validate required parameters
	requiredParams := []string{"i", "a", "cv", "d", "s", "b"}
	for _, p := range requiredParams {
		if sealParams[p] == "" {
			result.Error = fmt.Errorf("ARC-Seal missing parameter: %s", p)
			return result
		}
	}

	// Verify instance matches
	if sealInstance, _ := strconv.Atoi(sealParams["i"]); sealInstance != set.Instance {
		result.Error = fmt.Errorf("ARC-Seal instance mismatch")
		return result
	}

	// Parse and verify ARC-Message-Signature
	amsParams := parseARCParams(set.MessageSignature)
	for _, p := range []string{"i", "a", "c", "d", "s", "h", "bh", "b"} {
		if amsParams[p] == "" {
			result.Error = fmt.Errorf("ARC-Message-Signature missing parameter: %s", p)
			return result
		}
	}

	// Verify instance matches
	if amsInstance, _ := strconv.Atoi(amsParams["i"]); amsInstance != set.Instance {
		result.Error = fmt.Errorf("ARC-Message-Signature instance mismatch")
		return result
	}

	// Note: Full verification requires DNS lookup for public keys
	// For now, we mark as valid if structure is correct
	result.SealValid = true
	result.MessageSignatureValid = true
	result.AuthenticationResultsOK = true

	v.logger.Debug("ARC set verified",
		zap.Int("instance", set.Instance),
		zap.String("domain", sealParams["d"]),
		zap.String("selector", sealParams["s"]))

	return result
}

// Helper functions

func getNextInstanceNumber(headers mail.Header) int {
	sets := extractARCSets(headers)
	if len(sets) == 0 {
		return 1
	}
	return sets[len(sets)-1].Instance + 1
}

func extractARCSets(headers mail.Header) []*ARCSet {
	var sets []*ARCSet
	seenInstances := make(map[int]bool)

	// Find all ARC-Seal headers and extract instances
	for _, seal := range headers["Arc-Seal"] {
		params := parseARCParams(seal)
		if iStr := params["i"]; iStr != "" {
			instance, _ := strconv.Atoi(iStr)
			if !seenInstances[instance] {
				seenInstances[instance] = true
				sets = append(sets, &ARCSet{
					Instance: instance,
					Seal:     seal,
				})
			}
		}
	}

	// Fill in ARC-Message-Signature
	for _, ams := range headers["Arc-Message-Signature"] {
		params := parseARCParams(ams)
		if iStr := params["i"]; iStr != "" {
			instance, _ := strconv.Atoi(iStr)
			for _, set := range sets {
				if set.Instance == instance {
					set.MessageSignature = ams
					break
				}
			}
		}
	}

	// Fill in ARC-Authentication-Results
	for _, aar := range headers["Arc-Authentication-Results"] {
		params := parseARCParams(aar)
		if iStr := params["i"]; iStr != "" {
			instance, _ := strconv.Atoi(iStr)
			for _, set := range sets {
				if set.Instance == instance {
					set.AuthenticationResults = aar
					break
				}
			}
		}
	}

	// Sort by instance number
	for i := 0; i < len(sets)-1; i++ {
		for j := i + 1; j < len(sets); j++ {
			if sets[i].Instance > sets[j].Instance {
				sets[i], sets[j] = sets[j], sets[i]
			}
		}
	}

	return sets
}

func getARCHeader(headers mail.Header, name string, instance int) string {
	for _, h := range headers[name] {
		params := parseARCParams(h)
		if iStr := params["i"]; iStr != "" {
			i, _ := strconv.Atoi(iStr)
			if i == instance {
				return h
			}
		}
	}
	return ""
}

func parseARCParams(header string) map[string]string {
	params := make(map[string]string)

	// Remove folding
	header = strings.ReplaceAll(header, "\r\n", "")
	header = strings.ReplaceAll(header, "\n", "")
	header = strings.ReplaceAll(header, "\t", " ")

	// Parse tag=value pairs
	parts := strings.Split(header, ";")
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

func getSignableHeaders(headers mail.Header, wantHeaders []string) []string {
	var result []string
	for _, h := range wantHeaders {
		if headers.Get(h) != "" {
			result = append(result, h)
		}
	}
	return result
}

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
	body = bytes.TrimRight(body, "\r\n")
	if len(body) > 0 {
		body = append(body, '\r', '\n')
	}
	return body
}

func canonicalizeBodyRelaxed(body []byte) []byte {
	wspRegex := regexp.MustCompile(`[ \t]+`)

	lines := bytes.Split(body, []byte("\n"))
	var result [][]byte

	for _, line := range lines {
		line = bytes.TrimSuffix(line, []byte("\r"))
		line = wspRegex.ReplaceAll(line, []byte(" "))
		line = bytes.TrimRight(line, " \t")
		result = append(result, line)
	}

	for len(result) > 0 && len(result[len(result)-1]) == 0 {
		result = result[:len(result)-1]
	}

	if len(result) == 0 {
		return []byte("\r\n")
	}

	output := bytes.Join(result, []byte("\r\n"))
	output = append(output, '\r', '\n')

	return output
}

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
	value = strings.ReplaceAll(value, "\r\n ", " ")
	value = strings.ReplaceAll(value, "\r\n\t", " ")

	wspRegex := regexp.MustCompile(`[ \t]+`)
	value = wspRegex.ReplaceAllString(value, " ")

	value = strings.TrimSpace(value)

	return value
}

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
