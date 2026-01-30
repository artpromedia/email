package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the AI assistant service
type Config struct {
	// Server settings
	Port            string
	Environment     string
	ShutdownTimeout time.Duration

	// Database settings
	Database DatabaseConfig

	// Redis settings
	Redis RedisConfig

	// LLM Provider settings
	Providers ProvidersConfig

	// Cache settings
	Cache CacheConfig

	// Rate limiting settings
	RateLimit RateLimitConfig

	// Analysis settings
	Analysis AnalysisConfig

	// Embedding settings
	Embedding EmbeddingConfig
}

// DatabaseConfig holds database connection settings
type DatabaseConfig struct {
	Host         string
	Port         int
	User         string
	Password     string
	Database     string
	SSLMode      string
	MaxConns     int
	MinConns     int
	ConnMaxLife  time.Duration
}

// DSN returns the PostgreSQL connection string
func (c DatabaseConfig) DSN() string {
	return "postgres://" + c.User + ":" + c.Password + "@" + c.Host + ":" +
		strconv.Itoa(c.Port) + "/" + c.Database + "?sslmode=" + c.SSLMode
}

// RedisConfig holds Redis connection settings
type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
}

// ProvidersConfig holds LLM provider configurations
type ProvidersConfig struct {
	// OpenAI settings
	OpenAI OpenAIConfig

	// Anthropic settings
	Anthropic AnthropicConfig

	// Ollama (local) settings
	Ollama OllamaConfig

	// Default provider for each feature
	DefaultAnalysisProvider   string
	DefaultEmbeddingProvider  string
	DefaultSmartReplyProvider string

	// Fallback chain (comma-separated provider names)
	FallbackChain string

	// Request timeout
	RequestTimeout time.Duration
}

// OpenAIConfig holds OpenAI-specific settings
type OpenAIConfig struct {
	Enabled       bool
	APIKey        string
	Organization  string
	BaseURL       string
	Model         string
	EmbeddingModel string
	MaxTokens     int
	Temperature   float64
}

// AnthropicConfig holds Anthropic-specific settings
type AnthropicConfig struct {
	Enabled     bool
	APIKey      string
	BaseURL     string
	Model       string
	MaxTokens   int
	Temperature float64
}

// OllamaConfig holds Ollama (local model) settings
type OllamaConfig struct {
	Enabled  bool
	BaseURL  string
	Model    string
	EmbeddingModel string
}

// CacheConfig holds caching settings
type CacheConfig struct {
	// Analysis cache TTL
	AnalysisTTL time.Duration

	// Embedding cache TTL
	EmbeddingTTL time.Duration

	// Smart reply cache TTL
	SmartReplyTTL time.Duration

	// Max cache entries per type
	MaxAnalysisEntries  int
	MaxEmbeddingEntries int
}

// RateLimitConfig holds rate limiting settings
type RateLimitConfig struct {
	// Per-organization limits
	OrgTokensPerMinute   int
	OrgRequestsPerMinute int

	// Per-user limits
	UserTokensPerMinute   int
	UserRequestsPerMinute int

	// Burst allowance (percentage over limit)
	BurstMultiplier float64

	// Graceful degradation threshold (percentage of limit)
	DegradationThreshold float64
}

// AnalysisConfig holds email analysis settings
type AnalysisConfig struct {
	// Max email body length to analyze
	MaxBodyLength int

	// Max concurrent analysis requests
	MaxConcurrent int

	// Batch size for bulk analysis
	BatchSize int

	// Priority score threshold for "urgent"
	UrgentThreshold float64

	// Whether to extract action items
	ExtractActionItems bool

	// Whether to detect questions
	DetectQuestions bool
}

// EmbeddingConfig holds embedding generation settings
type EmbeddingConfig struct {
	// Embedding dimensions (1536 for OpenAI ada-002)
	Dimensions int

	// Max text length for embedding
	MaxTextLength int

	// Batch size for bulk embedding
	BatchSize int

	// Max concurrent embedding requests
	MaxConcurrent int
}

