package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the transactional API service
type Config struct {
	Server     ServerConfig
	Database   DatabaseConfig
	Redis      RedisConfig
	SMTP       SMTPConfig
	Tracking   TrackingConfig
	Webhook    WebhookConfig
	RateLimit  RateLimitConfig
	S3         S3Config
}

// ServerConfig holds HTTP server configuration
type ServerConfig struct {
	Port            string
	Environment     string
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	ShutdownTimeout time.Duration
	BaseURL         string
}

// DatabaseConfig holds PostgreSQL connection configuration
type DatabaseConfig struct {
	URL             string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
}

// RedisConfig holds Redis connection configuration
type RedisConfig struct {
	URL      string
	Password string
	DB       int
}

// SMTPConfig holds SMTP server configuration for sending emails
type SMTPConfig struct {
	Host       string
	Port       int
	Username   string
	Password   string
	FromDomain string
	UseTLS     bool
	QueueURL   string // Redis URL for queue
}

// TrackingConfig holds open/click tracking configuration
type TrackingConfig struct {
	Enabled      bool
	TrackingURL  string
	PixelPath    string
	RedirectPath string
}

// WebhookConfig holds webhook delivery configuration
type WebhookConfig struct {
	MaxRetries     int
	RetryInterval  time.Duration
	Timeout        time.Duration
	SignatureKey   string
	WorkerCount    int
}

// RateLimitConfig holds rate limiting configuration
type RateLimitConfig struct {
	RequestsPerMinute int
	RequestsPerDay    int
	BurstMultiplier   float64
}

// S3Config holds S3/MinIO configuration for template assets
type S3Config struct {
	Endpoint        string
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	Region          string
	UsePathStyle    bool
}

// Load loads configuration from environment variables with defaults
func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Port:            getEnv("PORT", "8080"),
			Environment:     getEnv("ENVIRONMENT", "development"),
			ReadTimeout:     getDuration("SERVER_READ_TIMEOUT", 30*time.Second),
			WriteTimeout:    getDuration("SERVER_WRITE_TIMEOUT", 30*time.Second),
			ShutdownTimeout: getDuration("SERVER_SHUTDOWN_TIMEOUT", 15*time.Second),
			BaseURL:         getEnv("BASE_URL", "http://localhost:8080"),
		},
		Database: DatabaseConfig{
			URL:             getEnv("DATABASE_URL", "postgres://localhost:5432/email?sslmode=disable"),
			MaxOpenConns:    getInt("DB_MAX_OPEN_CONNS", 25),
			MaxIdleConns:    getInt("DB_MAX_IDLE_CONNS", 5),
			ConnMaxLifetime: getDuration("DB_CONN_MAX_LIFETIME", 5*time.Minute),
		},
		Redis: RedisConfig{
			URL:      getEnv("REDIS_URL", "redis://localhost:6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getInt("REDIS_DB", 0),
		},
		SMTP: SMTPConfig{
			Host:       getEnv("SMTP_HOST", "localhost"),
			Port:       getInt("SMTP_PORT", 25),
			Username:   getEnv("SMTP_USERNAME", ""),
			Password:   getEnv("SMTP_PASSWORD", ""),
			FromDomain: getEnv("SMTP_FROM_DOMAIN", "localhost"),
			UseTLS:     getBool("SMTP_USE_TLS", false),
			QueueURL:   getEnv("SMTP_QUEUE_URL", "redis://localhost:6379/1"),
		},
		Tracking: TrackingConfig{
			Enabled:      getBool("TRACKING_ENABLED", true),
			TrackingURL:  getEnv("TRACKING_URL", "http://localhost:8080"),
			PixelPath:    getEnv("TRACKING_PIXEL_PATH", "/t/o"),
			RedirectPath: getEnv("TRACKING_REDIRECT_PATH", "/t/c"),
		},
		Webhook: WebhookConfig{
			MaxRetries:    getInt("WEBHOOK_MAX_RETRIES", 5),
			RetryInterval: getDuration("WEBHOOK_RETRY_INTERVAL", 30*time.Second),
			Timeout:       getDuration("WEBHOOK_TIMEOUT", 10*time.Second),
			SignatureKey:  getEnv("WEBHOOK_SIGNATURE_KEY", ""),
			WorkerCount:   getInt("WEBHOOK_WORKER_COUNT", 5),
		},
		RateLimit: RateLimitConfig{
			RequestsPerMinute: getInt("RATE_LIMIT_PER_MINUTE", 100),
			RequestsPerDay:    getInt("RATE_LIMIT_PER_DAY", 10000),
			BurstMultiplier:   getFloat("RATE_LIMIT_BURST_MULTIPLIER", 1.5),
		},
		S3: S3Config{
			Endpoint:        getEnv("S3_ENDPOINT", ""),
			AccessKeyID:     getEnv("S3_ACCESS_KEY_ID", ""),
			SecretAccessKey: getEnv("S3_SECRET_ACCESS_KEY", ""),
			Bucket:          getEnv("S3_BUCKET", "email-templates"),
			Region:          getEnv("S3_REGION", "us-east-1"),
			UsePathStyle:    getBool("S3_USE_PATH_STYLE", true),
		},
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

func getBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if b, err := strconv.ParseBool(value); err == nil {
			return b
		}
	}
	return defaultValue
}

func getFloat(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return defaultValue
}

func getDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if d, err := time.ParseDuration(value); err == nil {
			return d
		}
	}
	return defaultValue
}
