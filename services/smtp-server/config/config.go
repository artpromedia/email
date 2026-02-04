package config

import (
	"os"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

// Config holds all SMTP server configuration
type Config struct {
	Server    ServerConfig    `yaml:"server"`
	Database  DatabaseConfig  `yaml:"database"`
	Redis     RedisConfig     `yaml:"redis"`
	Queue     QueueConfig     `yaml:"queue"`
	DKIM      DKIMConfig      `yaml:"dkim"`
	TLS       TLSConfig       `yaml:"tls"`
	Limits    LimitsConfig    `yaml:"limits"`
	Metrics   MetricsConfig   `yaml:"metrics"`
	Logging   LoggingConfig   `yaml:"logging"`
	Scanner   ScannerConfig   `yaml:"scanner"`
}

// ServerConfig holds SMTP server settings
type ServerConfig struct {
	Host              string        `yaml:"host"`
	Port              int           `yaml:"port"`
	SubmissionPort    int           `yaml:"submission_port"`
	Hostname          string        `yaml:"hostname"`
	Banner            string        `yaml:"banner"`
	ReadTimeout       time.Duration `yaml:"read_timeout"`
	WriteTimeout      time.Duration `yaml:"write_timeout"`
	MaxRecipients     int           `yaml:"max_recipients"`
	MaxMessageSize    int64         `yaml:"max_message_size"`
	MaxConnections    int           `yaml:"max_connections"`
	RequireAuth       bool          `yaml:"require_auth"`
	AllowInsecureAuth bool          `yaml:"allow_insecure_auth"`
}

// DatabaseConfig holds PostgreSQL settings
type DatabaseConfig struct {
	Host            string        `yaml:"host"`
	Port            int           `yaml:"port"`
	User            string        `yaml:"user"`
	Password        string        `yaml:"password"`
	Database        string        `yaml:"database"`
	SSLMode         string        `yaml:"ssl_mode"`
	MaxOpenConns    int           `yaml:"max_open_conns"`
	MaxIdleConns    int           `yaml:"max_idle_conns"`
	ConnMaxLifetime time.Duration `yaml:"conn_max_lifetime"`
	ConnMaxIdleTime time.Duration `yaml:"conn_max_idle_time"`
}

// RedisConfig holds Redis settings
type RedisConfig struct {
	Host         string        `yaml:"host"`
	Port         int           `yaml:"port"`
	Password     string        `yaml:"password"`
	DB           int           `yaml:"db"`
	PoolSize     int           `yaml:"pool_size"`
	ReadTimeout  time.Duration `yaml:"read_timeout"`
	WriteTimeout time.Duration `yaml:"write_timeout"`
}

// QueueConfig holds queue settings
type QueueConfig struct {
	Workers            int           `yaml:"workers"`
	BatchSize          int           `yaml:"batch_size"`
	RetryAttempts      int           `yaml:"retry_attempts"`
	RetryDelay         time.Duration `yaml:"retry_delay"`
	MaxRetryDelay      time.Duration `yaml:"max_retry_delay"`
	ProcessingTimeout  time.Duration `yaml:"processing_timeout"`
	CleanupInterval    time.Duration `yaml:"cleanup_interval"`
	StaleMessageAge    time.Duration `yaml:"stale_message_age"`
}

// DKIMConfig holds DKIM settings
type DKIMConfig struct {
	KeysPath       string        `yaml:"keys_path"`
	DefaultSelector string       `yaml:"default_selector"`
	CacheTTL       time.Duration `yaml:"cache_ttl"`
}

// TLSConfig holds TLS settings
type TLSConfig struct {
	Enabled     bool   `yaml:"enabled"`
	CertFile    string `yaml:"cert_file"`
	KeyFile     string `yaml:"key_file"`
	MinVersion  string `yaml:"min_version"`
	RequireTLS  bool   `yaml:"require_tls"`
}

// LimitsConfig holds rate limiting settings
type LimitsConfig struct {
	ConnectionsPerIP    int           `yaml:"connections_per_ip"`
	MessagesPerHour     int           `yaml:"messages_per_hour"`
	MessagesPerDay      int           `yaml:"messages_per_day"`
	RecipientsPerMessage int          `yaml:"recipients_per_message"`
	RateLimitWindow     time.Duration `yaml:"rate_limit_window"`
}

// MetricsConfig holds Prometheus metrics settings
type MetricsConfig struct {
	Enabled bool   `yaml:"enabled"`
	Host    string `yaml:"host"`
	Port    int    `yaml:"port"`
	Path    string `yaml:"path"`
}

// LoggingConfig holds logging settings
type LoggingConfig struct {
	Level      string `yaml:"level"`
	Format     string `yaml:"format"`
	Output     string `yaml:"output"`
}

// ScannerConfig holds virus scanner (ClamAV) settings
type ScannerConfig struct {
	Enabled        bool          `yaml:"enabled"`
	Address        string        `yaml:"address"`         // clamd socket: unix:/var/run/clamav/clamd.sock or tcp://127.0.0.1:3310
	ConnectionPool int           `yaml:"connection_pool"` // number of pooled connections
	Timeout        time.Duration `yaml:"timeout"`         // scan timeout
	MaxSize        int64         `yaml:"max_size"`        // max message size to scan (bytes)
	ScanOnReceive  bool          `yaml:"scan_on_receive"` // scan incoming messages
	ScanOnDelivery bool          `yaml:"scan_on_delivery"` // scan before delivery
	RejectInfected bool          `yaml:"reject_infected"` // reject infected messages
	QuarantineDir  string        `yaml:"quarantine_dir"`  // directory for quarantined messages
}

// Load loads configuration from file or environment
func Load(path string) (*Config, error) {
	cfg := DefaultConfig()

	// Load from file if exists
	if path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			if !os.IsNotExist(err) {
				return nil, err
			}
		} else {
			if err := yaml.Unmarshal(data, cfg); err != nil {
				return nil, err
			}
		}
	}

	// Override with environment variables
	cfg.loadFromEnv()

	return cfg, nil
}

