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

	"github.com/oonrumail/imap-server/config"
	"github.com/oonrumail/imap-server/imap"
	"github.com/oonrumail/imap-server/repository"
)

func main() {
	// Parse flags
	configPath := flag.String("config", "config.yaml", "Path to configuration file")
	flag.Parse()

	// Initialize logger
	logConfig := zap.NewProductionConfig()
	logConfig.EncoderConfig.TimeKey = "timestamp"
	logConfig.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder

	logger, err := logConfig.Build()
	if err != nil {
		panic("Failed to initialize logger: " + err.Error())
	}
	defer logger.Sync()

	logger.Info("Starting IMAP server",
		zap.String("version", "1.0.0"),
	)

	// Load configuration
	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Fatal("Failed to load configuration", zap.Error(err))
	}

	logger.Info("Configuration loaded",
		zap.Int("plain_port", cfg.Server.Port),
		zap.Int("tls_port", cfg.Server.TLSPort),
		zap.String("namespace_mode", cfg.IMAP.NamespaceMode),
	)

	// Initialize repository
	repo, err := repository.New(cfg)
	if err != nil {
		logger.Fatal("Failed to initialize repository", zap.Error(err))
	}
	defer repo.Close()

	logger.Info("Database connection established")

	// Initialize IMAP server
	server, err := imap.NewServer(cfg, repo, logger)
	if err != nil {
		logger.Fatal("Failed to create IMAP server", zap.Error(err))
	}

	// Start metrics server
	if cfg.Metrics.Enabled {
		go startMetricsServer(cfg, logger)
	}

	// Start IMAP server
	go func() {
		if err := server.Start(); err != nil {
			logger.Fatal("IMAP server failed", zap.Error(err))
		}
	}()

	logger.Info("IMAP server started",
		zap.Int("plain_port", cfg.Server.Port),
		zap.Int("tls_port", cfg.Server.TLSPort),
	)

	// Wait for shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.Info("Shutdown signal received")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Shutdown error", zap.Error(err))
	}

	logger.Info("IMAP server stopped")
}

func startMetricsServer(cfg *config.Config, logger *zap.Logger) {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/ready", readyHandler)

	addr := cfg.Metrics.Address
	if addr == "" {
		addr = ":9090"
	}

	server := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	logger.Info("Starting metrics server", zap.String("address", addr))

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Error("Metrics server error", zap.Error(err))
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"healthy"}`))
}

func readyHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ready"}`))
}
