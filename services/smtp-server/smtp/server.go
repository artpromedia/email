package smtp

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	"github.com/emersion/go-smtp"
	"github.com/go-redis/redis/v8"
	"github.com/prometheus/client_golang/prometheus"
	"go.uber.org/zap"

	"smtp-server/auth"
	"smtp-server/config"
	"smtp-server/dkim"
	"smtp-server/dmarc"
	"smtp-server/domain"
	"smtp-server/queue"
	"smtp-server/spf"
)

// Server is the multi-domain SMTP server
type Server struct {
	config         *config.Config
	domainCache    *domain.Cache
	spfValidator   *spf.Validator
	dmarcValidator *dmarc.Validator
	dkimSigner     *dkim.Signer
	dkimVerifier   *dkim.Verifier
	queueManager   *queue.Manager
	authenticator  *auth.Authenticator
	logger         *zap.Logger
	metrics        *Metrics

	smtpServer       *smtp.Server
	submissionServer *smtp.Server
	tlsConfig        *tls.Config

	mu      sync.RWMutex
	running bool
}

// NewServer creates a new SMTP server
func NewServer(
	cfg *config.Config,
	domainCache *domain.Cache,
	queueManager *queue.Manager,
	redisClient *redis.Client,
	authRepo auth.Repository,
	logger *zap.Logger,
) *Server {
	spfValidator := spf.NewValidator(logger.Named("spf"))
	dkimVerifier := dkim.NewVerifier(logger.Named("dkim"))
	dmarcValidator := dmarc.NewValidator(spfValidator, dkimVerifier, logger.Named("dmarc"))
	dkimSigner := dkim.NewSigner(domainCache, logger.Named("dkim"))

	// Create authenticator with config
	authConfig := &auth.Config{
		MaxFailedAttempts: 5,
		LockoutDuration:   15 * time.Minute,
		RateLimitWindow:   15 * time.Minute,
	}
	authenticator := auth.NewAuthenticator(authRepo, redisClient, logger.Named("auth"), authConfig)

	return &Server{
		config:         cfg,
		domainCache:    domainCache,
		spfValidator:   spfValidator,
		dmarcValidator: dmarcValidator,
		dkimSigner:     dkimSigner,
		dkimVerifier:   dkimVerifier,
		queueManager:   queueManager,
		authenticator:  authenticator,
		logger:         logger,
		metrics:        NewMetrics(),
	}
}

// Start starts the SMTP server
func (s *Server) Start(ctx context.Context) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return fmt.Errorf("server already running")
	}
	s.running = true
	s.mu.Unlock()

	// Load TLS config if enabled
	if s.config.TLS.Enabled {
		tlsConfig, err := s.loadTLSConfig()
		if err != nil {
			return fmt.Errorf("load TLS config: %w", err)
		}
		s.tlsConfig = tlsConfig
	}

	// Create backend
	backend := NewBackend(s)

	// Start SMTP server (port 25 - receiving)
	if err := s.startSMTPServer(backend); err != nil {
		return fmt.Errorf("start SMTP server: %w", err)
	}

	// Start submission server (port 587 - sending)
	if err := s.startSubmissionServer(backend); err != nil {
		return fmt.Errorf("start submission server: %w", err)
	}

	s.logger.Info("SMTP server started",
		zap.String("smtp_addr", s.config.Server.SMTPAddr),
		zap.String("submission_addr", s.config.Server.SubmissionAddr))

	return nil
}

// Stop stops the SMTP server
func (s *Server) Stop(ctx context.Context) error {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return nil
	}
	s.running = false
	s.mu.Unlock()

	var errs []error

	if s.smtpServer != nil {
		if err := s.smtpServer.Close(); err != nil {
			errs = append(errs, fmt.Errorf("close SMTP server: %w", err))
		}
	}

	if s.submissionServer != nil {
		if err := s.submissionServer.Close(); err != nil {
			errs = append(errs, fmt.Errorf("close submission server: %w", err))
		}
	}

	if len(errs) > 0 {
		return errs[0]
	}

	s.logger.Info("SMTP server stopped")
	return nil
}

