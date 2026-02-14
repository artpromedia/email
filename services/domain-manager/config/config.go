package config

import (
	"fmt"
	"os"
	"regexp"
	"time"

	"gopkg.in/yaml.v3"
)

// expandEnvWithDefaults expands environment variables with support for ${VAR:-default} syntax
func expandEnvWithDefaults(s string) string {
	// Pattern to match ${VAR:-default} syntax
	re := regexp.MustCompile(`\$\{([^}:]+)(:-([^}]*))?\}`)
	return re.ReplaceAllStringFunc(s, func(match string) string {
		// Parse the match
		submatch := re.FindStringSubmatch(match)
		if len(submatch) < 2 {
			return match
		}
		varName := submatch[1]
		defaultValue := ""
		if len(submatch) >= 4 {
			defaultValue = submatch[3]
		}

		// Get environment variable
		if value, exists := os.LookupEnv(varName); exists {
			return value
		}
		return defaultValue
	})
}

// Config holds all configuration for the domain manager service
type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Redis    RedisConfig    `yaml:"redis"`
	DNS      DNSConfig      `yaml:"dns"`
	DKIM     DKIMConfig     `yaml:"dkim"`
	Branding BrandingConfig `yaml:"branding"`
	Monitor  MonitorConfig  `yaml:"monitor"`
	Metrics  MetricsConfig  `yaml:"metrics"`
}

// ServerConfig holds HTTP server settings
type ServerConfig struct {
	Addr            string        `yaml:"addr"`
	Port            int           `yaml:"port"`
	ReadTimeout     time.Duration `yaml:"read_timeout"`
	WriteTimeout    time.Duration `yaml:"write_timeout"`
	IdleTimeout     time.Duration `yaml:"idle_timeout"`
	ShutdownTimeout time.Duration `yaml:"shutdown_timeout"`
	LogLevel        string        `yaml:"log_level"`
	AllowedOrigins  []string      `yaml:"allowed_origins"`
}

// DatabaseConfig holds database connection settings
type DatabaseConfig struct {
	Host            string        `yaml:"host"`
	Port            int           `yaml:"port"`
	Name            string        `yaml:"name"`
	User            string        `yaml:"user"`
	Password        string        `yaml:"password"`
	SSLMode         string        `yaml:"ssl_mode"`
	MaxConns        int           `yaml:"max_conns"`
	MinConns        int           `yaml:"min_conns"`
	MaxConnLifetime time.Duration `yaml:"max_conn_lifetime"`
	MaxConnIdleTime time.Duration `yaml:"max_conn_idle_time"`
}

func (c DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%d dbname=%s user=%s password=%s sslmode=%s",
		c.Host, c.Port, c.Name, c.User, c.Password, c.SSLMode,
	)
}

