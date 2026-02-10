// Package main is the entry point for the auth service.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/artpromedia/email/services/auth/internal/config"
	"github.com/artpromedia/email/services/auth/internal/handler"
	"github.com/artpromedia/email/services/auth/internal/middleware"
	"github.com/artpromedia/email/services/auth/internal/repository"
	"github.com/artpromedia/email/services/auth/internal/service"
	"github.com/artpromedia/email/services/auth/internal/token"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func main() {
	// Initialize logger
	initLogger()

	// Load configuration
	cfg := config.Load()

	log.Info().
		Str("environment", cfg.Server.Environment).
		Int("port", cfg.Server.Port).
		Msg("Starting auth service")

	// Connect to PostgreSQL
	dbPool, err := initDatabase(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer dbPool.Close()

	// Connect to Redis
	redisClient, err := initRedis(cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to Redis")
	}
	defer redisClient.Close()

	// Initialize repository
	repo := repository.New(dbPool)

	// Initialize token service
	tokenService := token.NewService(&cfg.JWT)

	// Initialize services
	authService := service.NewAuthService(repo, tokenService, cfg)
	ssoService := service.NewSSOService(repo, redisClient, authService, cfg)
	adminService := service.NewAdminService(repo, redisClient, cfg)

	// Initialize handlers
	authHandler := handler.NewAuthHandler(authService)
	ssoHandler := handler.NewSSOHandler(ssoService, authService)
	adminHandler := handler.NewAdminHandler(adminService)

	// Initialize middleware
	authMiddleware := middleware.NewAuthMiddleware(tokenService, repo)

	// Create router
	router := createRouter(cfg, authHandler, ssoHandler, adminHandler, authMiddleware, dbPool, redisClient)

	// Create HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// Start server in goroutine
	go func() {
		log.Info().Msgf("Server listening on port %d", cfg.Server.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Server failed to start")
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("Server stopped")
}

func initLogger() {
	// Set up zerolog
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	// Use pretty logging in development
	if os.Getenv("APP_ENV") == "development" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}

	// Set log level
	level := os.Getenv("LOG_LEVEL")
	switch level {
	case "debug":
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	case "info":
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	case "warn":
		zerolog.SetGlobalLevel(zerolog.WarnLevel)
	case "error":
		zerolog.SetGlobalLevel(zerolog.ErrorLevel)
	default:
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}
}

func initDatabase(cfg *config.Config) (*pgxpool.Pool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Build connection string from config
	connStr := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Database.Host,
		cfg.Database.Port,
		cfg.Database.User,
		cfg.Database.Password,
		cfg.Database.Database,
		cfg.Database.SSLMode,
	)

	poolConfig, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database config: %w", err)
	}

	poolConfig.MaxConns = int32(cfg.Database.MaxOpenConns)
	poolConfig.MinConns = int32(cfg.Database.MaxIdleConns)
	poolConfig.MaxConnLifetime = cfg.Database.MaxLifetime

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test connection
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Info().Msg("Connected to PostgreSQL")
	return pool, nil
}

func initRedis(cfg *config.Config) (*redis.Client, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", cfg.Redis.Host, cfg.Redis.Port),
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})

	// Test connection
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to ping Redis: %w", err)
	}

	log.Info().Msg("Connected to Redis")
	return client, nil
}

func createRouter(
	cfg *config.Config,
	authHandler *handler.AuthHandler,
	ssoHandler *handler.SSOHandler,
	adminHandler *handler.AdminHandler,
	authMiddleware *middleware.AuthMiddleware,
	dbPool *pgxpool.Pool,
	redisClient *redis.Client,
) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.RequestID)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Timeout(60 * time.Second))

	// CORS configuration
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.Security.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID", "X-Domain-ID"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check endpoints
	r.Get("/health", healthCheck)
	r.Get("/ready", makeReadinessCheck(dbPool, redisClient))

	// API routes
	r.Route("/api/auth", func(r chi.Router) {
		authHandler.RegisterRoutes(r, authMiddleware)
		ssoHandler.RegisterRoutes(r, authMiddleware)
	})

	// Admin routes
	r.Route("/api/admin", func(r chi.Router) {
		adminHandler.RegisterRoutes(r, authMiddleware)
	})

	// API documentation
	r.Get("/api/docs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"openapi":"3.0.0","info":{"title":"Auth Service API","version":"1.0.0"}}`))
	})

	return r
}

func healthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"healthy","service":"auth"}`))
}

func readinessCheck(w http.ResponseWriter, r *http.Request) {
	// This is overridden by makeReadinessCheck
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ready","service":"auth"}`))
}

// makeReadinessCheck creates a readiness check handler with dependencies
func makeReadinessCheck(dbPool *pgxpool.Pool, redisClient *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		checks := map[string]string{
			"database": "ok",
			"redis":    "ok",
		}
		allHealthy := true

		// Check database connectivity
		if err := dbPool.Ping(ctx); err != nil {
			checks["database"] = fmt.Sprintf("error: %v", err)
			allHealthy = false
			log.Error().Err(err).Msg("Database health check failed")
		}

		// Check Redis connectivity
		if err := redisClient.Ping(ctx).Err(); err != nil {
			checks["redis"] = fmt.Sprintf("error: %v", err)
			allHealthy = false
			log.Error().Err(err).Msg("Redis health check failed")
		}

		w.Header().Set("Content-Type", "application/json")

		response := map[string]interface{}{
			"service": "auth",
			"checks":  checks,
		}

		if allHealthy {
			response["status"] = "ready"
			w.WriteHeader(http.StatusOK)
		} else {
			response["status"] = "not_ready"
			w.WriteHeader(http.StatusServiceUnavailable)
		}

		jsonBytes, _ := json.Marshal(response)
		w.Write(jsonBytes)
	}
}
