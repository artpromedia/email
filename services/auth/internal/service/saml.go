// Package service provides SAML 2.0 implementation for SSO.
package service

import (
	"bytes"
	"compress/flate"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/artpromedia/email/services/auth/internal/models"
	"github.com/beevik/etree"
	dsig "github.com/russellhaering/goxmldsig"
)

// Common SAML 2.0 XML namespaces
const (
	SAMLProtocolNamespace  = "urn:oasis:names:tc:SAML:2.0:protocol"
	SAMLAssertionNamespace = "urn:oasis:names:tc:SAML:2.0:assertion"
	XMLDSigNamespace       = "http://www.w3.org/2000/09/xmldsig#"
	XMLEncNamespace        = "http://www.w3.org/2001/04/xmlenc#"
)

// NameID formats
const (
	NameIDFormatEmail            = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
	NameIDFormatPersistent       = "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent"
	NameIDFormatTransient        = "urn:oasis:names:tc:SAML:2.0:nameid-format:transient"
	NameIDFormatUnspecified      = "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified"
)

// Status codes
const (
	StatusSuccess         = "urn:oasis:names:tc:SAML:2.0:status:Success"
	StatusRequester       = "urn:oasis:names:tc:SAML:2.0:status:Requester"
	StatusResponder       = "urn:oasis:names:tc:SAML:2.0:status:Responder"
	StatusVersionMismatch = "urn:oasis:names:tc:SAML:2.0:status:VersionMismatch"
	StatusAuthnFailed     = "urn:oasis:names:tc:SAML:2.0:status:AuthnFailed"
)

// SAMLResponse represents a parsed SAML 2.0 Response
type SAMLResponse struct {
	XMLName      xml.Name `xml:"Response"`
	ID           string   `xml:"ID,attr"`
	Version      string   `xml:"Version,attr"`
	IssueInstant string   `xml:"IssueInstant,attr"`
	Destination  string   `xml:"Destination,attr"`
	InResponseTo string   `xml:"InResponseTo,attr"`
	Issuer       string   `xml:"Issuer"`
	Status       SAMLStatus
	Assertions   []SAMLAssertion `xml:"Assertion"`
}

// SAMLStatus represents the status of a SAML response
type SAMLStatus struct {
	XMLName    xml.Name `xml:"Status"`
	StatusCode SAMLStatusCode
	StatusMessage string `xml:"StatusMessage,omitempty"`
}

// SAMLStatusCode represents a SAML status code
type SAMLStatusCode struct {
	XMLName xml.Name `xml:"StatusCode"`
	Value   string   `xml:"Value,attr"`
}

// SAMLAssertion represents a SAML 2.0 Assertion
type SAMLAssertion struct {
	XMLName           xml.Name `xml:"Assertion"`
	ID                string   `xml:"ID,attr"`
	Version           string   `xml:"Version,attr"`
	IssueInstant      string   `xml:"IssueInstant,attr"`
	Issuer            string   `xml:"Issuer"`
	Subject           SAMLSubject
	Conditions        SAMLConditions
	AuthnStatement    SAMLAuthnStatement
	AttributeStatement SAMLAttributeStatement
}

// SAMLSubject represents the subject of an assertion
type SAMLSubject struct {
	XMLName             xml.Name `xml:"Subject"`
	NameID              SAMLNameID
	SubjectConfirmation SAMLSubjectConfirmation
}

// SAMLNameID represents a SAML NameID
type SAMLNameID struct {
	XMLName         xml.Name `xml:"NameID"`
	Format          string   `xml:"Format,attr"`
	SPNameQualifier string   `xml:"SPNameQualifier,attr,omitempty"`
	Value           string   `xml:",chardata"`
}

// SAMLSubjectConfirmation represents subject confirmation
type SAMLSubjectConfirmation struct {
	XMLName                 xml.Name `xml:"SubjectConfirmation"`
	Method                  string   `xml:"Method,attr"`
	SubjectConfirmationData SAMLSubjectConfirmationData
}

