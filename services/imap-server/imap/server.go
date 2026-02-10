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

	"github.com/oonrumail/imap-server/config"
	"github.com/oonrumail/imap-server/repository"
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

	// IDLE notification metrics
	idleNotificationsSent = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "imap_idle_notifications_sent_total",
		Help: "Total IDLE notifications sent",
	}, []string{"mailbox_id", "type"})
	idleNotificationsDropped = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "imap_idle_notifications_dropped_total",
		Help: "Total IDLE notifications dropped due to full channels",
	}, []string{"mailbox_id"})
	idleSubscriptionsActive = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "imap_idle_subscriptions_active",
		Help: "Number of active IDLE subscriptions per mailbox",
	}, []string{"mailbox_id"})
	idleStuckConnections = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "imap_idle_stuck_connections_total",
		Help: "Total stuck IDLE connections detected",
	}, []string{"mailbox_id"})
)

// Server represents the IMAP server
type Server struct {
	config          *config.Config
	repo            *repository.Repository
	logger          *zap.Logger
	tlsConfig       *tls.Config
	listener        net.Listener
	tlsListener     net.Listener
	oauth2Validator *OAuth2Validator

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
			MinVersion:   tls.VersionTLS13,
			CurvePreferences: []tls.CurveID{
				tls.X25519,
				tls.CurveP384,
				tls.CurveP256,
			},
		}
	}

	return s, nil
}

// SetOAuth2Config configures OAuth2 authentication support
func (s *Server) SetOAuth2Config(oauth2Config *OAuth2Config) {
	if oauth2Config != nil && oauth2Config.Enabled {
		s.oauth2Validator = NewOAuth2Validator(oauth2Config, s.logger.Named("oauth2"))
		s.logger.Info("OAuth2 authentication enabled",
			zap.Any("providers", oauth2Config.AllowedProviders))
	}
}

