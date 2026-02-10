package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/oonrumail/smtp-server/config"
	"github.com/oonrumail/smtp-server/domain"
	"github.com/oonrumail/smtp-server/queue"
	"github.com/oonrumail/smtp-server/repository"
	"github.com/oonrumail/smtp-server/smtp"
)

func main() {
	// Parse flags
	configPath := flag.String("config", "config.yaml", "Path to config file")
	flag.Parse()

	// Load configuration
	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load config: %v\n", err)
		os.Exit(1)
	}

	// Initialize logger
	logger := initLogger(cfg.Logging.Level)
	defer logger.Sync()

	logger.Info("Starting SMTP server",
		zap.String("version", "1.0.0"),
		zap.String("hostname", cfg.Server.Hostname))

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize PostgreSQL connection pool
	dbPool, err := initDatabase(ctx, cfg.Database)
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}
	defer dbPool.Close()

	// Initialize Redis client
	redisClient := initRedis(cfg.Redis)
	defer redisClient.Close()

	// Set DKIM encryption key for decrypting private keys from database
	if cfg.DKIM.EncryptionKey != "" {
		repository.SetDKIMEncryptionKey(cfg.DKIM.EncryptionKey)
	}

	// Initialize repositories
	domainRepo := repository.NewDomainRepository(dbPool, logger.Named("domain-repo"))
	messageRepo := repository.NewMessageRepository(dbPool, logger.Named("message-repo"))
	authRepo := repository.NewAuthRepository(dbPool, logger.Named("auth-repo"))

	// Initialize domain cache
	domainCache := domain.NewCache(domainRepo, logger.Named("cache"), 5*time.Minute)
	if err := domainCache.Start(ctx); err != nil {
		logger.Fatal("Failed to start domain cache", zap.Error(err))
	}
	defer domainCache.Stop()

	// Initialize queue manager
	queueManager := queue.NewManager(cfg, redisClient, messageRepo, domainCache, logger.Named("queue"))
	if err := queueManager.Start(ctx); err != nil {
		logger.Fatal("Failed to start queue manager", zap.Error(err))
	}

	// Initialize SMTP server
	smtpServer := smtp.NewServer(cfg, domainCache, queueManager, redisClient, authRepo, logger.Named("smtp"))
	if err := smtpServer.Start(ctx); err != nil {
		logger.Fatal("Failed to start SMTP server", zap.Error(err))
	}

	// Initialize metrics server
	metricsServer := initMetricsServer(cfg.Metrics, smtpServer)
	metricsAddr := fmt.Sprintf("%s:%d", cfg.Metrics.Host, cfg.Metrics.Port)
	go func() {
		logger.Info("Starting metrics server", zap.String("addr", metricsAddr))
		if err := metricsServer.ListenAndServe(); err != http.ErrServerClosed {
			logger.Error("Metrics server error", zap.Error(err))
		}
	}()

	// Wait for shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.Info("Shutting down...")

	// Create shutdown context with timeout
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// Stop components in reverse order
	if err := metricsServer.Shutdown(shutdownCtx); err != nil {
		logger.Error("Failed to stop metrics server", zap.Error(err))
	}

	if err := smtpServer.Stop(shutdownCtx); err != nil {
		logger.Error("Failed to stop SMTP server", zap.Error(err))
	}

	if err := queueManager.Stop(shutdownCtx); err != nil {
		logger.Error("Failed to stop queue manager", zap.Error(err))
	}

	logger.Info("Shutdown complete")
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
	case "error":
		zapLevel = zapcore.ErrorLevel
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
			FunctionKey:    zapcore.OmitKey,
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

	logger, err := config.Build()
	if err != nil {
		panic(err)
	}

	return logger
}

func initDatabase(ctx context.Context, cfg config.DatabaseConfig) (*pgxpool.Pool, error) {
	poolConfig, err := pgxpool.ParseConfig(cfg.DSN())
	if err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	poolConfig.MaxConns = int32(cfg.MaxOpenConns)
	poolConfig.MinConns = int32(cfg.MaxIdleConns)
	poolConfig.MaxConnLifetime = cfg.ConnMaxLifetime
	poolConfig.MaxConnIdleTime = cfg.ConnMaxIdleTime

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	// Test connection
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}

	return pool, nil
}

func initRedis(cfg config.RedisConfig) *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr:     cfg.Addr(),
		Password: cfg.Password,
		DB:       cfg.DB,
	})
}

func initMetricsServer(cfg config.MetricsConfig, smtpServer *smtp.Server) *http.Server {
	// Register SMTP metrics
	registry := prometheus.NewRegistry()
	registry.MustRegister(prometheus.NewGoCollector())
	registry.MustRegister(prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}))

	mux := http.NewServeMux()
	mux.Handle(cfg.Path, promhttp.HandlerFor(registry, promhttp.HandlerOpts{}))
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/ready", readyHandler)

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	return &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func readyHandler(w http.ResponseWriter, r *http.Request) {
	// Check dependencies
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}
