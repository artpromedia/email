package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	"chat/config"
	"chat/internal/hub"
	"chat/internal/repository"
)

// Server represents the API server
type Server struct {
	cfg    *config.Config
	repo   *repository.Repository
	hub    *hub.Hub
	logger *zap.Logger
}

// NewServer creates a new API server
func NewServer(cfg *config.Config, repo *repository.Repository, hub *hub.Hub, logger *zap.Logger) *Server {
	return &Server{
		cfg:    cfg,
		repo:   repo,
		hub:    hub,
		logger: logger,
	}
}

// Router returns the HTTP router
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", s.healthCheck)

	// WebSocket endpoint
	r.Get("/ws", s.handleWebSocket)

	// API routes
	r.Route("/api/v1", func(r chi.Router) {
		// Auth middleware
		r.Use(s.authMiddleware)

		// Channels
		r.Route("/channels", func(r chi.Router) {
			r.Get("/", s.listChannels)
			r.Post("/", s.createChannel)
			r.Get("/joined", s.listJoinedChannels)

			r.Route("/{channelID}", func(r chi.Router) {
				r.Get("/", s.getChannel)
				r.Put("/", s.updateChannel)
				r.Delete("/", s.deleteChannel)

				// Messages
				r.Get("/messages", s.listMessages)
				r.Post("/messages", s.createMessage)
				r.Get("/messages/pinned", s.getPinnedMessages)

				// Members
				r.Get("/members", s.listMembers)
				r.Post("/members", s.addMember)
				r.Delete("/members/{userID}", s.removeMember)

				// Actions
				r.Post("/join", s.joinChannel)
				r.Post("/leave", s.leaveChannel)
				r.Post("/read", s.markAsRead)
			})
		})

		// Direct messages
		r.Route("/dm", func(r chi.Router) {
			r.Post("/", s.createDirectMessage)
			r.Get("/{userID}", s.getDirectMessages)
		})

		// Messages
		r.Route("/messages/{messageID}", func(r chi.Router) {
			r.Get("/", s.getMessage)
			r.Put("/", s.updateMessage)
			r.Delete("/", s.deleteMessage)
			r.Post("/pin", s.pinMessage)
			r.Delete("/pin", s.unpinMessage)

			// Reactions
			r.Post("/reactions", s.addReaction)
			r.Delete("/reactions/{emoji}", s.removeReaction)

			// Thread
			r.Get("/thread", s.getThread)
			r.Post("/thread", s.replyToThread)
		})

		// Users
		r.Route("/users", func(r chi.Router) {
			r.Get("/", s.listUsers)
			r.Get("/presence", s.getPresence)
			r.Put("/status", s.updateStatus)
			r.Get("/{userID}", s.getUser)
		})

		// Search
		r.Get("/search", s.search)

		// File upload
		r.Post("/upload", s.uploadFile)
	})

	return r
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Configure properly in production
	},
}

func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"healthy","service":"chat"}`))
}