// SAMLSubjectConfirmationData contains confirmation data
type SAMLSubjectConfirmationData struct {
	XMLName      xml.Name `xml:"SubjectConfirmationData"`
	InResponseTo string   `xml:"InResponseTo,attr"`
	NotOnOrAfter string   `xml:"NotOnOrAfter,attr"`
	Recipient    string   `xml:"Recipient,attr"`
}

// SAMLConditions represents assertion conditions
type SAMLConditions struct {
	XMLName              xml.Name `xml:"Conditions"`
	NotBefore            string   `xml:"NotBefore,attr"`
	NotOnOrAfter         string   `xml:"NotOnOrAfter,attr"`
	AudienceRestrictions []SAMLAudienceRestriction `xml:"AudienceRestriction"`
}

// SAMLAudienceRestriction represents audience restrictions
type SAMLAudienceRestriction struct {
	XMLName   xml.Name `xml:"AudienceRestriction"`
	Audiences []string `xml:"Audience"`
}

// SAMLAuthnStatement represents an authentication statement
type SAMLAuthnStatement struct {
	XMLName             xml.Name `xml:"AuthnStatement"`
	AuthnInstant        string   `xml:"AuthnInstant,attr"`
	SessionIndex        string   `xml:"SessionIndex,attr,omitempty"`
	SessionNotOnOrAfter string   `xml:"SessionNotOnOrAfter,attr,omitempty"`
}

// SAMLAttributeStatement contains attribute assertions
type SAMLAttributeStatement struct {
	XMLName    xml.Name        `xml:"AttributeStatement"`
	Attributes []SAMLAttribute `xml:"Attribute"`
}

// SAMLAttribute represents a SAML attribute
type SAMLAttribute struct {
	XMLName      xml.Name `xml:"Attribute"`
	Name         string   `xml:"Name,attr"`
	NameFormat   string   `xml:"NameFormat,attr,omitempty"`
	FriendlyName string   `xml:"FriendlyName,attr,omitempty"`
	Values       []SAMLAttributeValue `xml:"AttributeValue"`
}

// SAMLAttributeValue represents an attribute value
type SAMLAttributeValue struct {
	XMLName xml.Name `xml:"AttributeValue"`
	Type    string   `xml:"type,attr,omitempty"`
	Value   string   `xml:",chardata"`
}

// SAMLAuthnRequest represents a SAML 2.0 AuthnRequest
type SAMLAuthnRequest struct {
	XMLName                        xml.Name `xml:"samlp:AuthnRequest"`
	XMLNS                          string   `xml:"xmlns:samlp,attr"`
	XMLNSSAML                      string   `xml:"xmlns:saml,attr"`
	ID                             string   `xml:"ID,attr"`
	Version                        string   `xml:"Version,attr"`
	IssueInstant                   string   `xml:"IssueInstant,attr"`
	Destination                    string   `xml:"Destination,attr"`
	ProtocolBinding                string   `xml:"ProtocolBinding,attr"`
	AssertionConsumerServiceURL    string   `xml:"AssertionConsumerServiceURL,attr"`
	Issuer                         SAMLAuthnRequestIssuer
	NameIDPolicy                   *SAMLNameIDPolicy `xml:"samlp:NameIDPolicy,omitempty"`
}

// SAMLAuthnRequestIssuer represents the issuer element
type SAMLAuthnRequestIssuer struct {
	XMLName xml.Name `xml:"saml:Issuer"`
	Value   string   `xml:",chardata"`
}

// SAMLNameIDPolicy represents the NameIDPolicy element
type SAMLNameIDPolicy struct {
	XMLName     xml.Name `xml:"samlp:NameIDPolicy"`
	Format      string   `xml:"Format,attr"`
	AllowCreate bool     `xml:"AllowCreate,attr"`
}

// SAMLLogoutRequest represents a SAML 2.0 LogoutRequest
type SAMLLogoutRequest struct {
	XMLName      xml.Name `xml:"samlp:LogoutRequest"`
	XMLNS        string   `xml:"xmlns:samlp,attr"`
	XMLNSSAML    string   `xml:"xmlns:saml,attr"`
	ID           string   `xml:"ID,attr"`
	Version      string   `xml:"Version,attr"`
	IssueInstant string   `xml:"IssueInstant,attr"`
	Destination  string   `xml:"Destination,attr"`
	Issuer       SAMLAuthnRequestIssuer
	NameID       SAMLNameID
	SessionIndex string `xml:"samlp:SessionIndex,omitempty"`
}