func (s *Server) startSMTPServer(backend smtp.Backend) error {
	s.smtpServer = smtp.NewServer(backend)
	s.smtpServer.Addr = s.config.Server.SMTPAddr
	s.smtpServer.Domain = s.config.Server.Hostname
	s.smtpServer.ReadTimeout = s.config.Server.ReadTimeout
	s.smtpServer.WriteTimeout = s.config.Server.WriteTimeout
	s.smtpServer.MaxMessageBytes = int(s.config.Server.MaxMessageSize)
	s.smtpServer.MaxRecipients = s.config.Server.MaxRecipients
	s.smtpServer.AllowInsecureAuth = false
	s.smtpServer.AuthDisabled = true // No auth on port 25

	if s.tlsConfig != nil {
		s.smtpServer.TLSConfig = s.tlsConfig
		s.smtpServer.EnableSMTPUTF8 = true
	}

	go func() {
		s.logger.Info("Starting SMTP server", zap.String("addr", s.config.Server.SMTPAddr))
		if err := s.smtpServer.ListenAndServe(); err != nil && err != smtp.ErrServerClosed {
			s.logger.Error("SMTP server error", zap.Error(err))
		}
	}()

	return nil
}

func (s *Server) startSubmissionServer(backend smtp.Backend) error {
	s.submissionServer = smtp.NewServer(backend)
	s.submissionServer.Addr = s.config.Server.SubmissionAddr
	s.submissionServer.Domain = s.config.Server.Hostname
	s.submissionServer.ReadTimeout = s.config.Server.ReadTimeout
	s.submissionServer.WriteTimeout = s.config.Server.WriteTimeout
	s.submissionServer.MaxMessageBytes = int(s.config.Server.MaxMessageSize)
	s.submissionServer.MaxRecipients = s.config.Server.MaxRecipients
	s.submissionServer.AllowInsecureAuth = false
	s.submissionServer.AuthDisabled = false // Auth required on submission

	if s.tlsConfig != nil {
		s.submissionServer.TLSConfig = s.tlsConfig
		s.submissionServer.EnableSMTPUTF8 = true
	}

	go func() {
		s.logger.Info("Starting submission server", zap.String("addr", s.config.Server.SubmissionAddr))
		if err := s.submissionServer.ListenAndServe(); err != nil && err != smtp.ErrServerClosed {
			s.logger.Error("Submission server error", zap.Error(err))
		}
	}()

	return nil
}

func (s *Server) loadTLSConfig() (*tls.Config, error) {
	cert, err := tls.LoadX509KeyPair(s.config.TLS.CertFile, s.config.TLS.KeyFile)
	if err != nil {
		return nil, fmt.Errorf("load certificate: %w", err)
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS13,
		// TLS 1.3 automatically uses secure cipher suites, but we also support
		// TLS 1.2 fallback with these strong ciphers for compatibility
		CipherSuites: []uint16{
			// TLS 1.3 ciphers are automatically included when MinVersion >= TLS 1.3
			tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256,
			tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256,
			tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
		},
		CurvePreferences: []tls.CurveID{
			tls.X25519,
			tls.CurveP384,
			tls.CurveP256,
		},
	}, nil
}

// Backend implements smtp.Backend for multi-domain support
type Backend struct {
	server *Server
}

// NewBackend creates a new SMTP backend
func NewBackend(server *Server) *Backend {
	return &Backend{server: server}
}

