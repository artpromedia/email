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

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"transactional-api/config"
	"transactional-api/handlers"
	"transactional-api/repository"
	"transactional-api/service"
	apiMiddleware "transactional-api/middleware"
)

func main() {
	configPath := flag.String("config", "config.yaml", "Path to config file")
	flag.Parse()

	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load config: %v\n", err)
		os.Exit(1)
	}

	logger := initLogger(cfg.Server.LogLevel)
	defer logger.Sync()

	logger.Info("Starting Transactional Email API",
		zap.String("version", "1.0.0"),
		zap.String("addr", cfg.Server.Addr))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize database
	dbPool, err := initDatabase(ctx, cfg.Database)
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}
	defer dbPool.Close()

	// Initialize Redis
	redisClient := initRedis(cfg.Redis)
	defer redisClient.Close()

	// Initialize repositories
	apiKeyRepo := repository.NewAPIKeyRepository(dbPool, logger.Named("api-key-repo"))
	emailRepo := repository.NewEmailRepository(dbPool, logger.Named("email-repo"))
	templateRepo := repository.NewTemplateRepository(dbPool, logger.Named("template-repo"))
	webhookRepo := repository.NewWebhookRepository(dbPool, logger.Named("webhook-repo"))
	eventRepo := repository.NewEventRepository(dbPool, logger.Named("event-repo"))
	suppressionRepo := repository.NewSuppressionRepository(dbPool, logger.Named("suppression-repo"))

	// Initialize services
	emailService := service.NewEmailService(cfg, emailRepo, templateRepo, suppressionRepo, redisClient, logger.Named("email-service"))
	webhookService := service.NewWebhookService(webhookRepo, eventRepo, redisClient, logger.Named("webhook-service"))
	analyticsService := service.NewAnalyticsService(eventRepo, emailRepo, logger.Named("analytics-service"))

	// Start webhook dispatcher
	webhookService.StartDispatcher(ctx)

	// Initialize handlers
	sendHandler := handlers.NewSendHandler(emailService, logger.Named("send-handler"))
	templateHandler := handlers.NewTemplateHandler(templateRepo, logger.Named("template-handler"))
	webhookHandler := handlers.NewWebhookHandler(webhookRepo, logger.Named("webhook-handler"))
	analyticsHandler := handlers.NewAnalyticsHandler(analyticsService, logger.Named("analytics-handler"))
	eventHandler := handlers.NewEventHandler(eventRepo, webhookService, logger.Named("event-handler"))
	suppressionHandler := handlers.NewSuppressionHandler(suppressionRepo, logger.Named("suppression-handler"))
	apiKeyHandler := handlers.NewAPIKeyHandler(apiKeyRepo, logger.Named("api-key-handler"))

	// Setup router
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.Server.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-API-Key"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check (no auth required)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy"}`))
	})

	// Metrics endpoint
	r.Handle("/metrics", promhttp.Handler())

	// Webhook receiver (for incoming events from SMTP server)
	r.Post("/internal/events", eventHandler.ReceiveEvent)

	// API v1 routes (requires API key authentication)
	r.Route("/v1", func(r chi.Router) {
		r.Use(apiMiddleware.APIKeyAuth(apiKeyRepo, logger))
		r.Use(apiMiddleware.RateLimit(redisClient, cfg.RateLimit))

		// Send emails
		r.Route("/send", func(r chi.Router) {
			r.Post("/", sendHandler.Send)           // Single email
			r.Post("/batch", sendHandler.SendBatch) // Batch send (up to 1000)
		})

		// Templates
		r.Route("/templates", func(r chi.Router) {
			r.Get("/", templateHandler.List)
			r.Post("/", templateHandler.Create)
			r.Get("/{templateId}", templateHandler.Get)
			r.Put("/{templateId}", templateHandler.Update)
			r.Delete("/{templateId}", templateHandler.Delete)
			r.Get("/{templateId}/versions", templateHandler.ListVersions)
			r.Post("/{templateId}/versions", templateHandler.CreateVersion)
		})

		// Webhooks
		r.Route("/webhooks", func(r chi.Router) {
			r.Get("/", webhookHandler.List)
			r.Post("/", webhookHandler.Create)
			r.Get("/{webhookId}", webhookHandler.Get)
			r.Put("/{webhookId}", webhookHandler.Update)
			r.Delete("/{webhookId}", webhookHandler.Delete)
			r.Post("/{webhookId}/test", webhookHandler.Test)
		})

		// Analytics
		r.Route("/analytics", func(r chi.Router) {
			r.Get("/overview", analyticsHandler.Overview)
			r.Get("/delivery", analyticsHandler.DeliveryStats)
			r.Get("/engagement", analyticsHandler.EngagementStats)
			r.Get("/bounces", analyticsHandler.BounceStats)
			r.Get("/domains", analyticsHandler.DomainStats)
		})

		// Suppressions (bounces, unsubscribes, spam reports)
		r.Route("/suppressions", func(r chi.Router) {
			r.Route("/bounces", func(r chi.Router) {
				r.Get("/", suppressionHandler.ListBounces)
				r.Delete("/{email}", suppressionHandler.RemoveBounce)
			})
			r.Route("/unsubscribes", func(r chi.Router) {
				r.Get("/", suppressionHandler.ListUnsubscribes)
				r.Post("/", suppressionHandler.AddUnsubscribe)
				r.Delete("/{email}", suppressionHandler.RemoveUnsubscribe)
			})
			r.Route("/spam-reports", func(r chi.Router) {
				r.Get("/", suppressionHandler.ListSpamReports)
				r.Delete("/{email}", suppressionHandler.RemoveSpamReport)
			})
		})

		// Events (for retrieving delivery events)
		r.Route("/events", func(r chi.Router) {
			r.Get("/", eventHandler.List)
			r.Get("/{messageId}", eventHandler.GetByMessageID)
		})

		// API Keys (self-service)
		r.Route("/api-keys", func(r chi.Router) {
			r.Get("/", apiKeyHandler.List)
			r.Post("/", apiKeyHandler.Create)
			r.Delete("/{keyId}", apiKeyHandler.Revoke)
		})
	})

	// Start HTTP server
	server := &http.Server{
		Addr:         cfg.Server.Addr,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		logger.Info("Starting HTTP server", zap.String("addr", cfg.Server.Addr))
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			logger.Fatal("HTTP server error", zap.Error(err))
		}
	}()

	// Wait for shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.Info("Shutting down...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("HTTP server shutdown error", zap.Error(err))
	}

	logger.Info("Shutdown complete")
}

func initLogger(level string) *zap.Logger {
	var zapLevel zapcore.Level
	switch level {
	case "debug":
		zapLevel = zapcore.DebugLevel
	case "warn":
		zapLevel = zapcore.WarnLevel
	case "error":
		zapLevel = zapcore.ErrorLevel
	default:
		zapLevel = zapcore.InfoLevel
	}

	config := zap.NewProductionConfig()
	config.Level = zap.NewAtomicLevelAt(zapLevel)
	config.OutputPaths = []string{"stdout"}

	logger, _ := config.Build()
	return logger
}

func initDatabase(ctx context.Context, cfg config.DatabaseConfig) (*pgxpool.Pool, error) {
	poolConfig, err := pgxpool.ParseConfig(cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}

	poolConfig.MaxConns = int32(cfg.MaxConns)
	poolConfig.MinConns = int32(cfg.MinConns)

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}

func initRedis(cfg config.RedisConfig) *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})
}
