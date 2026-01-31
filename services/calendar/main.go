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
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"calendar-service/caldav"
	"calendar-service/config"
	"calendar-service/handlers"
	"calendar-service/repository"
	"calendar-service/service"
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

	logger.Info("Starting Calendar Service",
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

	// Initialize repositories
	calendarRepo := repository.NewCalendarRepository(dbPool, logger.Named("calendar-repo"))
	eventRepo := repository.NewEventRepository(dbPool, logger.Named("event-repo"))
	attendeeRepo := repository.NewAttendeeRepository(dbPool, logger.Named("attendee-repo"))

	// Initialize services
	calendarService := service.NewCalendarService(calendarRepo, eventRepo, attendeeRepo, logger.Named("calendar-service"))
	notificationService := service.NewNotificationService(cfg, logger.Named("notification-service"))

	// Start reminder processor
	notificationService.StartReminderProcessor(ctx, eventRepo)

	// Initialize handlers
	calendarHandler := handlers.NewCalendarHandler(calendarService, logger.Named("calendar-handler"))
	eventHandler := handlers.NewEventHandler(calendarService, logger.Named("event-handler"))

	// Initialize CalDAV handler
	caldavHandler := caldav.NewHandler(calendarService, logger.Named("caldav"))

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
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "PROPFIND", "PROPPATCH", "MKCALENDAR", "REPORT", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Depth", "If-Match", "If-None-Match"},
		ExposedHeaders:   []string{"ETag", "DAV"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy"}`))
	})

	// Metrics
	r.Handle("/metrics", promhttp.Handler())

	// CalDAV endpoints (RFC 4791)
	r.Route("/caldav", func(r chi.Router) {
		r.Use(caldavHandler.AuthMiddleware)
		r.HandleFunc("/*", caldavHandler.ServeHTTP)
	})

	// REST API for calendar management
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(handlers.AuthMiddleware)

		// Calendars
		r.Route("/calendars", func(r chi.Router) {
			r.Get("/", calendarHandler.List)
			r.Post("/", calendarHandler.Create)
			r.Get("/{calendarId}", calendarHandler.Get)
			r.Put("/{calendarId}", calendarHandler.Update)
			r.Delete("/{calendarId}", calendarHandler.Delete)
			r.Post("/{calendarId}/share", calendarHandler.Share)
			r.Delete("/{calendarId}/share/{userId}", calendarHandler.Unshare)
		})

		// Events
		r.Route("/events", func(r chi.Router) {
			r.Get("/", eventHandler.List)
			r.Post("/", eventHandler.Create)
			r.Get("/{eventId}", eventHandler.Get)
			r.Put("/{eventId}", eventHandler.Update)
			r.Delete("/{eventId}", eventHandler.Delete)
			r.Post("/{eventId}/respond", eventHandler.Respond)
			r.Get("/search", eventHandler.Search)
			r.Get("/freebusy", eventHandler.FreeBusy)
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