// NewSession creates a new session for an incoming connection
func (b *Backend) NewSession(c *smtp.Conn) (smtp.Session, error) {
	remoteAddr := c.Conn().RemoteAddr()
	var clientIP net.IP

	if tcpAddr, ok := remoteAddr.(*net.TCPAddr); ok {
		clientIP = tcpAddr.IP
	}

	session := &Session{
		backend:   b,
		conn:      c,
		clientIP:  clientIP,
		logger:    b.server.logger.With(zap.String("client_ip", clientIP.String())),
		startTime: time.Now(),
		isTLS:     c.TLSConnectionState() != nil,
	}

	b.server.metrics.ConnectionsTotal.Inc()
	b.server.metrics.ConnectionsActive.Inc()

	b.server.logger.Debug("New SMTP session",
		zap.String("client_ip", clientIP.String()),
		zap.String("remote_addr", remoteAddr.String()),
		zap.Bool("tls", session.isTLS))

	return session, nil
}

// Session handles a single SMTP session
type Session struct {
	backend     *Backend
	conn        *smtp.Conn
	clientIP    net.IP
	logger      *zap.Logger
	startTime   time.Time
	isTLS       bool

	// Authentication state
	authenticated bool
	userID        string
	orgID         string
	userEmail     string

	// Message state
	from        string
	fromDomain  string
	recipients  []string
	recipientDomains map[string]bool
}

// Reset resets the session state
func (s *Session) Reset() {
	s.from = ""
	s.fromDomain = ""
	s.recipients = nil
	s.recipientDomains = make(map[string]bool)
}

// Logout is called when the client logs out
func (s *Session) Logout() error {
	duration := time.Since(s.startTime)
	s.backend.server.metrics.ConnectionsActive.Dec()
	s.backend.server.metrics.SessionDuration.Observe(duration.Seconds())

	s.logger.Debug("SMTP session ended",
		zap.Duration("duration", duration),
		zap.Bool("authenticated", s.authenticated))

	return nil
}

// AuthMechanisms returns the supported authentication mechanisms
func (s *Session) AuthMechanisms() []string {
	// Only advertise auth mechanisms if TLS is established
	if !s.isTLS {
		return nil
	}
	return []string{"PLAIN", "LOGIN"}
}

// Auth handles SMTP authentication
func (s *Session) Auth(mech string) (smtp.AuthSession, error) {
	// Reject authentication without TLS
	if !s.isTLS {
		s.logger.Warn("Authentication rejected: TLS not established",
			zap.String("client_ip", s.clientIP.String()),
			zap.String("mechanism", mech))
		return nil, &smtp.SMTPError{
			Code:         523,
			EnhancedCode: smtp.EnhancedCode{5, 7, 10},
			Message:      "TLS required for authentication",
		}
	}

	return &AuthSession{
		session:   s,
		mechanism: mech,
		loginState: &auth.LoginAuthState{
			Step:     0,
			ClientIP: s.clientIP,
			IsTLS:    s.isTLS,
		},
	}, nil
}

// AuthSession handles authentication
type AuthSession struct {
	session    *Session
	mechanism  string
	loginState *auth.LoginAuthState
}