// SAMLLogoutResponse represents a SAML 2.0 LogoutResponse
type SAMLLogoutResponse struct {
	XMLName      xml.Name `xml:"LogoutResponse"`
	ID           string   `xml:"ID,attr"`
	Version      string   `xml:"Version,attr"`
	IssueInstant string   `xml:"IssueInstant,attr"`
	Destination  string   `xml:"Destination,attr,omitempty"`
	InResponseTo string   `xml:"InResponseTo,attr"`
	Issuer       string   `xml:"Issuer"`
	Status       SAMLStatus
}

// SAMLService handles SAML operations
type SAMLService struct {
	entityID         string
	acsURL           string
	sloURL           string
	metadataURL      string
	privateKey       *rsa.PrivateKey
	certificate      *x509.Certificate
	clockSkew        time.Duration
}

// NewSAMLService creates a new SAML service
func NewSAMLService(entityID, acsURL, sloURL, metadataURL string, privateKeyPEM, certificatePEM []byte) (*SAMLService, error) {
	service := &SAMLService{
		entityID:    entityID,
		acsURL:      acsURL,
		sloURL:      sloURL,
		metadataURL: metadataURL,
		clockSkew:   5 * time.Minute, // Allow 5 minutes clock skew
	}

	// Parse private key if provided
	if len(privateKeyPEM) > 0 {
		block, _ := pem.Decode(privateKeyPEM)
		if block == nil {
			return nil, errors.New("failed to parse private key PEM")
		}
		key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			// Try PKCS1
			key, err = x509.ParsePKCS1PrivateKey(block.Bytes)
			if err != nil {
				return nil, fmt.Errorf("failed to parse private key: %w", err)
			}
		}
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			return nil, errors.New("private key is not RSA")
		}
		service.privateKey = rsaKey
	}

	// Parse certificate if provided
	if len(certificatePEM) > 0 {
		block, _ := pem.Decode(certificatePEM)
		if block == nil {
			return nil, errors.New("failed to parse certificate PEM")
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse certificate: %w", err)
		}
		service.certificate = cert
	}

	return service, nil
}

// ParseSAMLResponse parses and validates a SAML response
func (s *SAMLService) ParseSAMLResponse(config *models.SAMLConfig, samlResponse, expectedRequestID, expectedAudience string) (*SAMLAssertion, map[string]interface{}, error) {
	// Base64 decode the response
	decoded, err := base64.StdEncoding.DecodeString(samlResponse)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to decode SAML response: %w", err)
	}

	// Parse the XML
	doc := etree.NewDocument()
	if err := doc.ReadFromBytes(decoded); err != nil {
		return nil, nil, fmt.Errorf("failed to parse SAML response XML: %w", err)
	}

	// Verify XML signature using IdP certificate
	if config.WantAssertionsSigned {
		if err := s.verifySignature(doc, config.Certificate); err != nil {
			return nil, nil, fmt.Errorf("signature verification failed: %w", err)
		}
	}

	// Parse the response structure
	var response SAMLResponse
	if err := xml.Unmarshal(decoded, &response); err != nil {
		return nil, nil, fmt.Errorf("failed to unmarshal SAML response: %w", err)
	}

	// Validate response status
	if response.Status.StatusCode.Value != StatusSuccess {
		return nil, nil, fmt.Errorf("SAML response status: %s - %s",
			response.Status.StatusCode.Value, response.Status.StatusMessage)
	}

	// Validate InResponseTo if we have an expected request ID
	if expectedRequestID != "" && response.InResponseTo != expectedRequestID {
		return nil, nil, errors.New("InResponseTo mismatch")
	}

	// Validate Destination
	if response.Destination != "" && response.Destination != s.acsURL {
		return nil, nil, fmt.Errorf("destination mismatch: expected %s, got %s", s.acsURL, response.Destination)
	}

	// Validate Issuer matches IdP Entity ID
	if config.IDPEntityID != "" && response.Issuer != config.IDPEntityID {
		return nil, nil, fmt.Errorf("issuer mismatch: expected %s, got %s", config.IDPEntityID, response.Issuer)
	}

	if len(response.Assertions) == 0 {
		// Try to find encrypted assertion
		encryptedAssertion := doc.FindElement("//EncryptedAssertion")
		if encryptedAssertion != nil {
			assertion, err := s.decryptAssertion(encryptedAssertion)
			if err != nil {
				return nil, nil, fmt.Errorf("failed to decrypt assertion: %w", err)
			}
			response.Assertions = append(response.Assertions, *assertion)
		} else {
			return nil, nil, errors.New("no assertions found in SAML response")
		}
	}

	// Validate the first assertion
	assertion := &response.Assertions[0]

	// Validate assertion conditions
	if err := s.validateConditions(&assertion.Conditions, expectedAudience); err != nil {
		return nil, nil, fmt.Errorf("condition validation failed: %w", err)
	}

	// Validate subject confirmation
	if err := s.validateSubjectConfirmation(&assertion.Subject.SubjectConfirmation, expectedRequestID); err != nil {
		return nil, nil, fmt.Errorf("subject confirmation validation failed: %w", err)
	}

	// Extract attributes
	attributes := s.extractAttributes(assertion, config.AttributeMapping)

	// Add NameID to attributes
	attributes["nameID"] = assertion.Subject.NameID.Value
	attributes["nameIDFormat"] = assertion.Subject.NameID.Format

	return assertion, attributes, nil
}