// RedisConfig holds Redis connection settings
type RedisConfig struct {
	Addr     string `yaml:"addr"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
}

// DNSConfig holds DNS verification settings
type DNSConfig struct {
	VerificationPrefix  string        `yaml:"verification_prefix"`
	MXHost              string        `yaml:"mx_host"`
	MXPriority          int           `yaml:"mx_priority"`
	SPFInclude          string        `yaml:"spf_include"`
	SPFRecord           string        `yaml:"spf_record"`
	DMARCReportEmail    string        `yaml:"dmarc_report_email"`
	DefaultDKIMSelector string        `yaml:"default_dkim_selector"`
	LookupTimeout       time.Duration `yaml:"lookup_timeout"`
	PropagationDelay    time.Duration `yaml:"propagation_delay"`
}

// DKIMConfig holds DKIM key generation settings
type DKIMConfig struct {
	DefaultKeySize   int    `yaml:"default_key_size"`
	DefaultAlgorithm string `yaml:"default_algorithm"`
	EncryptionKey    string `yaml:"encryption_key"`
}

// BrandingConfig holds branding settings
type BrandingConfig struct {
	DefaultLogoURL    string `yaml:"default_logo_url"`
	DefaultFaviconURL string `yaml:"default_favicon_url"`
	DefaultColor      string `yaml:"default_color"`
}

// MonitorConfig holds DNS monitoring settings
type MonitorConfig struct {
	Enabled       bool          `yaml:"enabled"`
	CheckInterval time.Duration `yaml:"check_interval"`
	AlertWebhook  string        `yaml:"alert_webhook"`
}

// MetricsConfig holds metrics server settings
type MetricsConfig struct {
	Enabled bool   `yaml:"enabled"`
	Addr    string `yaml:"addr"`
	Path    string `yaml:"path"`
}

// LoadConfig loads configuration from a YAML file
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}

	// Expand environment variables with default support
	expanded := expandEnvWithDefaults(string(data))

	var cfg Config
	if err := yaml.Unmarshal([]byte(expanded), &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	// Apply defaults
	applyDefaults(&cfg)

	return &cfg, nil
}

func applyDefaults(cfg *Config) {
	// Server defaults
	if cfg.Server.Addr == "" {
		cfg.Server.Addr = ":8080"
	}
	if cfg.Server.ReadTimeout == 0 {
		cfg.Server.ReadTimeout = 30 * time.Second
	}
	if cfg.Server.WriteTimeout == 0 {
		cfg.Server.WriteTimeout = 30 * time.Second
	}
	if cfg.Server.ShutdownTimeout == 0 {
		cfg.Server.ShutdownTimeout = 30 * time.Second
	}
	if cfg.Server.LogLevel == "" {
		cfg.Server.LogLevel = "info"
	}

	// Database defaults
	if cfg.Database.Host == "" {
		cfg.Database.Host = "localhost"
	}
	if cfg.Database.Port == 0 {
		cfg.Database.Port = 5432
	}
	if cfg.Database.MaxConns == 0 {
		cfg.Database.MaxConns = 25
	}
	if cfg.Database.MinConns == 0 {
		cfg.Database.MinConns = 5
	}
	if cfg.Database.MaxConnLifetime == 0 {
		cfg.Database.MaxConnLifetime = time.Hour
	}
	if cfg.Database.MaxConnIdleTime == 0 {
		cfg.Database.MaxConnIdleTime = 30 * time.Minute
	}
	if cfg.Database.SSLMode == "" {
		cfg.Database.SSLMode = "require"
	}

	// Redis defaults
	if cfg.Redis.Addr == "" {
		cfg.Redis.Addr = "localhost:6379"
	}

	// DNS defaults
	if cfg.DNS.VerificationPrefix == "" {
		cfg.DNS.VerificationPrefix = "_oonrumail-verify"
	}
	if cfg.DNS.MXHost == "" {
		cfg.DNS.MXHost = "mail.oonrumail.com"
	}
	if cfg.DNS.MXPriority == 0 {
		cfg.DNS.MXPriority = 10
	}
	if cfg.DNS.SPFInclude == "" && cfg.DNS.SPFRecord == "" {
		cfg.DNS.SPFRecord = "v=spf1 mx a -all"
	}
	if cfg.DNS.DMARCReportEmail == "" {
		cfg.DNS.DMARCReportEmail = "dmarc@oonrumail.com"
	}
	if cfg.DNS.DefaultDKIMSelector == "" {
		cfg.DNS.DefaultDKIMSelector = "mail"
	}
	if cfg.DNS.LookupTimeout == 0 {
		cfg.DNS.LookupTimeout = 10 * time.Second
	}
	if cfg.DNS.PropagationDelay == 0 {
		cfg.DNS.PropagationDelay = 5 * time.Minute
	}

	// DKIM defaults
	if cfg.DKIM.DefaultKeySize == 0 {
		cfg.DKIM.DefaultKeySize = 2048
	}
	if cfg.DKIM.DefaultAlgorithm == "" {
		cfg.DKIM.DefaultAlgorithm = "rsa-sha256"
	}

	// Branding defaults
	if cfg.Branding.DefaultColor == "" {
		cfg.Branding.DefaultColor = "#1a73e8"
	}

	// Monitor defaults
	if cfg.Monitor.CheckInterval == 0 {
		cfg.Monitor.CheckInterval = 1 * time.Hour
	}

	// Metrics defaults
	if cfg.Metrics.Addr == "" {
		cfg.Metrics.Addr = ":9090"
	}
	if cfg.Metrics.Path == "" {
		cfg.Metrics.Path = "/metrics"
	}
}
