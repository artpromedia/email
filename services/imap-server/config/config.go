package config

import (
	"fmt"
	"os"
	"regexp"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

// Config represents the application configuration
type Config struct {
	Server   ServerConfig   `yaml:"server"`
	TLS      TLSConfig      `yaml:"tls"`
	Database DatabaseConfig `yaml:"database"`
	Redis    RedisConfig    `yaml:"redis"`
	Storage  StorageConfig  `yaml:"storage"`
	Auth     AuthConfig     `yaml:"auth"`
	IMAP     IMAPConfig     `yaml:"imap"`
	Metrics  MetricsConfig  `yaml:"metrics"`
}

// ServerConfig contains server settings
type ServerConfig struct {
	Host            string        `yaml:"host"`
	Port            int           `yaml:"port"`
	TLSPort         int           `yaml:"tls_port"`
	MaxConnections  int           `yaml:"max_connections"`
	ConnectionLimit int           `yaml:"connection_limit_per_ip"`
	ReadTimeout     time.Duration `yaml:"read_timeout"`
	WriteTimeout    time.Duration `yaml:"write_timeout"`
	IdleTimeout     time.Duration `yaml:"idle_timeout"`
}

// TLSConfig contains TLS settings
type TLSConfig struct {
	Enabled     bool   `yaml:"enabled"`
	CertFile    string `yaml:"cert_file"`
	KeyFile     string `yaml:"key_file"`
	MinVersion  string `yaml:"min_version"`
	StartTLS    bool   `yaml:"starttls"`
	RequireTLS  bool   `yaml:"require_tls"`
}

// DatabaseConfig contains database settings
type DatabaseConfig struct {
	Host           string        `yaml:"host"`
	Port           int           `yaml:"port"`
	Database       string        `yaml:"database"`
	Username       string        `yaml:"username"`
	Password       string        `yaml:"password"`
	SSLMode        string        `yaml:"ssl_mode"`
	MaxConnections int           `yaml:"max_connections"`
	MinConnections int           `yaml:"min_connections"`
	MaxLifetime    time.Duration `yaml:"max_lifetime"`
	IdleTimeout    time.Duration `yaml:"idle_timeout"`
}

// RedisConfig contains Redis settings
type RedisConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
	PoolSize int    `yaml:"pool_size"`
}

// StorageConfig contains mail storage settings
type StorageConfig struct {
	Type      string `yaml:"type"` // file, s3
	BasePath  string `yaml:"base_path"`
	S3Bucket  string `yaml:"s3_bucket"`
	S3Region  string `yaml:"s3_region"`
	S3Prefix  string `yaml:"s3_prefix"`
}

// AuthConfig contains authentication settings
type AuthConfig struct {
	Methods           []string      `yaml:"methods"` // PLAIN, LOGIN, CRAM-MD5
	MaxLoginAttempts  int           `yaml:"max_login_attempts"`
	LockoutDuration   time.Duration `yaml:"lockout_duration"`
	SessionTimeout    time.Duration `yaml:"session_timeout"`
	RequireEncryption bool          `yaml:"require_encryption"`
}

// IMAPConfig contains IMAP-specific settings
type IMAPConfig struct {
	Capabilities          []string `yaml:"capabilities"`
	LiteralPlus           bool     `yaml:"literal_plus"`
	DefaultNamespaceMode  string   `yaml:"default_namespace_mode"` // unified, domain_separated
	MaxMessageSize        int64    `yaml:"max_message_size"`
	MaxFetchSize          int64    `yaml:"max_fetch_size"`
	IdleTimeout           time.Duration `yaml:"idle_timeout"`
	IdleNotifyInterval    time.Duration `yaml:"idle_notify_interval"`
	EnableCompression     bool     `yaml:"enable_compression"`
	EnableQRESYNC         bool     `yaml:"enable_qresync"`
	EnableCONDSTORE       bool     `yaml:"enable_condstore"`
}

// MetricsConfig contains metrics settings
type MetricsConfig struct {
	Enabled bool `yaml:"enabled"`
	Port    int  `yaml:"port"`
}

// LoadConfig loads configuration from a YAML file
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}

	// Expand environment variables
	data = []byte(expandEnvVars(string(data)))

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config file: %w", err)
	}

	applyDefaults(&cfg)

	return &cfg, nil
}