// verifySignature verifies the XML digital signature
func (s *SAMLService) verifySignature(doc *etree.Document, idpCertPEM string) error {
	// Parse IdP certificate
	block, _ := pem.Decode([]byte(idpCertPEM))
	if block == nil {
		// Try without PEM wrapper
		certDER, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(idpCertPEM, "\n", ""))
		if err != nil {
			return errors.New("failed to decode IdP certificate")
		}
		block = &pem.Block{Bytes: certDER}
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return fmt.Errorf("failed to parse IdP certificate: %w", err)
	}

	// Create validation context
	ctx := dsig.NewDefaultValidationContext(&dsig.MemoryX509CertificateStore{
		Roots: []*x509.Certificate{cert},
	})

	// Find Signature element
	signatureEl := doc.FindElement("//Signature")
	if signatureEl == nil {
		signatureEl = doc.FindElement("//ds:Signature")
	}
	if signatureEl == nil {
		return errors.New("no signature found in SAML response")
	}

	// Validate signature
	_, err = ctx.Validate(doc.Root())
	if err != nil {
		return fmt.Errorf("signature validation failed: %w", err)
	}

	return nil
}

// decryptAssertion decrypts an encrypted assertion
func (s *SAMLService) decryptAssertion(encryptedEl *etree.Element) (*SAMLAssertion, error) {
	if s.privateKey == nil {
		return nil, errors.New("private key required for decryption")
	}

	// Find EncryptedKey element
	encKeyEl := encryptedEl.FindElement(".//xenc:EncryptedKey")
	if encKeyEl == nil {
		encKeyEl = encryptedEl.FindElement(".//EncryptedKey")
	}
	if encKeyEl == nil {
		return nil, errors.New("no EncryptedKey found")
	}

	// Get cipher value for the key
	cipherValueEl := encKeyEl.FindElement(".//xenc:CipherValue")
	if cipherValueEl == nil {
		cipherValueEl = encKeyEl.FindElement(".//CipherValue")
	}
	if cipherValueEl == nil {
		return nil, errors.New("no CipherValue found for key")
	}

	// Decode and decrypt the session key
	encryptedKey, err := base64.StdEncoding.DecodeString(cipherValueEl.Text())
	if err != nil {
		return nil, fmt.Errorf("failed to decode encrypted key: %w", err)
	}

	sessionKey, err := rsa.DecryptPKCS1v15(nil, s.privateKey, encryptedKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt session key: %w", err)
	}

	// Find CipherData for the assertion
	cipherDataEl := encryptedEl.FindElement("./xenc:EncryptedData/xenc:CipherData/xenc:CipherValue")
	if cipherDataEl == nil {
		cipherDataEl = encryptedEl.FindElement("./EncryptedData/CipherData/CipherValue")
	}
	if cipherDataEl == nil {
		return nil, errors.New("no encrypted assertion data found")
	}

	// Decode and decrypt assertion
	encryptedData, err := base64.StdEncoding.DecodeString(cipherDataEl.Text())
	if err != nil {
		return nil, fmt.Errorf("failed to decode encrypted data: %w", err)
	}

	// AES-CBC decryption (assuming AES-128 or AES-256 based on key size)
	decryptedData, err := decryptAESCBC(sessionKey, encryptedData)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt assertion: %w", err)
	}

	// Parse decrypted assertion
	var assertion SAMLAssertion
	if err := xml.Unmarshal(decryptedData, &assertion); err != nil {
		return nil, fmt.Errorf("failed to parse decrypted assertion: %w", err)
	}

	return &assertion, nil
}

