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
	"github.com/go-chi/cors"
	"github.com/go-redis/redis/v8"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/oonrumail/ai-assistant/analysis"
	"github.com/oonrumail/ai-assistant/config"
	"github.com/oonrumail/ai-assistant/embedding"
	"github.com/oonrumail/ai-assistant/handlers"
	"github.com/oonrumail/ai-assistant/provider"
	"github.com/oonrumail/ai-assistant/ratelimit"
)

func main() {
	// Setup logging
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if os.Getenv("ENVIRONMENT") == "development" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}

	logger := log.With().Str("service", "ai-assistant").Logger()
	logger.Info().Msg("Starting AI Assistant Service")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to load configuration")
	}

	// Initialize context
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

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

	// Initialize provider router
	routerCfg := provider.RouterConfig{
		FallbackChain:             cfg.Providers.FallbackChain,
		DefaultAnalysisProvider:   cfg.Providers.DefaultAnalysisProvider,
		DefaultEmbeddingProvider:  cfg.Providers.DefaultEmbeddingProvider,
		DefaultSmartReplyProvider: cfg.Providers.DefaultSmartReplyProvider,
	}
	providerRouter := provider.NewRouter(routerCfg, logger)

	// Register providers
	if cfg.Providers.OpenAI.Enabled && cfg.Providers.OpenAI.APIKey != "" {
		openaiProvider := provider.NewOpenAIProvider(provider.OpenAIConfig{
			APIKey:         cfg.Providers.OpenAI.APIKey,
			Organization:   cfg.Providers.OpenAI.Organization,
			BaseURL:        cfg.Providers.OpenAI.BaseURL,
			Model:          cfg.Providers.OpenAI.Model,
			EmbeddingModel: cfg.Providers.OpenAI.EmbeddingModel,
			MaxTokens:      cfg.Providers.OpenAI.MaxTokens,
			Temperature:    cfg.Providers.OpenAI.Temperature,
			Timeout:        cfg.Providers.RequestTimeout,
		}, logger)
		providerRouter.RegisterProvider(openaiProvider)
		logger.Info().Msg("Registered OpenAI provider")
	}

	if cfg.Providers.Anthropic.Enabled && cfg.Providers.Anthropic.APIKey != "" {
		anthropicProvider := provider.NewAnthropicProvider(provider.AnthropicConfig{
			APIKey:      cfg.Providers.Anthropic.APIKey,
			BaseURL:     cfg.Providers.Anthropic.BaseURL,
			Model:       cfg.Providers.Anthropic.Model,
			MaxTokens:   cfg.Providers.Anthropic.MaxTokens,
			Temperature: cfg.Providers.Anthropic.Temperature,
			Timeout:     cfg.Providers.RequestTimeout,
		}, logger)
		providerRouter.RegisterProvider(anthropicProvider)
		logger.Info().Msg("Registered Anthropic provider")
	}

	if cfg.Providers.Ollama.Enabled {
		ollamaProvider := provider.NewOllamaProvider(provider.OllamaConfig{
			BaseURL:        cfg.Providers.Ollama.BaseURL,
			Model:          cfg.Providers.Ollama.Model,
			EmbeddingModel: cfg.Providers.Ollama.EmbeddingModel,
			Timeout:        cfg.Providers.RequestTimeout,
		}, logger)
		providerRouter.RegisterProvider(ollamaProvider)
		logger.Info().Msg("Registered Ollama provider")
	}

	// Start health checker
	providerRouter.StartHealthChecker(ctx, 30*time.Second)

	// Initialize rate limiter
	limiterCfg := ratelimit.LimiterConfig{
		OrgTokensPerMin:    cfg.RateLimit.OrgTokensPerMinute,
		OrgRequestsPerMin:  cfg.RateLimit.OrgRequestsPerMinute,
		UserTokensPerMin:   cfg.RateLimit.UserTokensPerMinute,
		UserRequestsPerMin: cfg.RateLimit.UserRequestsPerMinute,
		BurstMultiplier:    cfg.RateLimit.BurstMultiplier,
		DegradeThreshold:   cfg.RateLimit.DegradationThreshold,
	}
	rateLimiter := ratelimit.NewLimiter(redisClient, limiterCfg, logger)
	logger.Info().Msg("Initialized rate limiter")

	// Initialize analysis service
	analysisCfg := analysis.ServiceConfig{
		CacheTTL:   cfg.Cache.AnalysisTTL,
		MaxBodyLen: cfg.Analysis.MaxBodyLength,
	}
	analysisSvc := analysis.NewService(providerRouter, redisClient, analysisCfg, logger)
	logger.Info().Msg("Initialized analysis service")

	// Initialize embedding service
	embeddingCfg := embedding.ServiceConfig{
		CacheTTL:      cfg.Cache.EmbeddingTTL,
		MaxTextLen:    cfg.Embedding.MaxTextLength,
		BatchSize:     cfg.Embedding.BatchSize,
		MaxConcurrent: cfg.Embedding.MaxConcurrent,
	}
	embeddingSvc := embedding.NewService(providerRouter, redisClient, embeddingCfg, logger)
	logger.Info().Msg("Initialized embedding service")

	// Initialize HTTP handler
	handler := handlers.NewHandler(providerRouter, analysisSvc, embeddingSvc, rateLimiter, logger)

	// Setup HTTP server
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Metrics endpoint
	r.Handle("/metrics", promhttp.Handler())

	// API routes
	r.Mount("/", handler.Routes())

	// Create server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server
	go func() {
		logger.Info().Str("port", cfg.Port).Msg("Starting HTTP server")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("HTTP server failed")
		}
	}()

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info().Msg("Shutting down server...")

	// Graceful shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("Server forced to shutdown")
	}

	logger.Info().Msg("Server exited")
}
