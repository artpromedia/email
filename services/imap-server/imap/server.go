package imap

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"go.uber.org/zap"

	"imap-server/config"
	"imap-server/repository"
)

var (
	activeConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "imap_active_connections",
		Help: "Number of active IMAP connections",
	})
	totalConnections = promauto.NewCounter(prometheus.CounterOpts{
		Name: "imap_total_connections",
		Help: "Total number of IMAP connections",
	})
	commandsProcessed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "imap_commands_total",
		Help: "Total IMAP commands processed",
	}, []string{"command"})
	authAttempts = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "imap_auth_attempts_total",
		Help: "Total authentication attempts",
	}, []string{"method", "result"})
)

// Server represents the IMAP server
type Server struct {
	config     *config.Config
	repo       *repository.Repository
	logger     *zap.Logger
	tlsConfig  *tls.Config
	listener   net.Listener
	tlsListener net.Listener
	
	connections     map[string]*Connection
	connectionsMu   sync.RWMutex
	connectionCount int64
	
	notifyHub      *NotifyHub
	shutdownChan   chan struct{}
	wg             sync.WaitGroup
}

// NewServer creates a new IMAP server
func NewServer(cfg *config.Config, repo *repository.Repository, logger *zap.Logger) (*Server, error) {
	s := &Server{
		config:       cfg,
		repo:         repo,
		logger:       logger,
		connections:  make(map[string]*Connection),
		notifyHub:    NewNotifyHub(logger),
		shutdownChan: make(chan struct{}),
	}

	// Setup TLS if enabled
	if cfg.TLS.Enabled {
		cert, err := tls.LoadX509KeyPair(cfg.TLS.CertFile, cfg.TLS.KeyFile)
		if err != nil {
			return nil, fmt.Errorf("load TLS certificate: %w", err)
		}

		s.tlsConfig = &tls.Config{
			Certificates: []tls.Certificate{cert},
			MinVersion:   tls.VersionTLS12,
		}
	}

	return s, nil
}

// Start starts the IMAP server
func (s *Server) Start() error {
	// Start notification hub
	s.notifyHub.Start()

	// Start plain text listener
	addr := fmt.Sprintf("%s:%d", s.config.Server.Host, s.config.Server.Port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", addr, err)
	}
	s.listener = listener
	s.logger.Info("IMAP server listening", zap.String("addr", addr))

	s.wg.Add(1)
	go s.acceptConnections(listener, false)

	// Start TLS listener if enabled
	if s.tlsConfig != nil {
		tlsAddr := fmt.Sprintf("%s:%d", s.config.Server.Host, s.config.Server.TLSPort)
		tlsListener, err := tls.Listen("tcp", tlsAddr, s.tlsConfig)
		if err != nil {
			return fmt.Errorf("listen TLS on %s: %w", tlsAddr, err)
		}
		s.tlsListener = tlsListener
		s.logger.Info("IMAP TLS server listening", zap.String("addr", tlsAddr))

		s.wg.Add(1)
		go s.acceptConnections(tlsListener, true)
	}

	return nil
}

// Stop stops the IMAP server
func (s *Server) Stop() error {
	close(s.shutdownChan)

	if s.listener != nil {
		s.listener.Close()
	}
	if s.tlsListener != nil {
		s.tlsListener.Close()
	}

	// Close all connections
	s.connectionsMu.Lock()
	for _, conn := range s.connections {
		conn.Close()
	}
	s.connectionsMu.Unlock()

	// Stop notification hub
	s.notifyHub.Stop()

	// Wait for goroutines
	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		s.logger.Info("IMAP server stopped gracefully")
	case <-time.After(30 * time.Second):
		s.logger.Warn("IMAP server shutdown timed out")
	}

	return nil
}

// acceptConnections accepts incoming connections
func (s *Server) acceptConnections(listener net.Listener, isTLS bool) {
	defer s.wg.Done()

	for {
		select {
		case <-s.shutdownChan:
			return
		default:
		}

		conn, err := listener.Accept()
		if err != nil {
			select {
			case <-s.shutdownChan:
				return
			default:
				s.logger.Error("Accept connection failed", zap.Error(err))
				continue
			}
		}

		// Check connection limits
		if atomic.LoadInt64(&s.connectionCount) >= int64(s.config.Server.MaxConnections) {
			s.logger.Warn("Connection limit reached", zap.String("remote", conn.RemoteAddr().String()))
			conn.Write([]byte("* BYE Server busy, try again later\r\n"))
			conn.Close()
			continue
		}

		// Create and handle connection
		imapConn := s.newConnection(conn, isTLS)
		s.registerConnection(imapConn)

		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			defer s.unregisterConnection(imapConn)
			imapConn.Handle()
		}()
	}
}