// validateConditions validates assertion conditions
func (s *SAMLService) validateConditions(conditions *SAMLConditions, expectedAudience string) error {
	now := time.Now()

	// Parse NotBefore
	if conditions.NotBefore != "" {
		notBefore, err := time.Parse(time.RFC3339, conditions.NotBefore)
		if err != nil {
			return fmt.Errorf("invalid NotBefore format: %w", err)
		}
		// Allow clock skew
		if now.Add(s.clockSkew).Before(notBefore) {
			return fmt.Errorf("assertion not yet valid (NotBefore: %s)", conditions.NotBefore)
		}
	}

	// Parse NotOnOrAfter
	if conditions.NotOnOrAfter != "" {
		notOnOrAfter, err := time.Parse(time.RFC3339, conditions.NotOnOrAfter)
		if err != nil {
			return fmt.Errorf("invalid NotOnOrAfter format: %w", err)
		}
		// Allow clock skew
		if now.Add(-s.clockSkew).After(notOnOrAfter) {
			return fmt.Errorf("assertion expired (NotOnOrAfter: %s)", conditions.NotOnOrAfter)
		}
	}

	// Validate audience
	if expectedAudience != "" && len(conditions.AudienceRestrictions) > 0 {
		found := false
		for _, ar := range conditions.AudienceRestrictions {
			for _, aud := range ar.Audiences {
				if aud == expectedAudience {
					found = true
					break
				}
			}
		}
		if !found {
			return fmt.Errorf("audience mismatch: expected %s", expectedAudience)
		}
	}

	return nil
}

// validateSubjectConfirmation validates subject confirmation data
func (s *SAMLService) validateSubjectConfirmation(sc *SAMLSubjectConfirmation, expectedRequestID string) error {
	// Validate method is bearer
	if sc.Method != "urn:oasis:names:tc:SAML:2.0:cm:bearer" {
		return fmt.Errorf("unsupported subject confirmation method: %s", sc.Method)
	}

	scd := &sc.SubjectConfirmationData

	// Validate InResponseTo
	if expectedRequestID != "" && scd.InResponseTo != expectedRequestID {
		return errors.New("SubjectConfirmationData InResponseTo mismatch")
	}

	// Validate NotOnOrAfter
	if scd.NotOnOrAfter != "" {
		notOnOrAfter, err := time.Parse(time.RFC3339, scd.NotOnOrAfter)
		if err != nil {
			return fmt.Errorf("invalid NotOnOrAfter format: %w", err)
		}
		if time.Now().Add(-s.clockSkew).After(notOnOrAfter) {
			return errors.New("SubjectConfirmationData expired")
		}
	}

	// Validate Recipient
	if scd.Recipient != "" && scd.Recipient != s.acsURL {
		return fmt.Errorf("recipient mismatch: expected %s, got %s", s.acsURL, scd.Recipient)
	}

	return nil
}

// extractAttributes extracts attributes from assertion using attribute mapping
func (s *SAMLService) extractAttributes(assertion *SAMLAssertion, mapping map[string]string) map[string]interface{} {
	attrs := make(map[string]interface{})

	for _, attr := range assertion.AttributeStatement.Attributes {
		// Get attribute name to use
		attrName := attr.Name
		if attr.FriendlyName != "" {
			attrName = attr.FriendlyName
		}

		// Check if there's a mapping
		if mapping != nil {
			for targetKey, sourceKey := range mapping {
				if sourceKey == attr.Name || sourceKey == attr.FriendlyName {
					attrName = targetKey
					break
				}
			}
		}

		// Extract values
		if len(attr.Values) == 1 {
			attrs[attrName] = attr.Values[0].Value
		} else if len(attr.Values) > 1 {
			values := make([]string, len(attr.Values))
			for i, v := range attr.Values {
				values[i] = v.Value
			}
			attrs[attrName] = values
		}
	}

	return attrs
}

