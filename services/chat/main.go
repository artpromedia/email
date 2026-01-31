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

	"chat/config"
	"chat/internal/api"
	"chat/internal/hub"
	"chat/internal/repository"
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

	logger.Info("Starting Chat Service",
		zap.String("version", "1.0.0"),
		zap.String("port", cfg.Server.Port),
	)

	// Initialize repository
	repo, err := repository.New(cfg)
	if err != nil {
		logger.Fatal("Failed to initialize repository", zap.Error(err))
	}
	defer repo.Close()

	// Initialize WebSocket hub
	wsHub := hub.NewHub(repo, logger)
	go wsHub.Run()

	// Initialize API server
	apiServer := api.NewServer(cfg, repo, wsHub, logger)

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
		logger.Info("Chat server started", zap.String("addr", server.Addr))
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

	wsHub.Shutdown()

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