// SupportsOAuth2 returns true if OAuth2 authentication is enabled
func (s *Server) SupportsOAuth2() bool {
	return s.oauth2Validator != nil && s.oauth2Validator.config.Enabled
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
		id:              generateConnectionID(),
		conn:            conn,
		server:          s,
		config:          s.config,
		repo:            s.repo,
		logger:          s.logger.With(zap.String("conn_id", generateConnectionID())),
		notifyHub:       s.notifyHub,
		oauth2Validator: s.oauth2Validator,
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

	if s.config.IMAP.EnableThread {
		caps = append(caps, "THREAD=ORDEREDSUBJECT", "THREAD=REFERENCES")
	}

	// Add OAuth2 capabilities if enabled
	if s.oauth2Validator != nil && s.oauth2Validator.config.Enabled {
		caps = append(caps, "AUTH=XOAUTH2", "AUTH=OAUTHBEARER")
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

// NotifyHub manages IDLE notifications with improved reliability
type NotifyHub struct {
	subscribers     map[string]map[string]*NotifySubscription // mailboxID -> connectionID -> subscription
	mu              sync.RWMutex
	logger          *zap.Logger
	stopChan        chan struct{}
	redis           RedisClient // For cross-instance notifications
	instanceID      string
	coalescingDelay time.Duration
	watchdogTicker  *time.Ticker
}

// NotifySubscription represents a subscription to mailbox notifications
type NotifySubscription struct {
	Channel       chan IdleNotification
	ConnectionID  string
	MailboxID     string
	CreatedAt     time.Time
	LastActivity  time.Time
	DroppedCount  int64 // Track dropped notifications for metrics
	CoalesceTimer *time.Timer
	PendingNotifs []IdleNotification // Buffer for coalescing
	mu            sync.Mutex
}

// RedisClient interface for Redis operations (allows mocking)
type RedisClient interface {
	Publish(ctx context.Context, channel string, message interface{}) error
	Subscribe(ctx context.Context, channels ...string) (<-chan string, error)
}

// NotifyHubConfig holds configuration for NotifyHub
type NotifyHubConfig struct {
	ChannelBufferSize  int           // Buffer size for notification channels
	CoalescingDelay    time.Duration // Delay for coalescing rapid notifications
	WatchdogInterval   time.Duration // Interval for checking stuck connections
	IdleTimeout        time.Duration // Max time for an IDLE connection
	MaxDroppedWarnings int64         // Max dropped notifications before warning client
}

// DefaultNotifyHubConfig returns sensible defaults
func DefaultNotifyHubConfig() NotifyHubConfig {
	return NotifyHubConfig{
		ChannelBufferSize:  100,          // Increased from 10 to handle bursts
		CoalescingDelay:    100 * time.Millisecond,
		WatchdogInterval:   30 * time.Second,
		IdleTimeout:        30 * time.Minute,
		MaxDroppedWarnings: 10,
	}
}

// NewNotifyHub creates a new notification hub
func NewNotifyHub(logger *zap.Logger) *NotifyHub {
	return NewNotifyHubWithConfig(logger, DefaultNotifyHubConfig(), nil)
}

// NewNotifyHubWithConfig creates a notification hub with custom configuration
func NewNotifyHubWithConfig(logger *zap.Logger, config NotifyHubConfig, redis RedisClient) *NotifyHub {
	h := &NotifyHub{
		subscribers:     make(map[string]map[string]*NotifySubscription),
		logger:          logger,
		stopChan:        make(chan struct{}),
		redis:           redis,
		instanceID:      generateInstanceID(),
		coalescingDelay: config.CoalescingDelay,
	}

	return h
}

// generateInstanceID creates a unique identifier for this IMAP server instance
func generateInstanceID() string {
	return fmt.Sprintf("imap-%d-%d", time.Now().UnixNano(), atomic.AddUint64(&connectionCounter, 1))
}

// Start starts the notification hub including watchdog and Redis subscriber
func (h *NotifyHub) Start() {
	// Start watchdog for stuck connections
	h.watchdogTicker = time.NewTicker(30 * time.Second)
	go h.runWatchdog()

	// Start Redis subscriber for cross-instance notifications if configured
	if h.redis != nil {
		go h.runRedisSubscriber()
	}

	h.logger.Info("NotifyHub started",
		zap.String("instance_id", h.instanceID),
		zap.Bool("redis_enabled", h.redis != nil))
}

// Stop stops the notification hub
func (h *NotifyHub) Stop() {
	close(h.stopChan)
	if h.watchdogTicker != nil {
		h.watchdogTicker.Stop()
	}
}

// Subscribe subscribes a connection to mailbox notifications with improved buffering
func (h *NotifyHub) Subscribe(mailboxID, connectionID string) chan IdleNotification {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.subscribers[mailboxID] == nil {
		h.subscribers[mailboxID] = make(map[string]*NotifySubscription)
	}

	// Create subscription with larger buffer
	ch := make(chan IdleNotification, 100) // Increased buffer size
	sub := &NotifySubscription{
		Channel:       ch,
		ConnectionID:  connectionID,
		MailboxID:     mailboxID,
		CreatedAt:     time.Now(),
		LastActivity:  time.Now(),
		DroppedCount:  0,
		PendingNotifs: make([]IdleNotification, 0, 10),
	}
	h.subscribers[mailboxID][connectionID] = sub

	idleSubscriptionsActive.WithLabelValues(mailboxID).Inc()

	h.logger.Debug("Connection subscribed to mailbox notifications",
		zap.String("mailbox_id", mailboxID),
		zap.String("connection_id", connectionID))

	return ch
}

// Unsubscribe unsubscribes a connection from mailbox notifications
func (h *NotifyHub) Unsubscribe(mailboxID, connectionID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if subs, ok := h.subscribers[mailboxID]; ok {
		if sub, ok := subs[connectionID]; ok {
			// Log dropped count for metrics before cleanup
			if sub.DroppedCount > 0 {
				idleNotificationsDropped.WithLabelValues(mailboxID).Add(float64(sub.DroppedCount))
				h.logger.Warn("Notifications were dropped during subscription",
					zap.String("mailbox_id", mailboxID),
					zap.String("connection_id", connectionID),
					zap.Int64("dropped_count", sub.DroppedCount))
			}

			// Cancel any pending coalesce timer
			sub.mu.Lock()
			if sub.CoalesceTimer != nil {
				sub.CoalesceTimer.Stop()
			}
			sub.mu.Unlock()

			close(sub.Channel)
			delete(subs, connectionID)
			idleSubscriptionsActive.WithLabelValues(mailboxID).Dec()
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
		if sub, ok := subs[connectionID]; ok {
			if sub.DroppedCount > 0 {
				idleNotificationsDropped.WithLabelValues(mailboxID).Add(float64(sub.DroppedCount))
			}

			sub.mu.Lock()
			if sub.CoalesceTimer != nil {
				sub.CoalesceTimer.Stop()
			}
			sub.mu.Unlock()

			close(sub.Channel)
			delete(subs, connectionID)
			idleSubscriptionsActive.WithLabelValues(mailboxID).Dec()
		}
		if len(subs) == 0 {
			delete(h.subscribers, mailboxID)
		}
	}
}

// Notify sends a notification to all subscribers of a mailbox with coalescing
func (h *NotifyHub) Notify(mailboxID string, notification IdleNotification) {
	h.mu.RLock()
	subs, ok := h.subscribers[mailboxID]
	if !ok {
		h.mu.RUnlock()
		return
	}

	// Copy subscriptions to avoid holding lock during sends
	subsCopy := make([]*NotifySubscription, 0, len(subs))
	for _, sub := range subs {
		subsCopy = append(subsCopy, sub)
	}
	h.mu.RUnlock()

	// Send to each subscriber with coalescing support
	for _, sub := range subsCopy {
		h.sendToSubscriber(sub, notification)
	}

	idleNotificationsSent.WithLabelValues(mailboxID, notification.Type).Inc()

	// Publish to Redis for cross-instance delivery if enabled
	if h.redis != nil {
		go h.publishToRedis(mailboxID, notification)
	}
}

// sendToSubscriber sends a notification to a single subscriber with coalescing
func (h *NotifyHub) sendToSubscriber(sub *NotifySubscription, notification IdleNotification) {
	sub.mu.Lock()
	defer sub.mu.Unlock()

	sub.LastActivity = time.Now()

	// Try non-blocking send first
	select {
	case sub.Channel <- notification:
		return
	default:
		// Channel full - use coalescing
	}

	// Add to pending notifications for coalescing
	sub.PendingNotifs = append(sub.PendingNotifs, notification)

	// Start or reset coalesce timer
	if sub.CoalesceTimer == nil {
		sub.CoalesceTimer = time.AfterFunc(h.coalescingDelay, func() {
			h.flushCoalescedNotifications(sub)
		})
	} else {
		sub.CoalesceTimer.Reset(h.coalescingDelay)
	}
}

// flushCoalescedNotifications sends coalesced notifications
func (h *NotifyHub) flushCoalescedNotifications(sub *NotifySubscription) {
	sub.mu.Lock()
	pending := sub.PendingNotifs
	sub.PendingNotifs = make([]IdleNotification, 0, 10)
	sub.CoalesceTimer = nil
	sub.mu.Unlock()

	if len(pending) == 0 {
		return
	}

	// Coalesce notifications by type
	coalesced := h.coalesceNotifications(pending)

	for _, notification := range coalesced {
		select {
		case sub.Channel <- notification:
			// Sent successfully
		default:
			// Still full after coalescing - track as dropped
			sub.mu.Lock()
			sub.DroppedCount++
			dropped := sub.DroppedCount
			sub.mu.Unlock()

			// Log warning if too many dropped
			if dropped%10 == 0 {
				h.logger.Warn("Notifications being dropped",
					zap.String("mailbox_id", sub.MailboxID),
					zap.String("connection_id", sub.ConnectionID),
					zap.Int64("total_dropped", dropped))
			}
		}
	}
}

// coalesceNotifications merges multiple notifications of the same type
func (h *NotifyHub) coalesceNotifications(notifications []IdleNotification) []IdleNotification {
	if len(notifications) <= 1 {
		return notifications
	}

	// Group by type and merge
	byType := make(map[string][]IdleNotification)
	for _, n := range notifications {
		byType[n.Type] = append(byType[n.Type], n)
	}

	result := make([]IdleNotification, 0, len(byType))
	for notifType, notifs := range byType {
		switch notifType {
		case "EXISTS":
			// For EXISTS, just send the latest count
			result = append(result, notifs[len(notifs)-1])

		case "RECENT":
			// For RECENT, sum up all counts - use SeqNum to track count
			var totalCount uint32
			for _, n := range notifs {
				totalCount += n.SeqNum
			}
			result = append(result, IdleNotification{
				Type:   "RECENT",
				SeqNum: totalCount,
			})

		case "EXPUNGE":
			// For EXPUNGE, send each one (order matters)
			result = append(result, notifs...)

		case "FLAGS":
			// For FLAGS, send all (could dedupe by sequence number)
			result = append(result, notifs...)

		default:
			result = append(result, notifs...)
		}
	}

	return result
}

// runWatchdog periodically checks for stuck connections
func (h *NotifyHub) runWatchdog() {
	for {
		select {
		case <-h.stopChan:
			return
		case <-h.watchdogTicker.C:
			h.checkStuckConnections()
		}
	}
}

// checkStuckConnections identifies and logs connections with no recent activity
func (h *NotifyHub) checkStuckConnections() {
	h.mu.RLock()
	defer h.mu.RUnlock()

	stuckThreshold := 30 * time.Minute
	now := time.Now()

	for mailboxID, subs := range h.subscribers {
		for connID, sub := range subs {
			idleTime := now.Sub(sub.LastActivity)
			if idleTime > stuckThreshold {
				h.logger.Warn("Potentially stuck IDLE connection detected",
					zap.String("mailbox_id", mailboxID),
					zap.String("connection_id", connID),
					zap.Duration("idle_time", idleTime),
					zap.Int64("dropped_count", sub.DroppedCount))

				idleStuckConnections.WithLabelValues(mailboxID).Inc()
			}
		}
	}
}

// publishToRedis publishes notification to Redis for cross-instance delivery
func (h *NotifyHub) publishToRedis(mailboxID string, notification IdleNotification) {
	if h.redis == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	channel := fmt.Sprintf("imap:notify:%s", mailboxID)
	// In production, serialize notification properly
	if err := h.redis.Publish(ctx, channel, notification); err != nil {
		h.logger.Warn("Failed to publish notification to Redis",
			zap.String("mailbox_id", mailboxID),
			zap.Error(err))
	}
}

// runRedisSubscriber subscribes to Redis for cross-instance notifications
func (h *NotifyHub) runRedisSubscriber() {
	if h.redis == nil {
		return
	}

	ctx := context.Background()
	channel := "imap:notify:*"

	msgChan, err := h.redis.Subscribe(ctx, channel)
	if err != nil {
		h.logger.Error("Failed to subscribe to Redis notifications", zap.Error(err))
		return
	}

	for {
		select {
		case <-h.stopChan:
			return
		case msg := <-msgChan:
			// Handle incoming Redis notification
			h.logger.Debug("Received Redis notification", zap.String("message", msg))
		}
	}
}

// Helper functions

var connectionCounter uint64

func generateConnectionID() string {
	id := atomic.AddUint64(&connectionCounter, 1)
	return fmt.Sprintf("conn-%d-%d", time.Now().Unix(), id)
}