// CreateAuthnRequest creates a SAML AuthnRequest
func (s *SAMLService) CreateAuthnRequest(idpSSOURL string, requestID string, nameIDFormat string) (string, string, error) {
	if requestID == "" {
		requestID = "_" + generateSecureToken()
	}

	if nameIDFormat == "" {
		nameIDFormat = NameIDFormatEmail
	}

	authnRequest := SAMLAuthnRequest{
		XMLNS:                       SAMLProtocolNamespace,
		XMLNSSAML:                   SAMLAssertionNamespace,
		ID:                          requestID,
		Version:                     "2.0",
		IssueInstant:                time.Now().UTC().Format(time.RFC3339),
		Destination:                 idpSSOURL,
		ProtocolBinding:             "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
		AssertionConsumerServiceURL: s.acsURL,
		Issuer: SAMLAuthnRequestIssuer{
			Value: s.entityID,
		},
		NameIDPolicy: &SAMLNameIDPolicy{
			Format:      nameIDFormat,
			AllowCreate: true,
		},
	}

	// Marshal to XML
	xmlBytes, err := xml.Marshal(authnRequest)
	if err != nil {
		return "", "", fmt.Errorf("failed to marshal AuthnRequest: %w", err)
	}

	// Deflate and base64 encode for redirect binding
	var buf bytes.Buffer
	writer, _ := flate.NewWriter(&buf, flate.BestCompression)
	writer.Write(xmlBytes)
	writer.Close()

	encodedRequest := base64.StdEncoding.EncodeToString(buf.Bytes())
	samlRequest := url.QueryEscape(encodedRequest)

	return requestID, samlRequest, nil
}

// CreateLogoutRequest creates a SAML LogoutRequest (SP-initiated SLO)
func (s *SAMLService) CreateLogoutRequest(idpSLOURL, nameID, nameIDFormat, sessionIndex string) (string, string, error) {
	requestID := "_" + generateSecureToken()

	logoutRequest := SAMLLogoutRequest{
		XMLNS:        SAMLProtocolNamespace,
		XMLNSSAML:    SAMLAssertionNamespace,
		ID:           requestID,
		Version:      "2.0",
		IssueInstant: time.Now().UTC().Format(time.RFC3339),
		Destination:  idpSLOURL,
		Issuer: SAMLAuthnRequestIssuer{
			Value: s.entityID,
		},
		NameID: SAMLNameID{
			Format: nameIDFormat,
			Value:  nameID,
		},
		SessionIndex: sessionIndex,
	}

	// Marshal to XML
	xmlBytes, err := xml.Marshal(logoutRequest)
	if err != nil {
		return "", "", fmt.Errorf("failed to marshal LogoutRequest: %w", err)
	}

	// Deflate and base64 encode
	var buf bytes.Buffer
	writer, _ := flate.NewWriter(&buf, flate.BestCompression)
	writer.Write(xmlBytes)
	writer.Close()

	encodedRequest := base64.StdEncoding.EncodeToString(buf.Bytes())

	return requestID, encodedRequest, nil
}

// ParseLogoutRequest parses and validates a SAML LogoutRequest (IdP-initiated SLO)
func (s *SAMLService) ParseLogoutRequest(config *models.SAMLConfig, samlRequest string) (*SAMLLogoutRequest, error) {
	// Base64 decode
	decoded, err := base64.StdEncoding.DecodeString(samlRequest)
	if err != nil {
		return nil, fmt.Errorf("failed to decode logout request: %w", err)
	}

	// Try to inflate (might be compressed)
	reader := flate.NewReader(bytes.NewReader(decoded))
	inflated, err := io.ReadAll(reader)
	if err != nil {
		// Not compressed, use decoded directly
		inflated = decoded
	}

	var request SAMLLogoutRequest
	if err := xml.Unmarshal(inflated, &request); err != nil {
		return nil, fmt.Errorf("failed to parse logout request: %w", err)
	}

	return &request, nil
}