// DefaultConfig returns default configuration
func DefaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			Host:              "0.0.0.0",
			Port:              25,
			SubmissionPort:    587,
			Hostname:          "mail.example.com",
		Banner:            "OONRUMAIL SMTP Server",
			ReadTimeout:       60 * time.Second,
			WriteTimeout:      60 * time.Second,
			MaxRecipients:     100,
			MaxMessageSize:    26214400, // 25MB - aligned with database defaults and industry standard
			MaxConnections:    1000,
			RequireAuth:       false,
			AllowInsecureAuth: false,
		},
		Database: DatabaseConfig{
			Host:            "localhost",
			Port:            5432,
			User:            "smtp",
			Password:        "",
		Database:        "oonrumail",
			SSLMode:         "prefer",
			MaxOpenConns:    25,
			MaxIdleConns:    5,
			ConnMaxLifetime: 30 * time.Minute,
			ConnMaxIdleTime: 5 * time.Minute,
		},
		Redis: RedisConfig{
			Host:         "localhost",
			Port:         6379,
			Password:     "",
			DB:           0,
			PoolSize:     10,
			ReadTimeout:  3 * time.Second,
			WriteTimeout: 3 * time.Second,
		},
		Queue: QueueConfig{
			Workers:           10,
			BatchSize:         100,
			RetryAttempts:     5,
			RetryDelay:        5 * time.Minute,
			MaxRetryDelay:     6 * time.Hour,
			ProcessingTimeout: 5 * time.Minute,
			CleanupInterval:   1 * time.Hour,
			StaleMessageAge:   7 * 24 * time.Hour,
		},
		DKIM: DKIMConfig{
			KeysPath:        "/etc/smtp/dkim",
			DefaultSelector: "mail",
			CacheTTL:        1 * time.Hour,
		},
		TLS: TLSConfig{
			Enabled:    true,
			CertFile:   "/etc/smtp/tls/cert.pem",
			KeyFile:    "/etc/smtp/tls/key.pem",
			MinVersion: "1.2",
			RequireTLS: false,
		},
		Limits: LimitsConfig{
			ConnectionsPerIP:     10,
			MessagesPerHour:      1000,
			MessagesPerDay:       10000,
			RecipientsPerMessage: 100,
			RateLimitWindow:      1 * time.Hour,
		},
		Metrics: MetricsConfig{
			Enabled: true,
			Host:    "0.0.0.0",
			Port:    9090,
			Path:    "/metrics",
		},
		Logging: LoggingConfig{
			Level:  "info",
			Format: "json",
			Output: "stdout",
		},
		Scanner: ScannerConfig{
			Enabled:        false, // Disabled by default
			Address:        "unix:/var/run/clamav/clamd.sock",
			ConnectionPool: 5,
			Timeout:        30 * time.Second,
			MaxSize:        26214400, // 25MB
			ScanOnReceive:  true,
			ScanOnDelivery: false,
			RejectInfected: true,
			QuarantineDir:  "/var/quarantine/mail",
		},
	}
}