// Next processes authentication steps
func (a *AuthSession) Next(response []byte, more bool) ([]byte, error) {
	ctx := context.Background()
	authenticator := a.session.backend.server.authenticator

	switch a.mechanism {
	case "PLAIN":
		// PLAIN auth sends everything in one response
		if more {
			// Initial response not provided, send empty challenge
			return nil, nil
		}

		result, err := authenticator.AuthenticatePlain(ctx, response, a.session.clientIP, a.session.isTLS)
		if err != nil {
			a.session.logger.Warn("PLAIN authentication failed",
				zap.String("client_ip", a.session.clientIP.String()),
				zap.Error(err))
			return nil, authErrorToSMTP(err)
		}

		// Set session state
		a.session.authenticated = true
		a.session.userID = result.UserID
		a.session.orgID = result.OrganizationID
		a.session.userEmail = result.Email
		a.session.logger.Info("User authenticated via PLAIN",
			zap.String("user_id", result.UserID),
			zap.String("email", maskEmailForLog(result.Email)))
		return nil, nil

	case "LOGIN":
		// LOGIN auth is multi-step
		if a.loginState.Step == 0 && len(response) == 0 {
			// Initial request - send username prompt
			a.loginState.Step = 0
			return []byte("VXNlcm5hbWU6"), nil // "Username:" base64
		}

		result, challenge, err := authenticator.AuthenticateLoginStep(ctx, a.loginState, response)
		if err != nil {
			a.session.logger.Warn("LOGIN authentication failed",
				zap.String("client_ip", a.session.clientIP.String()),
				zap.Int("step", a.loginState.Step),
				zap.Error(err))
			return nil, authErrorToSMTP(err)
		}

		if challenge != nil {
			// Need more data
			return challenge, nil
		}

		// Authentication complete
		a.session.authenticated = true
		a.session.userID = result.UserID
		a.session.orgID = result.OrganizationID
		a.session.userEmail = result.Email
		a.session.logger.Info("User authenticated via LOGIN",
			zap.String("user_id", result.UserID),
			zap.String("email", maskEmailForLog(result.Email)))
		return nil, nil

	default:
		return nil, &smtp.SMTPError{
			Code:         504,
			EnhancedCode: smtp.EnhancedCode{5, 5, 4},
			Message:      "Unrecognized authentication mechanism",
		}
	}
}

// authErrorToSMTP converts auth errors to SMTP errors
func authErrorToSMTP(err error) error {
	switch {
	case errors.Is(err, auth.ErrInvalidCredentials):
		return &smtp.SMTPError{
			Code:         535,
			EnhancedCode: smtp.EnhancedCode{5, 7, 8},
			Message:      "Authentication credentials invalid",
		}
	case errors.Is(err, auth.ErrRateLimited):
		return &smtp.SMTPError{
			Code:         421,
			EnhancedCode: smtp.EnhancedCode{4, 7, 0},
			Message:      "Too many failed authentication attempts. Please try again later.",
		}
	case errors.Is(err, auth.ErrTLSRequired):
		return &smtp.SMTPError{
			Code:         523,
			EnhancedCode: smtp.EnhancedCode{5, 7, 10},
			Message:      "TLS required for authentication",
		}
	case errors.Is(err, auth.ErrAccountLocked):
		return &smtp.SMTPError{
			Code:         535,
			EnhancedCode: smtp.EnhancedCode{5, 7, 8},
			Message:      "Account is temporarily locked due to too many failed attempts",
		}
	case errors.Is(err, auth.ErrAccountDisabled):
		return &smtp.SMTPError{
			Code:         535,
			EnhancedCode: smtp.EnhancedCode{5, 7, 8},
			Message:      "Account is disabled",
		}
	case errors.Is(err, auth.ErrNoPassword):
		return &smtp.SMTPError{
			Code:         535,
			EnhancedCode: smtp.EnhancedCode{5, 7, 8},
			Message:      "Password authentication not available for this account",
		}
	default:
		return &smtp.SMTPError{
			Code:         454,
			EnhancedCode: smtp.EnhancedCode{4, 7, 0},
			Message:      "Temporary authentication failure",
		}
	}
}

// maskEmailForLog masks email for logging
func maskEmailForLog(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return "***"
	}
	local := parts[0]
	domain := parts[1]
	if len(local) <= 2 {
		return "**@" + domain
	}
	return local[:1] + "***@" + domain
}

