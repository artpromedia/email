package main

import (
	"context"
	"flag"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"sms-gateway/internal/api"
	"sms-gateway/internal/config"
	"sms-gateway/internal/otp"
	"sms-gateway/internal/providers"
	"sms-gateway/internal/providers/twilio"
	"sms-gateway/internal/providers/vonage"
	"sms-gateway/internal/ratelimit"
	"sms-gateway/internal/repository"
	"sms-gateway/internal/templates"
)

func main() {
	configPath := flag.String("config", "config.yaml", "Path to config file")
	flag.Parse()

	// Load configuration
	cfg, err := config.Load(*configPath)
	if err != nil {
		panic("Failed to load config: " + err.Error())
	}

	// Initialize logger
	logger := initLogger(cfg.Server.LogLevel)
	defer logger.Sync()

	logger.Info("Starting SMS Gateway Service",
		zap.String("version", "1.0.0"),
		zap.String("port", cfg.Server.Port),
	)

	// Initialize repository
	repo, err := repository.New(cfg)
	if err != nil {
		logger.Fatal("Failed to initialize repository", zap.Error(err))
	}
	defer repo.Close()

	// Initialize rate limiter
	rateLimiter := ratelimit.New(cfg.RateLimit, repo)

	// Initialize template engine
	templateEngine := templates.New(repo, logger)

	// Initialize SMS providers
	providerManager := initProviders(cfg, logger)

	// Initialize OTP service
	otpService := otp.New(cfg.OTP, repo, providerManager, templateEngine, logger)

	// Initialize API server
	apiServer := api.NewServer(cfg, repo, providerManager, otpService, rateLimiter, templateEngine, logger)

	// Start metrics server
	go startMetricsServer(cfg.Metrics.Port, logger)

	// Start HTTP server
	server := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      apiServer.Router(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("SMS Gateway server started", zap.String("addr", server.Addr))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server error", zap.Error(err))
		}
	}()

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server shutdown error", zap.Error(err))
	}

	logger.Info("Server stopped")
}

func initLogger(level string) *zap.Logger {
	var zapLevel zapcore.Level
	switch level {
	case "debug":
		zapLevel = zapcore.DebugLevel
	case "info":
		zapLevel = zapcore.InfoLevel
	case "warn":
		zapLevel = zapcore.WarnLevel
	default:
		zapLevel = zapcore.InfoLevel
	}

	config := zap.Config{
		Level:       zap.NewAtomicLevelAt(zapLevel),
		Development: false,
		Encoding:    "json",
		EncoderConfig: zapcore.EncoderConfig{
			TimeKey:        "time",
			LevelKey:       "level",
			NameKey:        "logger",
			CallerKey:      "caller",
			MessageKey:     "msg",
			StacktraceKey:  "stacktrace",
			LineEnding:     zapcore.DefaultLineEnding,
			EncodeLevel:    zapcore.LowercaseLevelEncoder,
			EncodeTime:     zapcore.ISO8601TimeEncoder,
			EncodeDuration: zapcore.SecondsDurationEncoder,
			EncodeCaller:   zapcore.ShortCallerEncoder,
		},
		OutputPaths:      []string{"stdout"},
		ErrorOutputPaths: []string{"stderr"},
	}

	logger, _ := config.Build()
	return logger
}

func initProviders(cfg *config.Config, logger *zap.Logger) *providers.Manager {
	manager := providers.NewManager(logger)

	// Register Twilio provider
	if cfg.Providers.Twilio.Enabled {
		twilioProvider := twilio.New(
			cfg.Providers.Twilio.AccountSID,
			cfg.Providers.Twilio.AuthToken,
			cfg.Providers.Twilio.FromNumber,
			cfg.Providers.Twilio.MessagingServiceSID,
			logger,
		)
		manager.Register("twilio", twilioProvider, cfg.Providers.Twilio.Priority)
		logger.Info("Registered Twilio provider", zap.Int("priority", cfg.Providers.Twilio.Priority))
	}

	// Register Vonage provider
	if cfg.Providers.Vonage.Enabled {
		vonageProvider := vonage.New(
			cfg.Providers.Vonage.APIKey,
			cfg.Providers.Vonage.APISecret,
			cfg.Providers.Vonage.FromNumber,
			cfg.Providers.Vonage.ApplicationID,
			cfg.Providers.Vonage.PrivateKey,
			logger,
		)
		manager.Register("vonage", vonageProvider, cfg.Providers.Vonage.Priority)
		logger.Info("Registered Vonage provider", zap.Int("priority", cfg.Providers.Vonage.Priority))
	}

	return manager
}

func startMetricsServer(port string, logger *zap.Logger) {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy"}`))
	})

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	logger.Info("Metrics server started", zap.String("port", port))
	if err := server.ListenAndServe(); err != nil {
		logger.Error("Metrics server error", zap.Error(err))
	}
}
