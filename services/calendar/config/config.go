package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server       ServerConfig       `yaml:"server"`
	Database     DatabaseConfig     `yaml:"database"`
	Notification NotificationConfig `yaml:"notification"`
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

type NotificationConfig struct {
	EmailEnabled   bool   `yaml:"emailEnabled"`
	SMTPHost       string `yaml:"smtpHost"`
	SMTPPort       int    `yaml:"smtpPort"`
	FromEmail      string `yaml:"fromEmail"`
	ReminderLookAhead int `yaml:"reminderLookAhead"` // Minutes to look ahead for reminders
}

func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}

	data = []byte(os.ExpandEnv(string(data)))

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	// Defaults
	if cfg.Server.Addr == "" {
		cfg.Server.Addr = ":8082"
	}
	if cfg.Database.MaxConns == 0 {
		cfg.Database.MaxConns = 25
	}
	if cfg.Notification.ReminderLookAhead == 0 {
		cfg.Notification.ReminderLookAhead = 15
	}

	return &cfg, nil
}