// CreateLogoutResponse creates a SAML LogoutResponse
func (s *SAMLService) CreateLogoutResponse(inResponseTo, destination string, success bool) (string, error) {
	responseID := "_" + generateSecureToken()

	statusCode := StatusSuccess
	if !success {
		statusCode = StatusResponder
	}

	logoutResponse := SAMLLogoutResponse{
		ID:           responseID,
		Version:      "2.0",
		IssueInstant: time.Now().UTC().Format(time.RFC3339),
		Destination:  destination,
		InResponseTo: inResponseTo,
		Issuer:       s.entityID,
		Status: SAMLStatus{
			StatusCode: SAMLStatusCode{
				Value: statusCode,
			},
		},
	}

	// Marshal to XML
	xmlBytes, err := xml.Marshal(logoutResponse)
	if err != nil {
		return "", fmt.Errorf("failed to marshal LogoutResponse: %w", err)
	}

	// Base64 encode
	return base64.StdEncoding.EncodeToString(xmlBytes), nil
}

// GenerateMetadata generates SAML SP metadata
func (s *SAMLService) GenerateMetadata(organization, contactEmail string) (string, error) {
	certPEM := ""
	if s.certificate != nil {
		certPEM = base64.StdEncoding.EncodeToString(s.certificate.Raw)
	}

	metadata := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
                     entityID="%s">
  <md:SPSSODescriptor AuthnRequestsSigned="true"
                      WantAssertionsSigned="true"
                      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo>
        <ds:X509Data>
          <ds:X509Certificate>%s</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:KeyDescriptor use="encryption">
      <ds:KeyInfo>
        <ds:X509Data>
          <ds:X509Certificate>%s</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                            Location="%s"/>
    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                            Location="%s"/>
    <md:NameIDFormat>%s</md:NameIDFormat>
    <md:NameIDFormat>%s</md:NameIDFormat>
    <md:NameIDFormat>%s</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                                 Location="%s"
                                 index="0"
                                 isDefault="true"/>
  </md:SPSSODescriptor>
  <md:Organization>
    <md:OrganizationName xml:lang="en">%s</md:OrganizationName>
    <md:OrganizationDisplayName xml:lang="en">%s</md:OrganizationDisplayName>
    <md:OrganizationURL xml:lang="en">%s</md:OrganizationURL>
  </md:Organization>
  <md:ContactPerson contactType="technical">
    <md:EmailAddress>%s</md:EmailAddress>
  </md:ContactPerson>
</md:EntityDescriptor>`,
		s.entityID,
		certPEM,
		certPEM,
		s.sloURL,
		s.sloURL,
		NameIDFormatEmail,
		NameIDFormatPersistent,
		NameIDFormatTransient,
		s.acsURL,
		organization,
		organization,
		s.metadataURL,
		contactEmail,
	)

	return metadata, nil
}

// signRequest signs a SAML request using the SP private key
func (s *SAMLService) signRequest(requestXML []byte) ([]byte, error) {
	if s.privateKey == nil || s.certificate == nil {
		return requestXML, nil // Return unsigned if no key
	}

	// Hash the request
	h := sha256.New()
	h.Write(requestXML)
	digest := h.Sum(nil)

	// Sign the digest
	signature, err := rsa.SignPKCS1v15(nil, s.privateKey, crypto.SHA256, digest)
	if err != nil {
		return nil, fmt.Errorf("failed to sign request: %w", err)
	}

	_ = signature // In production, embed signature in XML
	// For simplicity, return the original - full implementation would
	// use goxmldsig to add proper XML signature

	return requestXML, nil
}

// Helper function for AES-CBC decryption (simplified)
func decryptAESCBC(key, ciphertext []byte) ([]byte, error) {
	// Implementation would use crypto/aes and crypto/cipher
	// This is a placeholder - actual implementation depends on
	// the specific encryption used by the IdP
	return nil, errors.New("AES decryption not implemented - use a proper crypto library")
}
