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
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"

	"domain-manager/config"
	"domain-manager/handler"
	"domain-manager/monitor"
	"domain-manager/repository"
	"domain-manager/service"
)

func main() {
	// Initialize logger
	logger, err := zap.NewProduction()
	if err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	// Load configuration
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "config.yaml"
	}

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		logger.Fatal("Failed to load configuration", zap.Error(err))
	}

	// Connect to database
	dbURL := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		cfg.Database.Username,
		cfg.Database.Password,
		cfg.Database.Host,
		cfg.Database.Port,
		cfg.Database.Database,
		cfg.Database.SSLMode,
	)

	poolConfig, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		logger.Fatal("Failed to parse database URL", zap.Error(err))
	}

	poolConfig.MaxConns = int32(cfg.Database.MaxConnections)
	poolConfig.MinConns = int32(cfg.Database.MinConnections)
	poolConfig.MaxConnLifetime = cfg.Database.MaxLifetime
	poolConfig.MaxConnIdleTime = cfg.Database.IdleTimeout

	db, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}
	defer db.Close()

	// Verify database connection
	if err := db.Ping(context.Background()); err != nil {
		logger.Fatal("Failed to ping database", zap.Error(err))
	}
	logger.Info("Connected to database")

	// Initialize repositories
	domainRepo := repository.NewDomainRepository(db, logger)
	dkimRepo := repository.NewDKIMKeyRepository(db, logger)
	brandingRepo := repository.NewBrandingRepository(db, logger)
	policiesRepo := repository.NewPoliciesRepository(db, logger)
	catchAllRepo := repository.NewCatchAllRepository(db, logger)
	statsRepo := repository.NewStatsRepository(db, logger)

	// Initialize services
	dnsService := service.NewDNSService(&cfg.DNS, logger)
	dkimService := service.NewDKIMService(&cfg.DKIM, &cfg.DNS, logger)

	// Initialize handlers
	domainHandler := handler.NewDomainHandler(
		domainRepo, dkimRepo, brandingRepo, policiesRepo, catchAllRepo, statsRepo,
		dnsService, dkimService, logger,
	)
	publicHandler := handler.NewPublicHandler(domainRepo, brandingRepo, logger)

	// Initialize DNS monitor
	dnsMonitor := monitor.NewDNSMonitor(domainRepo, dkimRepo, dnsService, &cfg.Monitor, logger)

	// Start DNS monitor
	if err := dnsMonitor.Start(); err != nil {
		logger.Fatal("Failed to start DNS monitor", zap.Error(err))
	}

	// Process DNS alerts in background
	go func() {
		for alert := range dnsMonitor.Alerts() {
			// In production, this would send notifications (email, webhook, etc.)
			logger.Warn("DNS Alert",
				zap.String("domain", alert.DomainName),
				zap.String("type", alert.AlertType),
				zap.String("severity", alert.Severity),
				zap.String("message", alert.Message),
			)
		}
	}()

	// Setup router
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.Server.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"healthy"}`))
	})

	// Metrics endpoint
	if cfg.Metrics.Enabled {
		r.Handle("/metrics", promhttp.Handler())
	}

	// API routes
	r.Route("/api", func(r chi.Router) {
		// Admin routes (require authentication in production)
		r.Route("/admin/domains", func(r chi.Router) {
			r.Mount("/", domainHandler.Routes())
		})

		// Public routes
		r.Route("/domains", func(r chi.Router) {
			r.Mount("/", publicHandler.Routes())
		})
	})

	// Create HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      r,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// Start server
	go func() {
		logger.Info("Starting Domain Manager service",
			zap.Int("port", cfg.Server.Port),
		)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed", zap.Error(err))
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Stop DNS monitor
	dnsMonitor.Stop()

	// Shutdown server with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited properly")
}
