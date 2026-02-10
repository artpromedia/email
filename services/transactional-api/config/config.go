package config

import (
	"fmt"
	"os"
	"regexp"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server    ServerConfig    `yaml:"server"`
	Database  DatabaseConfig  `yaml:"database"`
	Redis     RedisConfig     `yaml:"redis"`
	SMTP      SMTPConfig      `yaml:"smtp"`
	RateLimit RateLimitConfig `yaml:"rateLimit"`
	Tracking  TrackingConfig  `yaml:"tracking"`
	Webhook   WebhookConfig   `yaml:"webhook"`
}

type ServerConfig struct {
	Addr           string   `yaml:"addr"`
	LogLevel       string   `yaml:"logLevel"`
	AllowedOrigins []string `yaml:"allowedOrigins"`
}

type DatabaseConfig struct {
	URL      string `yaml:"url"`
	MaxConns int    `yaml:"maxConns"`
	MinConns int    `yaml:"minConns"`
}

type RedisConfig struct {
	Addr     string `yaml:"addr"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
}

type SMTPConfig struct {
	Host               string `yaml:"host"`
	Port               int    `yaml:"port"`
	TLS                bool   `yaml:"tls"`
	InsecureSkipVerify bool   `yaml:"insecureSkipVerify"`
	Username           string `yaml:"username"`
	Password           string `yaml:"password"`
	FromDomain         string `yaml:"fromDomain"`
	PoolSize           int    `yaml:"poolSize"`
	RetryCount         int    `yaml:"retryCount"`
}

type RateLimitConfig struct {
	RequestsPerSecond int `yaml:"requestsPerSecond"`
	RequestsPerMinute int `yaml:"requestsPerMinute"`
	RequestsPerHour   int `yaml:"requestsPerHour"`
	RequestsPerDay    int `yaml:"requestsPerDay"`
	BurstSize         int `yaml:"burstSize"`
}

type TrackingConfig struct {
	EnableOpen   bool   `yaml:"enableOpen"`
	EnableClick  bool   `yaml:"enableClick"`
	TrackingHost string `yaml:"trackingHost"`
	PixelPath    string `yaml:"pixelPath"`
	ClickPath    string `yaml:"clickPath"`
}

type WebhookConfig struct {
	Timeout        int    `yaml:"timeout"`
	MaxRetries     int    `yaml:"maxRetries"`
	RetryInterval  int    `yaml:"retryInterval"`
	SigningSecret  string `yaml:"signingSecret"`
	WorkerPoolSize int    `yaml:"workerPoolSize"`
}

// expandEnvWithDefaults expands environment variables with default value support
// Supports both ${VAR} and ${VAR:-default} syntax
func expandEnvWithDefaults(s string) string {
	// Regex to match ${VAR:-default} pattern
	re := regexp.MustCompile(`\$\{([^}:]+):-([^}]*)\}`)
	result := re.ReplaceAllStringFunc(s, func(match string) string {
		// Extract variable name and default value
		parts := re.FindStringSubmatch(match)
		if len(parts) != 3 {
			return match
		}
		envVar := parts[1]
		defaultVal := parts[2]
		if val := os.Getenv(envVar); val != "" {
			return val
		}
		return defaultVal
	})
	// Also expand simple ${VAR} patterns
	return os.ExpandEnv(result)
}

func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}

	// Expand environment variables with defaults support
	data = []byte(expandEnvWithDefaults(string(data)))

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	// Set defaults
	if cfg.Server.Addr == "" {
		cfg.Server.Addr = ":8080"
	}
	if cfg.Server.LogLevel == "" {
		cfg.Server.LogLevel = "info"
	}
	if cfg.Database.MaxConns == 0 {
		cfg.Database.MaxConns = 25
	}
	if cfg.Database.MinConns == 0 {
		cfg.Database.MinConns = 5
	}
	if cfg.SMTP.PoolSize == 0 {
		cfg.SMTP.PoolSize = 10
	}
	if cfg.SMTP.RetryCount == 0 {
		cfg.SMTP.RetryCount = 3
	}
	if cfg.RateLimit.RequestsPerSecond == 0 {
		cfg.RateLimit.RequestsPerSecond = 100
	}
	if cfg.RateLimit.RequestsPerMinute == 0 {
		cfg.RateLimit.RequestsPerMinute = 1000
	}
	if cfg.RateLimit.RequestsPerHour == 0 {
		cfg.RateLimit.RequestsPerHour = 10000
	}
	if cfg.RateLimit.BurstSize == 0 {
		cfg.RateLimit.BurstSize = 50
	}
	if cfg.Webhook.Timeout == 0 {
		cfg.Webhook.Timeout = 30
	}
	if cfg.Webhook.MaxRetries == 0 {
		cfg.Webhook.MaxRetries = 5
	}
	if cfg.Webhook.RetryInterval == 0 {
		cfg.Webhook.RetryInterval = 60
	}
	if cfg.Webhook.WorkerPoolSize == 0 {
		cfg.Webhook.WorkerPoolSize = 10
	}

	return &cfg, nil
}