// Load creates a Config from environment variables
func Load() (*Config, error) {
	return &Config{
		// Server
		Port:            getEnv("PORT", "8090"),
		Environment:     getEnv("ENVIRONMENT", "development"),
		ShutdownTimeout: getDuration("SHUTDOWN_TIMEOUT", 30*time.Second),

		// Database
		Database: DatabaseConfig{
			Host:        getEnv("DB_HOST", "localhost"),
			Port:        getInt("DB_PORT", 5432),
			User:        getEnv("DB_USER", "postgres"),
			Password:    getEnv("DB_PASSWORD", ""),
			Database:    getEnv("DB_NAME", "enterprise_email"),
			SSLMode:     getEnv("DB_SSL_MODE", "disable"),
			MaxConns:    getInt("DB_MAX_CONNS", 25),
			MinConns:    getInt("DB_MIN_CONNS", 5),
			ConnMaxLife: getDuration("DB_CONN_MAX_LIFE", time.Hour),
		},

		// Redis
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getInt("REDIS_PORT", 6379),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       getInt("REDIS_DB", 0),
		},

		// Providers
		Providers: ProvidersConfig{
			OpenAI: OpenAIConfig{
				Enabled:        getBool("OPENAI_ENABLED", true),
				APIKey:         getEnv("OPENAI_API_KEY", ""),
				Organization:   getEnv("OPENAI_ORGANIZATION", ""),
				BaseURL:        getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
				Model:          getEnv("OPENAI_MODEL", "gpt-4-turbo-preview"),
				EmbeddingModel: getEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-ada-002"),
				MaxTokens:      getInt("OPENAI_MAX_TOKENS", 4096),
				Temperature:    getFloat("OPENAI_TEMPERATURE", 0.3),
			},
			Anthropic: AnthropicConfig{
				Enabled:     getBool("ANTHROPIC_ENABLED", false),
				APIKey:      getEnv("ANTHROPIC_API_KEY", ""),
				BaseURL:     getEnv("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
				Model:       getEnv("ANTHROPIC_MODEL", "claude-3-sonnet-20240229"),
				MaxTokens:   getInt("ANTHROPIC_MAX_TOKENS", 4096),
				Temperature: getFloat("ANTHROPIC_TEMPERATURE", 0.3),
			},
			Ollama: OllamaConfig{
				Enabled:        getBool("OLLAMA_ENABLED", false),
				BaseURL:        getEnv("OLLAMA_BASE_URL", "http://localhost:11434"),
				Model:          getEnv("OLLAMA_MODEL", "llama2"),
				EmbeddingModel: getEnv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text"),
			},
			DefaultAnalysisProvider:   getEnv("DEFAULT_ANALYSIS_PROVIDER", "openai"),
			DefaultEmbeddingProvider:  getEnv("DEFAULT_EMBEDDING_PROVIDER", "openai"),
			DefaultSmartReplyProvider: getEnv("DEFAULT_SMART_REPLY_PROVIDER", "openai"),
			FallbackChain:             getEnv("FALLBACK_CHAIN", "openai,anthropic,ollama"),
			RequestTimeout:            getDuration("PROVIDER_REQUEST_TIMEOUT", 30*time.Second),
		},

		// Cache
		Cache: CacheConfig{
			AnalysisTTL:         getDuration("CACHE_ANALYSIS_TTL", 24*time.Hour),
			EmbeddingTTL:        getDuration("CACHE_EMBEDDING_TTL", 7*24*time.Hour),
			SmartReplyTTL:       getDuration("CACHE_SMART_REPLY_TTL", 1*time.Hour),
			MaxAnalysisEntries:  getInt("CACHE_MAX_ANALYSIS_ENTRIES", 100000),
			MaxEmbeddingEntries: getInt("CACHE_MAX_EMBEDDING_ENTRIES", 500000),
		},

		// Rate limiting
		RateLimit: RateLimitConfig{
			OrgTokensPerMinute:   getInt("RATE_LIMIT_ORG_TOKENS_PER_MIN", 100000),
			OrgRequestsPerMinute: getInt("RATE_LIMIT_ORG_REQUESTS_PER_MIN", 1000),
			UserTokensPerMinute:  getInt("RATE_LIMIT_USER_TOKENS_PER_MIN", 10000),
			UserRequestsPerMinute: getInt("RATE_LIMIT_USER_REQUESTS_PER_MIN", 100),
			BurstMultiplier:       getFloat("RATE_LIMIT_BURST_MULTIPLIER", 1.5),
			DegradationThreshold:  getFloat("RATE_LIMIT_DEGRADATION_THRESHOLD", 0.8),
		},

		// Analysis
		Analysis: AnalysisConfig{
			MaxBodyLength:      getInt("ANALYSIS_MAX_BODY_LENGTH", 100000),
			MaxConcurrent:      getInt("ANALYSIS_MAX_CONCURRENT", 50),
			BatchSize:          getInt("ANALYSIS_BATCH_SIZE", 10),
			UrgentThreshold:    getFloat("ANALYSIS_URGENT_THRESHOLD", 0.8),
			ExtractActionItems: getBool("ANALYSIS_EXTRACT_ACTION_ITEMS", true),
			DetectQuestions:    getBool("ANALYSIS_DETECT_QUESTIONS", true),
		},

		// Embedding
		Embedding: EmbeddingConfig{
			Dimensions:    getInt("EMBEDDING_DIMENSIONS", 1536),
			MaxTextLength: getInt("EMBEDDING_MAX_TEXT_LENGTH", 8191),
			BatchSize:     getInt("EMBEDDING_BATCH_SIZE", 100),
			MaxConcurrent: getInt("EMBEDDING_MAX_CONCURRENT", 20),
		},
	}, nil
}

// Helper functions for environment variables
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getFloat(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		if floatValue, err := strconv.ParseFloat(value, 64); err == nil {
			return floatValue
		}
	}
	return defaultValue
}

func getBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}

func getDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}