// newConnection creates a new IMAP connection
func (s *Server) newConnection(conn net.Conn, isTLS bool) *Connection {
	atomic.AddInt64(&s.connectionCount, 1)
	totalConnections.Inc()
	activeConnections.Inc()

	return &Connection{
		id:         generateConnectionID(),
		conn:       conn,
		server:     s,
		config:     s.config,
		repo:       s.repo,
		logger:     s.logger.With(zap.String("conn_id", generateConnectionID())),
		notifyHub:  s.notifyHub,
		ctx: &ConnectionContext{
			TLSEnabled:     isTLS,
			Capabilities:   s.getCapabilities(isTLS),
			ClientAddr:     conn.RemoteAddr().String(),
			ConnectedAt:    time.Now(),
			LastActivityAt: time.Now(),
			NamespaceMode:  NamespaceMode(s.config.IMAP.DefaultNamespaceMode),
		},
		shutdownChan: s.shutdownChan,
	}
}

// registerConnection registers a connection
func (s *Server) registerConnection(conn *Connection) {
	s.connectionsMu.Lock()
	s.connections[conn.id] = conn
	s.connectionsMu.Unlock()
}

// unregisterConnection unregisters a connection
func (s *Server) unregisterConnection(conn *Connection) {
	s.connectionsMu.Lock()
	delete(s.connections, conn.id)
	s.connectionsMu.Unlock()

	atomic.AddInt64(&s.connectionCount, -1)
	activeConnections.Dec()
}

// getCapabilities returns server capabilities
func (s *Server) getCapabilities(isTLS bool) []string {
	caps := make([]string, len(s.config.IMAP.Capabilities))
	copy(caps, s.config.IMAP.Capabilities)

	if !isTLS && s.config.TLS.StartTLS {
		caps = append(caps, "STARTTLS")
	}

	if s.config.IMAP.LiteralPlus {
		caps = append(caps, "LITERAL+")
	}

	if s.config.IMAP.EnableQRESYNC {
		caps = append(caps, "QRESYNC")
	}

	if s.config.IMAP.EnableCONDSTORE {
		caps = append(caps, "CONDSTORE")
	}

	if s.config.IMAP.EnableCompression {
		caps = append(caps, "COMPRESS=DEFLATE")
	}

	return caps
}

// NotifyMailboxChange notifies all connections watching a mailbox
func (s *Server) NotifyMailboxChange(mailboxID string, notification IdleNotification) {
	s.notifyHub.Notify(mailboxID, notification)
}

// GetConnectionCount returns the number of active connections
func (s *Server) GetConnectionCount() int64 {
	return atomic.LoadInt64(&s.connectionCount)
}

// NotifyHub manages IDLE notifications
type NotifyHub struct {
	subscribers map[string]map[string]chan IdleNotification // mailboxID -> connectionID -> channel
	mu          sync.RWMutex
	logger      *zap.Logger
	stopChan    chan struct{}
}

// NewNotifyHub creates a new notification hub
func NewNotifyHub(logger *zap.Logger) *NotifyHub {
	return &NotifyHub{
		subscribers: make(map[string]map[string]chan IdleNotification),
		logger:      logger,
		stopChan:    make(chan struct{}),
	}
}

// Start starts the notification hub
func (h *NotifyHub) Start() {
	// Nothing to start currently, but could add periodic cleanup
}

// Stop stops the notification hub
func (h *NotifyHub) Stop() {
	close(h.stopChan)
}

// Subscribe subscribes a connection to mailbox notifications
func (h *NotifyHub) Subscribe(mailboxID, connectionID string) chan IdleNotification {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.subscribers[mailboxID] == nil {
		h.subscribers[mailboxID] = make(map[string]chan IdleNotification)
	}

	ch := make(chan IdleNotification, 10)
	h.subscribers[mailboxID][connectionID] = ch

	return ch
}

// Unsubscribe unsubscribes a connection from mailbox notifications
func (h *NotifyHub) Unsubscribe(mailboxID, connectionID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if subs, ok := h.subscribers[mailboxID]; ok {
		if ch, ok := subs[connectionID]; ok {
			close(ch)
			delete(subs, connectionID)
		}
		if len(subs) == 0 {
			delete(h.subscribers, mailboxID)
		}
	}
}

// UnsubscribeAll unsubscribes a connection from all mailboxes
func (h *NotifyHub) UnsubscribeAll(connectionID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for mailboxID, subs := range h.subscribers {
		if ch, ok := subs[connectionID]; ok {
			close(ch)
			delete(subs, connectionID)
		}
		if len(subs) == 0 {
			delete(h.subscribers, mailboxID)
		}
	}
}

// Notify sends a notification to all subscribers of a mailbox
func (h *NotifyHub) Notify(mailboxID string, notification IdleNotification) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if subs, ok := h.subscribers[mailboxID]; ok {
		for _, ch := range subs {
			select {
			case ch <- notification:
			default:
				// Channel full, skip
			}
		}
	}
}

// Helper functions

var connectionCounter uint64

func generateConnectionID() string {
	id := atomic.AddUint64(&connectionCounter, 1)
	return fmt.Sprintf("conn-%d-%d", time.Now().Unix(), id)
}
