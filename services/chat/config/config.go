package config

import (
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

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Redis    RedisConfig    `yaml:"redis"`
	Auth     AuthConfig     `yaml:"auth"`
	Storage  StorageConfig  `yaml:"storage"`
	Metrics  MetricsConfig  `yaml:"metrics"`
	Limits   LimitsConfig   `yaml:"limits"`
}

type ServerConfig struct {
	Port     string `yaml:"port"`
	LogLevel string `yaml:"logLevel"`
}

type DatabaseConfig struct {
	URL             string        `yaml:"url"`
	MaxConns        int           `yaml:"maxConns"`
	MinConns        int           `yaml:"minConns"`
	MaxConnLifetime time.Duration `yaml:"maxConnLifetime"`
}

type RedisConfig struct {
	Addr     string `yaml:"addr"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
}

type AuthConfig struct {
	JWTSecret      string   `yaml:"jwtSecret"`
	ServiceURL     string   `yaml:"serviceUrl"`
	AllowedOrigins []string `yaml:"allowedOrigins"`
}

type StorageConfig struct {
	Endpoint        string `yaml:"endpoint"`
	AccessKey       string `yaml:"accessKey"`
	SecretKey       string `yaml:"secretKey"`
	Bucket          string `yaml:"bucket"`
	MaxFileSize     int64  `yaml:"maxFileSize"`
}

type MetricsConfig struct {
	Port string `yaml:"port"`
}

type LimitsConfig struct {
	MaxMessageLength    int `yaml:"maxMessageLength"`
	MaxChannelsPerOrg   int `yaml:"maxChannelsPerOrg"`
	MaxMembersPerChannel int `yaml:"maxMembersPerChannel"`
	MaxFileSize         int64 `yaml:"maxFileSize"`
	RateLimitPerMinute  int `yaml:"rateLimitPerMinute"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	// Expand environment variables using our custom expander that handles ${VAR:-default}
	expanded := expandEnvWithDefaults(string(data))

	var cfg Config
	if err := yaml.Unmarshal([]byte(expanded), &cfg); err != nil {
		return nil, err
	}

	// Set defaults
	if cfg.Server.Port == "" {
		cfg.Server.Port = "8086"
	}
	if cfg.Limits.MaxMessageLength == 0 {
		cfg.Limits.MaxMessageLength = 10000
	}
	if cfg.Limits.MaxChannelsPerOrg == 0 {
		cfg.Limits.MaxChannelsPerOrg = 500
	}
	if cfg.Limits.MaxMembersPerChannel == 0 {
		cfg.Limits.MaxMembersPerChannel = 1000
	}
	if cfg.Limits.MaxFileSize == 0 {
		cfg.Limits.MaxFileSize = 100 * 1024 * 1024 // 100MB
	}
	if cfg.Limits.RateLimitPerMinute == 0 {
		cfg.Limits.RateLimitPerMinute = 60
	}

	return &cfg, nil
}
