// Package config provides application configuration management.
package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the auth service.
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
	JWT      JWTConfig
	Security SecurityConfig
	SSO      SSOConfig
	Email    EmailConfig
}

// ServerConfig holds HTTP server configuration.
type ServerConfig struct {
	Host            string
	Port            int
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	ShutdownTimeout time.Duration
	TrustedProxies  []string
}

// DatabaseConfig holds PostgreSQL configuration.
type DatabaseConfig struct {
	Host         string
	Port         int
	User         string
	Password     string
	Database     string
	SSLMode      string
	MaxOpenConns int
	MaxIdleConns int
	MaxLifetime  time.Duration
}

// RedisConfig holds Redis configuration.
type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
}

// JWTConfig holds JWT configuration.
type JWTConfig struct {
	SecretKey          string
	AccessTokenExpiry  time.Duration
	RefreshTokenExpiry time.Duration
	Issuer             string
	Audience           string
}

// SecurityConfig holds security-related configuration.
type SecurityConfig struct {
	BcryptCost           int
	MaxLoginAttempts     int
	LockoutDuration      time.Duration
	SessionTimeout       time.Duration
	CSRFSecret           string
	AllowedOrigins       []string
	RateLimitRequests    int
	RateLimitWindow      time.Duration
	PasswordMinLength    int
	RequireEmailVerify   bool
	MFAIssuer            string
}

// SSOConfig holds SSO-related configuration.
type SSOConfig struct {
	BaseURL            string
	SAMLCertPath       string
	SAMLKeyPath        string
	OIDCCallbackPath   string
	SAMLCallbackPath   string
	DefaultRedirectURL string
}

// EmailConfig holds email service configuration.
type EmailConfig struct {
	SMTPHost        string
	SMTPPort        int
	SMTPUser        string
	SMTPPassword    string
	FromAddress     string
	FromName        string
	VerificationURL string
}

// Load creates a Config from environment variables.
func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Host:            getEnv("SERVER_HOST", "0.0.0.0"),
			Port:            getEnvInt("SERVER_PORT", 8080),
			ReadTimeout:     getEnvDuration("SERVER_READ_TIMEOUT", 30*time.Second),
			WriteTimeout:    getEnvDuration("SERVER_WRITE_TIMEOUT", 30*time.Second),
			ShutdownTimeout: getEnvDuration("SERVER_SHUTDOWN_TIMEOUT", 10*time.Second),
			TrustedProxies:  getEnvSlice("SERVER_TRUSTED_PROXIES", []string{}),
		},
		Database: DatabaseConfig{
			Host:         getEnv("DATABASE_HOST", "localhost"),
			Port:         getEnvInt("DATABASE_PORT", 5432),
			User:         getEnv("DATABASE_USER", "postgres"),
			Password:     getEnv("DATABASE_PASSWORD", ""),
			Database:     getEnv("DATABASE_NAME", "email"),
			SSLMode:      getEnv("DATABASE_SSL_MODE", "require"), // Default to require - prefer allows downgrade attacks
			MaxOpenConns: getEnvInt("DATABASE_MAX_OPEN_CONNS", 25),
			MaxIdleConns: getEnvInt("DATABASE_MAX_IDLE_CONNS", 5),
			MaxLifetime:  getEnvDuration("DATABASE_MAX_LIFETIME", 5*time.Minute),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnvInt("REDIS_PORT", 6379),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getEnvInt("REDIS_DB", 0),
		},
		JWT: JWTConfig{
			SecretKey:          getEnv("JWT_SECRET_KEY", ""),
			AccessTokenExpiry:  getEnvDuration("JWT_ACCESS_EXPIRY", 15*time.Minute),
			RefreshTokenExpiry: getEnvDuration("JWT_REFRESH_EXPIRY", 7*24*time.Hour),
			Issuer:             getEnv("JWT_ISSUER", "auth-service"),
			Audience:           getEnv("JWT_AUDIENCE", "email-platform"),
		},
		Security: SecurityConfig{
			BcryptCost:         getEnvInt("BCRYPT_COST", 12),
			MaxLoginAttempts:   getEnvInt("MAX_LOGIN_ATTEMPTS", 5),
			LockoutDuration:    getEnvDuration("LOCKOUT_DURATION", 15*time.Minute),
			SessionTimeout:     getEnvDuration("SESSION_TIMEOUT", 8*time.Hour),
			CSRFSecret:         getEnv("CSRF_SECRET", ""),
			AllowedOrigins:     getEnvSlice("ALLOWED_ORIGINS", []string{"http://localhost:3000"}),
			RateLimitRequests:  getEnvInt("RATE_LIMIT_REQUESTS", 100),
			RateLimitWindow:    getEnvDuration("RATE_LIMIT_WINDOW", time.Minute),
			PasswordMinLength:  getEnvInt("PASSWORD_MIN_LENGTH", 12),
			RequireEmailVerify: getEnvBool("REQUIRE_EMAIL_VERIFY", true),
			MFAIssuer:          getEnv("MFA_ISSUER", "Enterprise Email"),
		},
		SSO: SSOConfig{
			BaseURL:            getEnv("SSO_BASE_URL", "http://localhost:8080"),
			SAMLCertPath:       getEnv("SAML_CERT_PATH", ""),
			SAMLKeyPath:        getEnv("SAML_KEY_PATH", ""),
			OIDCCallbackPath:   getEnv("OIDC_CALLBACK_PATH", "/api/auth/sso/oidc/callback"),
			SAMLCallbackPath:   getEnv("SAML_CALLBACK_PATH", "/api/auth/sso/saml/callback"),
			DefaultRedirectURL: getEnv("SSO_DEFAULT_REDIRECT", "http://localhost:3000/dashboard"),
		},
		Email: EmailConfig{
			SMTPHost:        getEnv("SMTP_HOST", "localhost"),
			SMTPPort:        getEnvInt("SMTP_PORT", 587),
			SMTPUser:        getEnv("SMTP_USER", ""),
			SMTPPassword:    getEnv("SMTP_PASSWORD", ""),
			FromAddress:     getEnv("EMAIL_FROM_ADDRESS", "noreply@example.com"),
			FromName:        getEnv("EMAIL_FROM_NAME", "Enterprise Email"),
			VerificationURL: getEnv("EMAIL_VERIFICATION_URL", "http://localhost:3000/verify"),
		},
	}
}

// Helper functions for environment variable parsing

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolVal, err := strconv.ParseBool(value); err == nil {
			return boolVal
		}
	}
	return defaultValue
}

func getEnvDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

func getEnvSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		// Simple comma-separated parsing
		var result []string
		current := ""
		for _, char := range value {
			if char == ',' {
				if current != "" {
					result = append(result, current)
				}
				current = ""
			} else {
				current += string(char)
			}
		}
		if current != "" {
			result = append(result, current)
		}
		return result
	}
	return defaultValue
}
