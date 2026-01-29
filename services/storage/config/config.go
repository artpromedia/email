package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the storage service
type Config struct {
	// Server settings
	Port            string
	Environment     string
	ShutdownTimeout time.Duration

	// Database settings
	DatabaseURL     string
	MaxDBConns      int
	MinDBConns      int
	DBConnMaxLife   time.Duration

	// Redis settings
	RedisURL      string
	RedisPassword string
	RedisDB       int

	// S3/MinIO settings
	S3Endpoint        string
	S3Region          string
	S3AccessKey       string
	S3SecretKey       string
	S3Bucket          string
	S3UsePathStyle    bool
	S3PresignDuration time.Duration

	// Storage settings
	MaxUploadSize       int64
	ChunkSize           int64
	DeduplicationEnabled bool

	// Quota settings
	DefaultOrgQuota     int64 // bytes
	DefaultDomainQuota  int64
	DefaultUserQuota    int64
	DefaultMailboxQuota int64
	QuotaWarningPercent int

	// Retention settings
	RetentionCheckInterval time.Duration
	RetentionBatchSize     int

	// Export settings
	ExportTempDir      string
	ExportMaxSize      int64
	ExportExpiration   time.Duration

	// Worker settings
	NumWorkers         int
	WorkerPollInterval time.Duration
}

// Load creates a Config from environment variables
func Load() *Config {
	return &Config{
		// Server
		Port:            getEnv("PORT", "8085"),
		Environment:     getEnv("ENVIRONMENT", "development"),
		ShutdownTimeout: getDuration("SHUTDOWN_TIMEOUT", 30*time.Second),

		// Database
		DatabaseURL:   requireEnv("DATABASE_URL"),
		MaxDBConns:    getInt("MAX_DB_CONNS", 25),
		MinDBConns:    getInt("MIN_DB_CONNS", 5),
		DBConnMaxLife: getDuration("DB_CONN_MAX_LIFE", time.Hour),

		// Redis
		RedisURL:      getEnv("REDIS_URL", "localhost:6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		RedisDB:       getInt("REDIS_DB", 0),

		// S3/MinIO
		S3Endpoint:        getEnv("S3_ENDPOINT", "http://localhost:9000"),
		S3Region:          getEnv("S3_REGION", "us-east-1"),
		S3AccessKey:       requireEnv("S3_ACCESS_KEY"),
		S3SecretKey:       requireEnv("S3_SECRET_KEY"),
		S3Bucket:          getEnv("S3_BUCKET", "email-storage"),
		S3UsePathStyle:    getBool("S3_USE_PATH_STYLE", true),
		S3PresignDuration: getDuration("S3_PRESIGN_DURATION", 15*time.Minute),

		// Storage
		MaxUploadSize:        getInt64("MAX_UPLOAD_SIZE", 50*1024*1024), // 50MB
		ChunkSize:            getInt64("CHUNK_SIZE", 5*1024*1024),       // 5MB
		DeduplicationEnabled: getBool("DEDUPLICATION_ENABLED", true),

		// Quotas (defaults in bytes)
		DefaultOrgQuota:     getInt64("DEFAULT_ORG_QUOTA", 1024*1024*1024*1024),     // 1TB
		DefaultDomainQuota:  getInt64("DEFAULT_DOMAIN_QUOTA", 100*1024*1024*1024),   // 100GB
		DefaultUserQuota:    getInt64("DEFAULT_USER_QUOTA", 10*1024*1024*1024),      // 10GB
		DefaultMailboxQuota: getInt64("DEFAULT_MAILBOX_QUOTA", 5*1024*1024*1024),    // 5GB
		QuotaWarningPercent: getInt("QUOTA_WARNING_PERCENT", 90),

		// Retention
		RetentionCheckInterval: getDuration("RETENTION_CHECK_INTERVAL", time.Hour),
		RetentionBatchSize:     getInt("RETENTION_BATCH_SIZE", 1000),

		// Export
		ExportTempDir:    getEnv("EXPORT_TEMP_DIR", "/tmp/exports"),
		ExportMaxSize:    getInt64("EXPORT_MAX_SIZE", 10*1024*1024*1024), // 10GB
		ExportExpiration: getDuration("EXPORT_EXPIRATION", 24*time.Hour),

		// Workers
		NumWorkers:         getInt("NUM_WORKERS", 4),
		WorkerPollInterval: getDuration("WORKER_POLL_INTERVAL", 10*time.Second),
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

func getInt64(key string, defaultValue int64) int64 {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.ParseInt(value, 10, 64); err == nil {
			return i
		}
	}
	return defaultValue
}

func requireEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatal().Str("key", key).Msg("Required environment variable is missing")
	}
	return value
}

func getBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if b, err := strconv.ParseBool(value); err == nil {
			return b
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
