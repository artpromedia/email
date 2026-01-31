package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Auth     AuthConfig     `yaml:"auth"`
	Storage  StorageConfig  `yaml:"storage"`
}

type ServerConfig struct {
	Port        int      `yaml:"port"`
	Domain      string   `yaml:"domain"`
	PublicURL   string   `yaml:"public_url"`
	Debug       bool     `yaml:"debug"`
	CORSOrigins []string `yaml:"cors_origins"`
}

type DatabaseConfig struct {
	URL             string `yaml:"url"`
	MaxConns        int    `yaml:"max_conns"`
	MinConns        int    `yaml:"min_conns"`
	MaxConnLifetime string `yaml:"max_conn_lifetime"`
}

type AuthConfig struct {
	ServiceURL string `yaml:"service_url"`
	JWTSecret  string `yaml:"jwt_secret"`
}

type StorageConfig struct {
	PhotoPath string `yaml:"photo_path"`
	MaxSize   int64  `yaml:"max_size"` // bytes
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	// Apply environment variable overrides
	if url := os.Getenv("DATABASE_URL"); url != "" {
		cfg.Database.URL = url
	}
	if domain := os.Getenv("DOMAIN"); domain != "" {
		cfg.Server.Domain = domain
	}
	if authURL := os.Getenv("AUTH_SERVICE_URL"); authURL != "" {
		cfg.Auth.ServiceURL = authURL
	}
	if photoPath := os.Getenv("PHOTO_STORAGE_PATH"); photoPath != "" {
		cfg.Storage.PhotoPath = photoPath
	}

	// Defaults
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8083
	}
	if cfg.Database.MaxConns == 0 {
		cfg.Database.MaxConns = 25
	}
	if cfg.Database.MinConns == 0 {
		cfg.Database.MinConns = 5
	}
	if cfg.Storage.PhotoPath == "" {
		cfg.Storage.PhotoPath = "/data/photos"
	}
	if cfg.Storage.MaxSize == 0 {
		cfg.Storage.MaxSize = 5 * 1024 * 1024 // 5MB
	}

	return &cfg, nil
}