// expandEnvVars expands environment variables in the format ${VAR} or ${VAR:default}
func expandEnvVars(s string) string {
	re := regexp.MustCompile(`\$\{([^}:]+)(?::([^}]*))?\}`)
	return re.ReplaceAllStringFunc(s, func(match string) string {
		parts := re.FindStringSubmatch(match)
		if len(parts) < 2 {
			return match
		}
		envVar := parts[1]
		defaultVal := ""
		if len(parts) > 2 {
			defaultVal = parts[2]
		}
		if val := os.Getenv(envVar); val != "" {
			return val
		}
		return defaultVal
	})
}

// applyDefaults sets default values for configuration
func applyDefaults(cfg *Config) {
	// Server defaults
	if cfg.Server.Host == "" {
		cfg.Server.Host = "0.0.0.0"
	}
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 143
	}
	if cfg.Server.TLSPort == 0 {
		cfg.Server.TLSPort = 993
	}
	if cfg.Server.MaxConnections == 0 {
		cfg.Server.MaxConnections = 10000
	}
	if cfg.Server.ConnectionLimit == 0 {
		cfg.Server.ConnectionLimit = 50
	}
	if cfg.Server.ReadTimeout == 0 {
		cfg.Server.ReadTimeout = 30 * time.Minute
	}
	if cfg.Server.WriteTimeout == 0 {
		cfg.Server.WriteTimeout = 30 * time.Minute
	}
	if cfg.Server.IdleTimeout == 0 {
		cfg.Server.IdleTimeout = 30 * time.Minute
	}

	// Database defaults
	if cfg.Database.Host == "" {
		cfg.Database.Host = "localhost"
	}
	if cfg.Database.Port == 0 {
		cfg.Database.Port = 5432
	}
	if cfg.Database.SSLMode == "" {
		cfg.Database.SSLMode = "disable"
	}
	if cfg.Database.MaxConnections == 0 {
		cfg.Database.MaxConnections = 25
	}
	if cfg.Database.MinConnections == 0 {
		cfg.Database.MinConnections = 5
	}

	// Redis defaults
	if cfg.Redis.Host == "" {
		cfg.Redis.Host = "localhost"
	}
	if cfg.Redis.Port == 0 {
		cfg.Redis.Port = 6379
	}
	if cfg.Redis.PoolSize == 0 {
		cfg.Redis.PoolSize = 10
	}

	// Auth defaults
	if len(cfg.Auth.Methods) == 0 {
		cfg.Auth.Methods = []string{"PLAIN", "LOGIN"}
	}
	if cfg.Auth.MaxLoginAttempts == 0 {
		cfg.Auth.MaxLoginAttempts = 5
	}
	if cfg.Auth.LockoutDuration == 0 {
		cfg.Auth.LockoutDuration = 15 * time.Minute
	}
	if cfg.Auth.SessionTimeout == 0 {
		cfg.Auth.SessionTimeout = 30 * time.Minute
	}

	// IMAP defaults
	if len(cfg.IMAP.Capabilities) == 0 {
		cfg.IMAP.Capabilities = []string{
			"IMAP4rev1",
			"NAMESPACE",
			"QUOTA",
			"IDLE",
			"SPECIAL-USE",
			"MOVE",
			"LITERAL+",
			"UIDPLUS",
			"UNSELECT",
			"CHILDREN",
			"LIST-EXTENDED",
			"LIST-STATUS",
		}
	}
	if cfg.IMAP.DefaultNamespaceMode == "" {
		cfg.IMAP.DefaultNamespaceMode = "unified"
	}
	if cfg.IMAP.MaxMessageSize == 0 {
		cfg.IMAP.MaxMessageSize = 50 * 1024 * 1024 // 50MB
	}
	if cfg.IMAP.MaxFetchSize == 0 {
		cfg.IMAP.MaxFetchSize = 10 * 1024 * 1024 // 10MB
	}
	if cfg.IMAP.IdleTimeout == 0 {
		cfg.IMAP.IdleTimeout = 30 * time.Minute
	}
	if cfg.IMAP.IdleNotifyInterval == 0 {
		cfg.IMAP.IdleNotifyInterval = 5 * time.Second
	}

	// Storage defaults
	if cfg.Storage.Type == "" {
		cfg.Storage.Type = "file"
	}
	if cfg.Storage.BasePath == "" {
		cfg.Storage.BasePath = "/var/mail"
	}

	// Metrics defaults
	if cfg.Metrics.Port == 0 {
		cfg.Metrics.Port = 9090
	}
}

// GetDSN returns the database connection string
func (c *DatabaseConfig) GetDSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		c.Username, c.Password, c.Host, c.Port, c.Database, c.SSLMode)
}

// GetRedisAddr returns the Redis address
func (c *RedisConfig) GetRedisAddr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// ParseEnvInt parses an integer from environment variable
func ParseEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return defaultVal
}