// loadFromEnv overrides config with environment variables
func (c *Config) loadFromEnv() {
	// Server
	if v := os.Getenv("SMTP_HOST"); v != "" {
		c.Server.Host = v
	}
	if v := os.Getenv("SMTP_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			c.Server.Port = port
		}
	}
	if v := os.Getenv("SMTP_SUBMISSION_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			c.Server.SubmissionPort = port
		}
	}
	if v := os.Getenv("SMTP_HOSTNAME"); v != "" {
		c.Server.Hostname = v
	}
	if v := os.Getenv("SMTP_MAX_MESSAGE_SIZE"); v != "" {
		if size, err := strconv.ParseInt(v, 10, 64); err == nil {
			c.Server.MaxMessageSize = size
		}
	}

	// Database
	if v := os.Getenv("DB_HOST"); v != "" {
		c.Database.Host = v
	}
	if v := os.Getenv("DB_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			c.Database.Port = port
		}
	}
	if v := os.Getenv("DB_USER"); v != "" {
		c.Database.User = v
	}
	if v := os.Getenv("DB_PASSWORD"); v != "" {
		c.Database.Password = v
	}
	if v := os.Getenv("DB_NAME"); v != "" {
		c.Database.Database = v
	}
	if v := os.Getenv("DB_SSL_MODE"); v != "" {
		c.Database.SSLMode = v
	}

	// Redis
	if v := os.Getenv("REDIS_HOST"); v != "" {
		c.Redis.Host = v
	}
	if v := os.Getenv("REDIS_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			c.Redis.Port = port
		}
	}
	if v := os.Getenv("REDIS_PASSWORD"); v != "" {
		c.Redis.Password = v
	}

	// DKIM
	if v := os.Getenv("DKIM_KEYS_PATH"); v != "" {
		c.DKIM.KeysPath = v
	}
	if v := os.Getenv("DKIM_DEFAULT_SELECTOR"); v != "" {
		c.DKIM.DefaultSelector = v
	}

	// TLS
	if v := os.Getenv("TLS_ENABLED"); v != "" {
		c.TLS.Enabled = v == "true" || v == "1"
	}
	if v := os.Getenv("TLS_CERT_FILE"); v != "" {
		c.TLS.CertFile = v
	}
	if v := os.Getenv("TLS_KEY_FILE"); v != "" {
		c.TLS.KeyFile = v
	}

	// Metrics
	if v := os.Getenv("METRICS_ENABLED"); v != "" {
		c.Metrics.Enabled = v == "true" || v == "1"
	}
	if v := os.Getenv("METRICS_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			c.Metrics.Port = port
		}
	}

	// Logging
	if v := os.Getenv("LOG_LEVEL"); v != "" {
		c.Logging.Level = v
	}
	if v := os.Getenv("LOG_FORMAT"); v != "" {
		c.Logging.Format = v
	}
}

// DSN returns PostgreSQL connection string
func (c *DatabaseConfig) DSN() string {
	return "postgres://" + c.User + ":" + c.Password + "@" +
		c.Host + ":" + strconv.Itoa(c.Port) + "/" + c.Database +
		"?sslmode=" + c.SSLMode
}

// RedisAddr returns Redis address
func (c *RedisConfig) Addr() string {
	return c.Host + ":" + strconv.Itoa(c.Port)
}
