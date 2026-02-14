package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"contacts-service/carddav"
	"contacts-service/config"
	"contacts-service/handlers"
	"contacts-service/repository"
	"contacts-service/service"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

func main() {
	configPath := flag.String("config", "config.yaml", "Path to config file")
	flag.Parse()

	// Load configuration
	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Printf("Failed to load config: %v\n", err)
		os.Exit(1)
	}

	// Setup logger
	var logger *zap.Logger
	if cfg.Server.Debug {
		logger, _ = zap.NewDevelopment()
	} else {
		logger, _ = zap.NewProduction()
	}
	defer logger.Sync()

	// Database connection
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.Database.URL)
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}
	defer pool.Close()

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		logger.Fatal("Failed to ping database", zap.Error(err))
	}
	logger.Info("Connected to database")

	// Initialize repositories
	contactRepo := repository.NewContactRepository(pool)
	groupRepo := repository.NewGroupRepository(pool)
	addressBookRepo := repository.NewAddressBookRepository(pool)

	// Initialize services
	contactService := service.NewContactService(contactRepo, groupRepo, addressBookRepo, logger)

	// Initialize handlers
	contactHandler := handlers.NewContactHandler(contactService, logger)
	authMiddleware := handlers.NewAuthMiddleware(cfg.Auth.JWTSecret)
	cardDAVHandler := carddav.NewCardDAVHandler(contactService, logger, cfg.Server.Domain)

	// Basic auth validator (for CardDAV clients) — validates via auth service
	authServiceURL := os.Getenv("AUTH_SERVICE_URL")
	if authServiceURL == "" {
		authServiceURL = "http://auth:8080"
	}
	authHTTPClient := &http.Client{Timeout: 5 * time.Second}

	validateBasicAuth := func(username, password string) (uuid.UUID, error) {
		if username == "" || password == "" {
			return uuid.Nil, fmt.Errorf("empty credentials")
		}

		loginBody := fmt.Sprintf(`{"email":%q,"password":%q}`, username, password)
		req, err := http.NewRequest("POST", authServiceURL+"/api/auth/login", strings.NewReader(loginBody))
		if err != nil {
			return uuid.Nil, fmt.Errorf("create request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := authHTTPClient.Do(req)
		if err != nil {
			return uuid.Nil, fmt.Errorf("auth service unavailable: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			_, _ = io.ReadAll(io.LimitReader(resp.Body, 1024))
			return uuid.Nil, fmt.Errorf("invalid credentials")
		}

		var result struct {
			User struct {
				ID string `json:"id"`
			} `json:"user"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return uuid.Nil, fmt.Errorf("decode response: %w", err)
		}

		userID, err := uuid.Parse(result.User.ID)
		if err != nil {
			return uuid.Nil, fmt.Errorf("parse user ID: %w", err)
		}

		return userID, nil
	}

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
		AllowedOrigins:   cfg.Server.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "PROPFIND", "PROPPATCH", "REPORT", "MKCOL"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Depth", "If-Match", "If-None-Match"},
		ExposedHeaders:   []string{"ETag", "Location"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Metrics
	r.Handle("/metrics", promhttp.Handler())

	// CardDAV routes (supports Basic Auth for native clients)
	r.Route("/carddav", func(r chi.Router) {
		r.Use(authMiddleware.CombinedAuth(validateBasicAuth))
		r.HandleFunc("/*", cardDAVHandler.ServeHTTP)
	})

	// REST API routes
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(authMiddleware.JWTAuth)

		// Address Books
		r.Route("/addressbooks", func(r chi.Router) {
			r.Get("/", contactHandler.ListAddressBooks)
			r.Post("/", contactHandler.CreateAddressBook)
			r.Get("/{id}", contactHandler.GetAddressBook)
			r.Put("/{id}", contactHandler.UpdateAddressBook)
			r.Delete("/{id}", contactHandler.DeleteAddressBook)
			r.Post("/{id}/share", contactHandler.ShareAddressBook)
		})

		// Contacts
		r.Route("/contacts", func(r chi.Router) {
			r.Get("/", contactHandler.ListContacts)
			r.Post("/", contactHandler.CreateContact)
			r.Get("/search", contactHandler.SearchContacts)
			r.Post("/import", contactHandler.ImportContacts)
			r.Get("/export", contactHandler.ExportContacts)
			r.Get("/duplicates", contactHandler.FindDuplicates)
			r.Post("/merge", contactHandler.MergeContacts)
			r.Get("/{id}", contactHandler.GetContact)
			r.Put("/{id}", contactHandler.UpdateContact)
			r.Delete("/{id}", contactHandler.DeleteContact)
			r.Post("/{id}/photo", contactHandler.UploadPhoto)
		})

		// Groups
		r.Route("/groups", func(r chi.Router) {
			r.Get("/", contactHandler.ListGroups)
			r.Post("/", contactHandler.CreateGroup)
			r.Get("/{id}", contactHandler.GetGroup)
			r.Put("/{id}", contactHandler.UpdateGroup)
			r.Delete("/{id}", contactHandler.DeleteGroup)
			r.Post("/{id}/contacts", contactHandler.AddContactsToGroup)
			r.Delete("/{id}/contacts/{contactId}", contactHandler.RemoveContactFromGroup)
		})
	})

	// Start server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:           r,
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1MB
	}

	// Graceful shutdown
	go func() {
		logger.Info("Starting Contacts Service",
			zap.Int("port", cfg.Server.Port))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed", zap.Error(err))
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server stopped")
}