// Mail handles the MAIL FROM command
func (s *Session) Mail(from string, opts *smtp.MailOptions) error {
	// Extract domain from sender address
	domainName := extractDomain(from)
	if domainName == "" {
		return &smtp.SMTPError{
			Code:    501,
			Message: "Invalid sender address",
		}
	}

	// For submission (authenticated), validate sender domain permission
	if s.authenticated {
		domain := s.backend.server.domainCache.GetDomain(domainName)
		if domain == nil {
			return &smtp.SMTPError{
				Code:    550,
				Message: fmt.Sprintf("Domain %s not configured", domainName),
			}
		}

		// Check if user can send from this domain
		ctx := context.Background()
		perm, err := s.backend.server.domainCache.CheckUserDomainPermission(ctx, s.userID, domain.ID)
		if err != nil {
			s.logger.Error("Failed to check domain permission", zap.Error(err))
			return &smtp.SMTPError{
				Code:    451,
				Message: "Temporary error checking permissions",
			}
		}

		if perm == nil || !perm.CanSend {
			return &smtp.SMTPError{
				Code:    550,
				Message: fmt.Sprintf("Not authorized to send from domain %s", domainName),
			}
		}

		// Check if specific address is allowed
		if !perm.CanSendAs && len(perm.AllowedSendAsAddresses) > 0 {
			allowed := false
			for _, addr := range perm.AllowedSendAsAddresses {
				if addr == from {
					allowed = true
					break
				}
			}
			if !allowed {
				return &smtp.SMTPError{
					Code:    550,
					Message: fmt.Sprintf("Not authorized to send as %s", from),
				}
			}
		}
	}

	s.from = from
	s.fromDomain = domainName
	s.recipientDomains = make(map[string]bool)

	s.logger.Debug("MAIL FROM accepted", zap.String("from", from))
	s.backend.server.metrics.MessagesReceived.WithLabelValues(domainName).Inc()

	return nil
}

// Rcpt handles the RCPT TO command
func (s *Session) Rcpt(to string, opts *smtp.RcptOptions) error {
	domainName := extractDomain(to)
	if domainName == "" {
		return &smtp.SMTPError{
			Code:    501,
			Message: "Invalid recipient address",
		}
	}

	// Check if domain is local
	domain := s.backend.server.domainCache.GetDomain(domainName)

	if domain != nil {
		// Local delivery - verify recipient exists
		ctx := context.Background()
		result, err := s.lookupRecipient(ctx, to, domain)
		if err != nil {
			s.logger.Error("Failed to lookup recipient", zap.Error(err))
			return &smtp.SMTPError{
				Code:    451,
				Message: "Temporary error looking up recipient",
			}
		}

		if !result.Exists && !result.CatchAll {
			return &smtp.SMTPError{
				Code:    550,
				Message: fmt.Sprintf("Recipient %s not found", to),
			}
		}
	} else {
		// External delivery - only allowed for authenticated sessions
		if !s.authenticated {
			return &smtp.SMTPError{
				Code:    550,
				Message: "Relay access denied",
			}
		}

		// Check if domain allows external relay
		fromDomain := s.backend.server.domainCache.GetDomain(s.fromDomain)
		if fromDomain != nil && !fromDomain.Policies.AllowExternalRelay {
			return &smtp.SMTPError{
				Code:    550,
				Message: "External relay not allowed for this domain",
			}
		}
	}

	s.recipients = append(s.recipients, to)
	s.recipientDomains[domainName] = true

	s.logger.Debug("RCPT TO accepted",
		zap.String("to", to),
		zap.Bool("local", domain != nil))

	return nil
}

func (s *Session) lookupRecipient(ctx context.Context, email string, domain *domain.Domain) (*domain.RecipientLookupResult, error) {
	result := &domain.RecipientLookupResult{
		Email:    email,
		DomainID: domain.ID,
	}

	// Check mailbox
	mailbox, err := s.backend.server.domainCache.LookupMailbox(ctx, email)
	if err != nil {
		return nil, err
	}
	if mailbox != nil {
		result.Exists = true
		result.Type = "mailbox"
		result.TargetID = mailbox.ID
		return result, nil
	}

	// Check alias
	aliases, err := s.backend.server.domainCache.LookupAliases(ctx, email)
	if err != nil {
		return nil, err
	}
	if len(aliases) > 0 {
		result.Exists = true
		result.Type = "alias"
		for _, a := range aliases {
			result.Targets = append(result.Targets, a.TargetEmail)
		}
		return result, nil
	}

	// Check distribution list
	distList, err := s.backend.server.domainCache.LookupDistributionList(ctx, email)
	if err != nil {
		return nil, err
	}
	if distList != nil {
		result.Exists = true
		result.Type = "distribution_list"
		result.TargetID = distList.ID
		result.Targets = distList.Members
		return result, nil
	}

	// Check catch-all
	if domain.Policies.CatchAllEnabled && domain.Policies.CatchAllAddress != "" {
		result.CatchAll = true
		result.Targets = []string{domain.Policies.CatchAllAddress}
	}

	return result, nil
}

