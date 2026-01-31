package config

import (
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server    ServerConfig    `yaml:"server"`
	Database  DatabaseConfig  `yaml:"database"`
	Redis     RedisConfig     `yaml:"redis"`
	Auth      AuthConfig      `yaml:"auth"`
	Metrics   MetricsConfig   `yaml:"metrics"`
	RateLimit RateLimitConfig `yaml:"rateLimit"`
	OTP       OTPConfig       `yaml:"otp"`
	Providers ProvidersConfig `yaml:"providers"`
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
	JWTSecret  string `yaml:"jwtSecret"`
	APIKeyAuth bool   `yaml:"apiKeyAuth"`
}

type MetricsConfig struct {
	Port string `yaml:"port"`
}

type RateLimitConfig struct {
	Enabled           bool `yaml:"enabled"`
	DefaultPerMinute  int  `yaml:"defaultPerMinute"`
	DefaultPerHour    int  `yaml:"defaultPerHour"`
	DefaultPerDay     int  `yaml:"defaultPerDay"`
	OTPPerMinute      int  `yaml:"otpPerMinute"`
	OTPPerHour        int  `yaml:"otpPerHour"`
	OTPPerPhonePerDay int  `yaml:"otpPerPhonePerDay"`
}

type OTPConfig struct {
	Length          int           `yaml:"length"`
	ExpiryMinutes   int           `yaml:"expiryMinutes"`
	MaxAttempts     int           `yaml:"maxAttempts"`
	ResendCooldown  time.Duration `yaml:"resendCooldown"`
	Alphanumeric    bool          `yaml:"alphanumeric"`
	CaseSensitive   bool          `yaml:"caseSensitive"`
}

type ProvidersConfig struct {
	Default string        `yaml:"default"`
	Twilio  TwilioConfig  `yaml:"twilio"`
	Vonage  VonageConfig  `yaml:"vonage"`
	SMPP    SMPPConfig    `yaml:"smpp"`
	GSM     GSMConfig     `yaml:"gsm"`
}

type TwilioConfig struct {
	Enabled             bool   `yaml:"enabled"`
	Priority            int    `yaml:"priority"`
	AccountSID          string `yaml:"accountSid"`
	AuthToken           string `yaml:"authToken"`
	FromNumber          string `yaml:"fromNumber"`
	MessagingServiceSID string `yaml:"messagingServiceSid"`
}

type VonageConfig struct {
	Enabled       bool   `yaml:"enabled"`
	Priority      int    `yaml:"priority"`
	APIKey        string `yaml:"apiKey"`
	APISecret     string `yaml:"apiSecret"`
	FromNumber    string `yaml:"fromNumber"`
	ApplicationID string `yaml:"applicationId"`
	PrivateKey    string `yaml:"privateKey"`
}

type SMPPConfig struct {
	Enabled  bool   `yaml:"enabled"`
	Priority int    `yaml:"priority"`
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	SystemID string `yaml:"systemId"`
	Password string `yaml:"password"`
	SystemType string `yaml:"systemType"`
}

type GSMConfig struct {
	Enabled    bool   `yaml:"enabled"`
	Priority   int    `yaml:"priority"`
	DevicePath string `yaml:"devicePath"`
	BaudRate   int    `yaml:"baudRate"`
	PIN        string `yaml:"pin"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	// Expand environment variables
	expanded := os.ExpandEnv(string(data))

	var cfg Config
	if err := yaml.Unmarshal([]byte(expanded), &cfg); err != nil {
		return nil, err
	}

	// Set defaults
	setDefaults(&cfg)

	return &cfg, nil
}

func setDefaults(cfg *Config) {
	if cfg.Server.Port == "" {
		cfg.Server.Port = "8087"
	}
	if cfg.Server.LogLevel == "" {
		cfg.Server.LogLevel = "info"
	}
	if cfg.Metrics.Port == "" {
		cfg.Metrics.Port = "9095"
	}

	// Rate limit defaults
	if cfg.RateLimit.DefaultPerMinute == 0 {
		cfg.RateLimit.DefaultPerMinute = 30
	}
	if cfg.RateLimit.DefaultPerHour == 0 {
		cfg.RateLimit.DefaultPerHour = 500
	}
	if cfg.RateLimit.DefaultPerDay == 0 {
		cfg.RateLimit.DefaultPerDay = 5000
	}
	if cfg.RateLimit.OTPPerMinute == 0 {
		cfg.RateLimit.OTPPerMinute = 3
	}
	if cfg.RateLimit.OTPPerHour == 0 {
		cfg.RateLimit.OTPPerHour = 10
	}
	if cfg.RateLimit.OTPPerPhonePerDay == 0 {
		cfg.RateLimit.OTPPerPhonePerDay = 5
	}

	// OTP defaults
	if cfg.OTP.Length == 0 {
		cfg.OTP.Length = 6
	}
	if cfg.OTP.ExpiryMinutes == 0 {
		cfg.OTP.ExpiryMinutes = 5
	}
	if cfg.OTP.MaxAttempts == 0 {
		cfg.OTP.MaxAttempts = 3
	}
	if cfg.OTP.ResendCooldown == 0 {
		cfg.OTP.ResendCooldown = 60 * time.Second
	}
}
