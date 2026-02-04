package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-redis/redis/v8"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/oonrumail/storage/config"
	"github.com/oonrumail/storage/dedup"
	"github.com/oonrumail/storage/export"
	"github.com/oonrumail/storage/handlers"
	"github.com/oonrumail/storage/quota"
	"github.com/oonrumail/storage/retention"
	"github.com/oonrumail/storage/storage"
	"github.com/oonrumail/storage/workers"
)

func main() {
	// Setup logging
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if os.Getenv("ENV") == "development" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}

	logger := log.With().Str("service", "storage").Logger()
	logger.Info().Msg("Starting Multi-Domain Storage Service")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to load configuration")
	}

	// Initialize context
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to PostgreSQL
	dbPool, err := pgxpool.New(ctx, cfg.Database.DSN())
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer dbPool.Close()
	logger.Info().Msg("Connected to PostgreSQL")

	// Connect to Redis
	redisClient := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Redis.Host, cfg.Redis.Port),
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})
	defer redisClient.Close()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		logger.Fatal().Err(err).Msg("Failed to connect to Redis")
	}
	logger.Info().Msg("Connected to Redis")

	// Initialize S3 storage
	s3Storage, err := storage.NewS3Storage(ctx, cfg, logger)
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to initialize S3 storage")
	}
	logger.Info().Msg("Initialized S3 storage")

	// Initialize services
	quotaService := quota.NewService(dbPool, redisClient, cfg, logger)
	retentionService := retention.NewService(dbPool, s3Storage, cfg, logger)
	domainStorage := storage.NewDomainStorage(s3Storage, quotaService, cfg, logger)
	exportService := export.NewService(dbPool, domainStorage, cfg, logger)
	deletionService := export.NewDeletionService(dbPool, domainStorage, quotaService, cfg, logger)
	dedupService := dedup.NewService(dbPool, s3Storage, cfg, logger)

	// Initialize HTTP handlers
	handler := handlers.NewHandler(
		domainStorage,
		quotaService,
		retentionService,
		exportService,
		deletionService,
		dedupService,
		logger,
	)

	// Setup router
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-Request-ID")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	})

	// Mount API routes
	r.Mount("/", handler.Router())

	// Metrics endpoint
	r.Handle("/metrics", promhttp.Handler())

	// Start background workers
	retentionWorker := workers.NewRetentionWorker(dbPool, retentionService, domainStorage, cfg, logger)
	exportWorker := workers.NewExportWorker(dbPool, exportService, cfg, logger)
	deletionWorker := workers.NewDeletionWorker(dbPool, deletionService, cfg, logger)
	dedupWorker := workers.NewDeduplicationWorker(dbPool, dedupService, cfg, logger)

	if cfg.Workers.Enabled {
		go retentionWorker.Start(ctx)
		go exportWorker.Start(ctx)
		go deletionWorker.Start(ctx)
		go dedupWorker.Start(ctx)
		logger.Info().Msg("Background workers started")
	}

	// Start HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      r,
		ReadTimeout:  time.Duration(cfg.Server.ReadTimeout) * time.Second,
		WriteTimeout: time.Duration(cfg.Server.WriteTimeout) * time.Second,
		IdleTimeout:  time.Duration(cfg.Server.IdleTimeout) * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh

		logger.Info().Msg("Shutdown signal received")

		// Stop workers
		retentionWorker.Stop()
		exportWorker.Stop()
		deletionWorker.Stop()
		dedupWorker.Stop()

		// Shutdown server
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer shutdownCancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			logger.Error().Err(err).Msg("Server shutdown error")
		}

		cancel()
	}()

	logger.Info().Int("port", cfg.Server.Port).Msg("Starting HTTP server")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Fatal().Err(err).Msg("Server failed")
	}

	logger.Info().Msg("Server stopped")
}
