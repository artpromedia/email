package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/artpromedia/email/services/transactional-api/config"
	"github.com/artpromedia/email/services/transactional-api/handler"
	"github.com/artpromedia/email/services/transactional-api/middleware"
	"github.com/artpromedia/email/services/transactional-api/repository"
	"github.com/artpromedia/email/services/transactional-api/service"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

func main() {
	// Initialize logger
	logger := zerolog.New(os.Stdout).With().
		Timestamp().
		Str("service", "transactional-api").
		Logger()

	// Load configuration
	cfg := config.Load()

	logger.Info().
		Str("environment", cfg.Server.Environment).
		Str("port", cfg.Server.Port).
		Msg("Starting transactional API service")

	// Initialize database connection
	ctx := context.Background()
	pool, err := initDatabase(ctx, cfg)
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer pool.Close()
	logger.Info().Msg("Connected to database")

	// Initialize Redis connection
	redisClient, err := initRedis(ctx, cfg)
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to connect to Redis")
	}
	defer redisClient.Close()
	logger.Info().Msg("Connected to Redis")

	// Initialize repositories
	apiKeyRepo := repository.NewAPIKeyRepository(pool)
	templateRepo := repository.NewTemplateRepository(pool)
	messageRepo := repository.NewMessageRepository(pool)
	webhookRepo := repository.NewWebhookRepository(pool)
	eventRepo := repository.NewEventRepository(pool)
	suppressionRepo := repository.NewSuppressionRepository(pool)
	analyticsRepo := repository.NewAnalyticsRepository(pool)

	// Initialize services
	apiKeyService := service.NewAPIKeyService(apiKeyRepo, logger)
	templateService := service.NewTemplateService(templateRepo, logger)
	webhookService := service.NewWebhookService(cfg, webhookRepo, eventRepo, logger)
	trackingService := service.NewTrackingService(cfg, eventRepo, messageRepo, analyticsRepo, webhookService, logger)
	suppressionService := service.NewSuppressionService(suppressionRepo, logger)
	analyticsService := service.NewAnalyticsService(analyticsRepo, logger)
	senderService := service.NewSenderService(
		cfg,
		messageRepo,
		suppressionRepo,
		templateService,
		trackingService,
		analyticsRepo,
		redisClient,
		logger,
	)

	// Initialize middleware
	apiKeyMiddleware := middleware.NewAPIKeyMiddleware(apiKeyRepo, redisClient, logger)

	// Initialize handler
	h := handler.NewHandler(
		apiKeyService,
		senderService,
		templateService,
		webhookService,
		suppressionService,
		trackingService,
		analyticsService,
		apiKeyMiddleware,
		logger,
	)

	// Setup router
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.RequestLogger(logger))
	r.Use(middleware.RecoveryLogger(logger))
	r.Use(chimiddleware.Timeout(60 * time.Second))

	// CORS configuration
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-API-Key", "X-Request-ID"},
		ExposedHeaders:   []string{"X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Mount API routes
	r.Mount("/", h.Router())

	// Metrics endpoint
	r.Handle("/metrics", promhttp.Handler())

	// Start background workers
	stopChan := make(chan struct{})
	go startQueueWorker(ctx, senderService, logger, stopChan)
	go startSchedulerWorker(ctx, senderService, logger, stopChan)
	go startWebhookWorker(ctx, webhookService, logger, stopChan)
	go startCleanupWorker(ctx, apiKeyService, suppressionService, logger, stopChan)

	// Create HTTP server
	server := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      r,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	// Start server in goroutine
	go func() {
		logger.Info().
			Str("port", cfg.Server.Port).
			Msg("HTTP server started")

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("HTTP server error")
		}
	}()

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info().Msg("Shutting down server...")

	// Stop background workers
	close(stopChan)

	// Graceful shutdown
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.Server.ShutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("Server forced to shutdown")
	}

	logger.Info().Msg("Server stopped")
}

// initDatabase initializes the PostgreSQL connection pool
func initDatabase(ctx context.Context, cfg *config.Config) (*pgxpool.Pool, error) {
	poolConfig, err := pgxpool.ParseConfig(cfg.Database.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	poolConfig.MaxConns = int32(cfg.Database.MaxOpenConns)
	poolConfig.MinConns = int32(cfg.Database.MaxIdleConns)
	poolConfig.MaxConnLifetime = cfg.Database.ConnMaxLifetime

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test connection
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return pool, nil
}

// initRedis initializes the Redis connection
func initRedis(ctx context.Context, cfg *config.Config) (*redis.Client, error) {
	opt, err := redis.ParseURL(cfg.Redis.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	if cfg.Redis.Password != "" {
		opt.Password = cfg.Redis.Password
	}
	opt.DB = cfg.Redis.DB

	client := redis.NewClient(opt)

	// Test connection
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to ping Redis: %w", err)
	}

	return client, nil
}

// startQueueWorker starts the email queue processing worker
func startQueueWorker(ctx context.Context, senderService *service.SenderService, logger zerolog.Logger, stop chan struct{}) {
	logger.Info().Msg("Starting queue worker")

	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			logger.Info().Msg("Queue worker stopped")
			return
		case <-ticker.C:
			if err := senderService.ProcessQueue(ctx); err != nil {
				logger.Error().Err(err).Msg("Error processing queue")
			}
		}
	}
}

// startSchedulerWorker starts the scheduled email processing worker
func startSchedulerWorker(ctx context.Context, senderService *service.SenderService, logger zerolog.Logger, stop chan struct{}) {
	logger.Info().Msg("Starting scheduler worker")

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			logger.Info().Msg("Scheduler worker stopped")
			return
		case <-ticker.C:
			if err := senderService.ProcessScheduledMessages(ctx); err != nil {
				logger.Error().Err(err).Msg("Error processing scheduled messages")
			}
		}
	}
}

// startWebhookWorker starts the webhook processing worker
func startWebhookWorker(ctx context.Context, webhookService *service.WebhookService, logger zerolog.Logger, stop chan struct{}) {
	logger.Info().Msg("Starting webhook worker")

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			logger.Info().Msg("Webhook worker stopped")
			return
		case <-ticker.C:
			if err := webhookService.ProcessPendingEvents(ctx); err != nil {
				logger.Error().Err(err).Msg("Error processing pending events")
			}
			if err := webhookService.RetryFailedDeliveries(ctx); err != nil {
				logger.Error().Err(err).Msg("Error retrying failed deliveries")
			}
		}
	}
}

// startCleanupWorker starts the cleanup worker
func startCleanupWorker(ctx context.Context, apiKeyService *service.APIKeyService, suppressionService *service.SuppressionService, logger zerolog.Logger, stop chan struct{}) {
	logger.Info().Msg("Starting cleanup worker")

	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-stop:
			logger.Info().Msg("Cleanup worker stopped")
			return
		case <-ticker.C:
			if _, err := apiKeyService.CleanupExpired(ctx, 90); err != nil {
				logger.Error().Err(err).Msg("Error cleaning up expired API keys")
			}
			if _, err := suppressionService.CleanupExpired(ctx); err != nil {
				logger.Error().Err(err).Msg("Error cleaning up expired suppressions")
			}
		}
	}
}