// Data handles the DATA command
func (s *Session) Data(r io.Reader) error {
	// Implementation continues in message.go
	return s.processMessage(r)
}

func extractDomain(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return ""
	}
	return strings.ToLower(parts[1])
}

// Metrics holds Prometheus metrics for the SMTP server
type Metrics struct {
	ConnectionsTotal  prometheus.Counter
	ConnectionsActive prometheus.Gauge
	SessionDuration   prometheus.Histogram
	MessagesReceived  *prometheus.CounterVec
	MessagesSent      *prometheus.CounterVec
	MessagesRejected  *prometheus.CounterVec
	MessageSize       *prometheus.HistogramVec
	DeliveryDuration  *prometheus.HistogramVec
	SPFResults        *prometheus.CounterVec
	DKIMResults       *prometheus.CounterVec
	DMARCResults      *prometheus.CounterVec
	QueueSize         *prometheus.GaugeVec
}

// NewMetrics creates new Prometheus metrics
func NewMetrics() *Metrics {
	return &Metrics{
		ConnectionsTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "smtp_connections_total",
			Help: "Total number of SMTP connections",
		}),
		ConnectionsActive: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "smtp_connections_active",
			Help: "Number of active SMTP connections",
		}),
		SessionDuration: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "smtp_session_duration_seconds",
			Help:    "SMTP session duration in seconds",
			Buckets: prometheus.ExponentialBuckets(0.1, 2, 10),
		}),
		MessagesReceived: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "smtp_messages_received_total",
			Help: "Total messages received by domain",
		}, []string{"domain"}),
		MessagesSent: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "smtp_messages_sent_total",
			Help: "Total messages sent by domain",
		}, []string{"domain"}),
		MessagesRejected: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "smtp_messages_rejected_total",
			Help: "Total messages rejected by domain and reason",
		}, []string{"domain", "reason"}),
		MessageSize: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "smtp_message_size_bytes",
			Help:    "Message size in bytes",
			Buckets: prometheus.ExponentialBuckets(1024, 2, 15),
		}, []string{"domain"}),
		DeliveryDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "smtp_delivery_duration_seconds",
			Help:    "Message delivery duration in seconds",
			Buckets: prometheus.ExponentialBuckets(0.01, 2, 15),
		}, []string{"domain", "type"}),
		SPFResults: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "smtp_spf_results_total",
			Help: "SPF check results",
		}, []string{"domain", "result"}),
		DKIMResults: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "smtp_dkim_results_total",
			Help: "DKIM verification results",
		}, []string{"domain", "result"}),
		DMARCResults: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "smtp_dmarc_results_total",
			Help: "DMARC check results",
		}, []string{"domain", "result"}),
		QueueSize: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "smtp_queue_size",
			Help: "Current queue size by domain and status",
		}, []string{"domain", "status"}),
	}
}

// Register registers metrics with Prometheus
func (m *Metrics) Register(registry prometheus.Registerer) {
	registry.MustRegister(
		m.ConnectionsTotal,
		m.ConnectionsActive,
		m.SessionDuration,
		m.MessagesReceived,
		m.MessagesSent,
		m.MessagesRejected,
		m.MessageSize,
		m.DeliveryDuration,
		m.SPFResults,
		m.DKIMResults,
		m.DMARCResults,
		m.QueueSize,
	)
}
