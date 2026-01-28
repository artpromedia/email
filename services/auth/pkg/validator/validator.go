// Package validator provides custom validation functions.
package validator

import (
	"regexp"
	"strings"
	"unicode"

	"github.com/go-playground/validator/v10"
)

// Patterns for validation
var (
	emailRegex     = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	domainRegex    = regexp.MustCompile(`^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$`)
	slugRegex      = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	usernameRegex  = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,32}$`)
)

// NewValidator creates a new validator with custom validation functions.
func NewValidator() *validator.Validate {
	v := validator.New(validator.WithRequiredStructEnabled())

	// Register custom validators
	v.RegisterValidation("fqdn", validateFQDN)
	v.RegisterValidation("slug", validateSlug)
	v.RegisterValidation("username", validateUsername)
	v.RegisterValidation("strong_password", validateStrongPassword)
	v.RegisterValidation("safe_html", validateSafeHTML)

	return v
}

// validateFQDN validates a fully qualified domain name.
func validateFQDN(fl validator.FieldLevel) bool {
	domain := fl.Field().String()
	if domain == "" {
		return false
	}
	return domainRegex.MatchString(domain)
}

// validateSlug validates a URL-safe slug.
func validateSlug(fl validator.FieldLevel) bool {
	slug := fl.Field().String()
	if slug == "" {
		return false
	}
	return slugRegex.MatchString(slug)
}

// validateUsername validates a username.
func validateUsername(fl validator.FieldLevel) bool {
	username := fl.Field().String()
	if username == "" {
		return false
	}
	return usernameRegex.MatchString(username)
}

// validateStrongPassword validates a strong password.
func validateStrongPassword(fl validator.FieldLevel) bool {
	password := fl.Field().String()
	return ValidatePasswordStrength(password) == nil
}

// validateSafeHTML validates that a string doesn't contain dangerous HTML.
func validateSafeHTML(fl validator.FieldLevel) bool {
	text := fl.Field().String()
	// Check for script tags and other dangerous patterns
	dangerous := []string{
		"<script",
		"</script>",
		"javascript:",
		"onerror=",
		"onclick=",
		"onload=",
		"onmouseover=",
		"<iframe",
		"</iframe>",
	}

	lower := strings.ToLower(text)
	for _, pattern := range dangerous {
		if strings.Contains(lower, pattern) {
			return false
		}
	}
	return true
}

// PasswordStrengthError represents a password strength validation error.
type PasswordStrengthError struct {
	Message string
}

func (e PasswordStrengthError) Error() string {
	return e.Message
}

// ValidatePasswordStrength validates password meets security requirements.
func ValidatePasswordStrength(password string) error {
	if len(password) < 12 {
		return PasswordStrengthError{Message: "Password must be at least 12 characters long"}
	}

	var hasUpper, hasLower, hasDigit, hasSpecial bool
	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsDigit(char):
			hasDigit = true
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			hasSpecial = true
		}
	}

	if !hasUpper {
		return PasswordStrengthError{Message: "Password must contain at least one uppercase letter"}
	}
	if !hasLower {
		return PasswordStrengthError{Message: "Password must contain at least one lowercase letter"}
	}
	if !hasDigit {
		return PasswordStrengthError{Message: "Password must contain at least one digit"}
	}
	if !hasSpecial {
		return PasswordStrengthError{Message: "Password must contain at least one special character"}
	}

	// Check for common weak patterns
	commonPatterns := []string{
		"password", "123456", "qwerty", "abc123", "letmein",
		"welcome", "admin", "login", "passw0rd", "master",
	}

	lower := strings.ToLower(password)
	for _, pattern := range commonPatterns {
		if strings.Contains(lower, pattern) {
			return PasswordStrengthError{Message: "Password contains a common weak pattern"}
		}
	}

	return nil
}

// ValidateEmail validates an email address format.
func ValidateEmail(email string) bool {
	return emailRegex.MatchString(email)
}

// ValidateDomain validates a domain name format.
func ValidateDomain(domain string) bool {
	return domainRegex.MatchString(domain)
}

// ExtractDomain extracts the domain part from an email address.
func ExtractDomain(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return ""
	}
	return strings.ToLower(parts[1])
}

// ExtractLocalPart extracts the local part from an email address.
func ExtractLocalPart(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return ""
	}
	return parts[0]
}

// NormalizeEmail normalizes an email address.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// SanitizeDisplayName sanitizes a display name.
func SanitizeDisplayName(name string) string {
	// Remove leading/trailing whitespace
	name = strings.TrimSpace(name)

	// Remove control characters
	var result strings.Builder
	for _, r := range name {
		if !unicode.IsControl(r) {
			result.WriteRune(r)
		}
	}

	return result.String()
}
