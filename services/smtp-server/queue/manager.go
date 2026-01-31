package queue

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"smtp-server/config"
	"smtp-server/domain"
	"smtp-server/repository"
)

// Prometheus metrics for quota monitoring
var (
	quotaExceededTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "smtp_mailbox_quota_exceeded_total",
		Help: "Total number of quota exceeded events",
	}, []string{"mailbox_id", "email"})

	mailboxUsedBytes = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "smtp_mailbox_used_bytes",
		Help: "Current used storage in bytes per mailbox",
	}, []string{"mailbox_id", "email"})

	mailboxQuotaBytes = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "smtp_mailbox_quota_bytes",
		Help: "Storage quota in bytes per mailbox",
	}, []string{"mailbox_id", "email"})

	mailboxQuotaUsagePercent = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "smtp_mailbox_quota_usage_percent",
		Help: "Quota usage percentage per mailbox",
	}, []string{"mailbox_id", "email"})

	quotaWarningsSent = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "smtp_quota_warnings_sent_total",
		Help: "Total quota warning emails sent",
	}, []string{"mailbox_id", "threshold"})
)

// Manager handles message queue operations
type Manager struct {
	config       *config.Config
	redis        *redis.Client
	msgRepo      *repository.MessageRepository
	domainCache  DomainProvider
	logger       *zap.Logger

	workers      []*Worker
	workerWg     sync.WaitGroup
	stopChan     chan struct{}
	mu           sync.RWMutex
	running      bool

	// Rate limiters per domain
	rateLimiters map[string]*RateLimiter
	rlMu         sync.RWMutex
}

// DomainProvider provides domain information
type DomainProvider interface {
	GetDomain(name string) *domain.Domain
	GetDomainByID(id string) *domain.Domain
}

// NewManager creates a new queue manager
func NewManager(
	cfg *config.Config,
	redisClient *redis.Client,
	msgRepo *repository.MessageRepository,
	domainCache DomainProvider,
	logger *zap.Logger,
) *Manager {
	return &Manager{
		config:       cfg,
		redis:        redisClient,
		msgRepo:      msgRepo,
		domainCache:  domainCache,
		logger:       logger,
		stopChan:     make(chan struct{}),
		rateLimiters: make(map[string]*RateLimiter),
	}
}

// Start starts the queue manager and workers
func (m *Manager) Start(ctx context.Context) error {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return fmt.Errorf("queue manager already running")
	}
	m.running = true
	m.mu.Unlock()

	// Create storage directory
	if err := os.MkdirAll(m.config.Queue.StoragePath, 0755); err != nil {
		return fmt.Errorf("create storage directory: %w", err)
	}

	// Start workers
	for i := 0; i < m.config.Queue.Workers; i++ {
		worker := NewWorker(i, m, m.logger.Named(fmt.Sprintf("worker-%d", i)))
		m.workers = append(m.workers, worker)
		m.workerWg.Add(1)
		go func(w *Worker) {
			defer m.workerWg.Done()
			w.Run(ctx)
		}(worker)
	}

	// Start cleanup goroutine
	go m.cleanupLoop(ctx)

	// Start stuck message recovery
	go m.recoveryLoop(ctx)

	m.logger.Info("Queue manager started",
		zap.Int("workers", m.config.Queue.Workers),
		zap.String("storage_path", m.config.Queue.StoragePath))

	return nil
}

// Stop stops the queue manager
func (m *Manager) Stop(ctx context.Context) error {
	m.mu.Lock()
	if !m.running {
		m.mu.Unlock()
		return nil
	}
	m.running = false
	close(m.stopChan)
	m.mu.Unlock()

	// Wait for workers to finish
	done := make(chan struct{})
	go func() {
		m.workerWg.Wait()
		close(done)
	}()

	select {
	case <-done:
		m.logger.Info("Queue manager stopped gracefully")
	case <-ctx.Done():
		m.logger.Warn("Queue manager stop timeout")
	}

	return nil
}

// Enqueue adds a message to the queue
func (m *Manager) Enqueue(ctx context.Context, msg *domain.Message) error {
	// Check rate limits
	if err := m.checkRateLimit(ctx, msg.DomainID); err != nil {
		return fmt.Errorf("rate limit exceeded: %w", err)
	}

	// Save to database
	if err := m.msgRepo.CreateMessage(ctx, msg); err != nil {
		return fmt.Errorf("create message: %w", err)
	}

	// Push to Redis queue for immediate processing
	queueKey := fmt.Sprintf("queue:domain:%s", msg.DomainID)
	if err := m.redis.LPush(ctx, queueKey, msg.ID).Err(); err != nil {
		m.logger.Warn("Failed to push to Redis queue", zap.Error(err))
		// Message is still in database, will be picked up by workers
	}

	m.logger.Debug("Message enqueued",
		zap.String("message_id", msg.ID),
		zap.String("domain_id", msg.DomainID),
		zap.Int("recipients", len(msg.Recipients)))

	return nil
}

// StoreMessage stores message data and returns the path
func (m *Manager) StoreMessage(ctx context.Context, data []byte) (string, error) {
	// Generate filename based on content hash
	hash := sha256.Sum256(data)
	hashStr := hex.EncodeToString(hash[:])

	// Create date-based directory structure
	now := time.Now()
	dir := filepath.Join(
		m.config.Queue.StoragePath,
		now.Format("2006"),
		now.Format("01"),
		now.Format("02"),
	)

	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("create directory: %w", err)
	}

	path := filepath.Join(dir, hashStr+".eml")

	// Write message data
	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", fmt.Errorf("write message: %w", err)
	}

	return path, nil
}

// GetMessageData retrieves stored message data
func (m *Manager) GetMessageData(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read message: %w", err)
	}
	return data, nil
}

// DeleteMessageData removes stored message data
func (m *Manager) DeleteMessageData(path string) error {
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("delete message: %w", err)
	}
	return nil
}

// GetPendingMessages returns pending messages for processing
func (m *Manager) GetPendingMessages(ctx context.Context, limit int) ([]*domain.Message, error) {
	return m.msgRepo.GetPendingMessages(ctx, limit)
}

// GetPendingMessagesByDomain returns pending messages for a specific domain
func (m *Manager) GetPendingMessagesByDomain(ctx context.Context, domainID string, limit int) ([]*domain.Message, error) {
	return m.msgRepo.GetPendingMessagesByDomain(ctx, domainID, limit)
}

// UpdateMessageStatus updates message status
func (m *Manager) UpdateMessageStatus(ctx context.Context, messageID string, status domain.MessageStatus) error {
	return m.msgRepo.UpdateMessageStatus(ctx, messageID, status)
}

// ScheduleRetry schedules a message for retry
func (m *Manager) ScheduleRetry(ctx context.Context, msg *domain.Message, lastError string) error {
	// Calculate next retry time with exponential backoff
	baseDelay := m.config.Queue.RetryDelay
	delay := baseDelay * time.Duration(1<<uint(msg.RetryCount))
	if delay > m.config.Queue.MaxRetryDelay {
		delay = m.config.Queue.MaxRetryDelay
	}

	nextRetry := time.Now().Add(delay)

	if err := m.msgRepo.UpdateMessageRetry(ctx, msg.ID, nextRetry, lastError); err != nil {
		return fmt.Errorf("update message retry: %w", err)
	}

	m.logger.Debug("Scheduled message retry",
		zap.String("message_id", msg.ID),
		zap.Int("retry_count", msg.RetryCount+1),
		zap.Time("next_retry", nextRetry))

	return nil
}

// MarkFailed marks a message as permanently failed
func (m *Manager) MarkFailed(ctx context.Context, msg *domain.Message) error {
	return m.msgRepo.UpdateMessageStatus(ctx, msg.ID, domain.StatusFailed)
}

// MarkProcessing marks a message as being processed
func (m *Manager) MarkProcessing(ctx context.Context, messageID string) error {
	return m.msgRepo.MarkMessageProcessing(ctx, messageID)
}

// GetQueueStats returns queue statistics
func (m *Manager) GetQueueStats(ctx context.Context) (map[string]*repository.QueueStats, error) {
	return m.msgRepo.GetQueueStats(ctx)
}

// checkRateLimit checks if the domain has exceeded its rate limit
func (m *Manager) checkRateLimit(ctx context.Context, domainID string) error {
	d := m.domainCache.GetDomainByID(domainID)
	if d == nil {
		return fmt.Errorf("domain not found: %s", domainID)
	}

	// Get or create rate limiter for domain
	m.rlMu.Lock()
	rl, exists := m.rateLimiters[domainID]
	if !exists {
		rl = NewRateLimiter(d.Policies.RateLimitPerHour, d.Policies.RateLimitPerDay)
		m.rateLimiters[domainID] = rl
	}
	m.rlMu.Unlock()

	if !rl.Allow() {
		return fmt.Errorf("rate limit exceeded for domain %s", d.Name)
	}

	return nil
}

// cleanupLoop periodically cleans up old messages
func (m *Manager) cleanupLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-m.stopChan:
			return
		case <-ticker.C:
			count, err := m.msgRepo.CleanupOldMessages(ctx, 7*24*time.Hour)
			if err != nil {
				m.logger.Error("Failed to cleanup old messages", zap.Error(err))
			} else if count > 0 {
				m.logger.Info("Cleaned up old messages", zap.Int64("count", count))
			}
		}
	}
}

// recoveryLoop periodically recovers stuck messages
func (m *Manager) recoveryLoop(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-m.stopChan:
			return
		case <-ticker.C:
			count, err := m.msgRepo.ResetStuckMessages(ctx, 30*time.Minute)
			if err != nil {
				m.logger.Error("Failed to reset stuck messages", zap.Error(err))
			} else if count > 0 {
				m.logger.Warn("Reset stuck messages", zap.Int64("count", count))
			}
		}
	}
}

// RateLimiter implements sliding window rate limiting
type RateLimiter struct {
	hourlyLimit int
	dailyLimit  int
	hourlyCount int
	dailyCount  int
	hourlyReset time.Time
	dailyReset  time.Time
	mu          sync.Mutex
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(hourlyLimit, dailyLimit int) *RateLimiter {
	now := time.Now()
	return &RateLimiter{
		hourlyLimit: hourlyLimit,
		dailyLimit:  dailyLimit,
		hourlyReset: now.Add(time.Hour),
		dailyReset:  now.Add(24 * time.Hour),
	}
}

// Allow checks if a request is allowed
func (r *RateLimiter) Allow() bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()

	// Reset hourly counter if needed
	if now.After(r.hourlyReset) {
		r.hourlyCount = 0
		r.hourlyReset = now.Add(time.Hour)
	}

	// Reset daily counter if needed
	if now.After(r.dailyReset) {
		r.dailyCount = 0
		r.dailyReset = now.Add(24 * time.Hour)
	}

	// Check limits
	if r.hourlyLimit > 0 && r.hourlyCount >= r.hourlyLimit {
		return false
	}
	if r.dailyLimit > 0 && r.dailyCount >= r.dailyLimit {
		return false
	}

	// Increment counters
	r.hourlyCount++
	r.dailyCount++

	return true
}

// RecipientLookupResult contains the result of looking up a recipient
type RecipientLookupResult struct {
	Found            bool
	Type             string // "mailbox", "alias", "distribution_list"
	Mailbox          *domain.Mailbox
	Alias            *domain.Alias
	DistributionList *domain.DistributionList
}

// LookupRecipient looks up a recipient email address and returns what it resolves to
func (m *Manager) LookupRecipient(ctx context.Context, email string) (*RecipientLookupResult, error) {
	result := &RecipientLookupResult{Found: false}

	// Try to find as mailbox first
	mailbox, err := m.msgRepo.GetMailboxByEmail(ctx, email)
	if err == nil && mailbox != nil && mailbox.IsActive {
		result.Found = true
		result.Type = "mailbox"
		result.Mailbox = mailbox
		return result, nil
	}

	// Try to find as alias
	alias, err := m.msgRepo.GetAliasBySource(ctx, email)
	if err == nil && alias != nil && alias.IsActive {
		result.Found = true
		result.Type = "alias"
		result.Alias = alias
		return result, nil
	}

	// Try to find as distribution list
	dl, err := m.msgRepo.GetDistributionListByEmail(ctx, email)
	if err == nil && dl != nil && dl.IsActive {
		result.Found = true
		result.Type = "distribution_list"
		result.DistributionList = dl
		return result, nil
	}

	return result, nil
}

// StoreMailboxMessage stores a message in mailbox storage (S3 or local)
func (m *Manager) StoreMailboxMessage(ctx context.Context, path string, data []byte) error {
	// For now, store locally - in production this would go to S3/object storage
	fullPath := filepath.Join(m.config.Queue.StoragePath, "mailboxes", path)

	// Create directory if needed
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create mailbox directory: %w", err)
	}

	// Write message
	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		return fmt.Errorf("write mailbox message: %w", err)
	}

	m.logger.Debug("Stored mailbox message",
		zap.String("path", path),
		zap.Int("size", len(data)))

	return nil
}

// UpdateMailboxUsage updates the storage used by a mailbox
func (m *Manager) UpdateMailboxUsage(ctx context.Context, mailboxID string, additionalBytes int64) error {
	return m.msgRepo.UpdateMailboxUsage(ctx, mailboxID, additionalBytes)
}

// RecordMailboxMessage records a message in the mailbox messages table
func (m *Manager) RecordMailboxMessage(ctx context.Context, mailboxID string, msg *domain.Message, storagePath string, size int64) error {
	return m.msgRepo.RecordMailboxMessage(ctx, mailboxID, msg, storagePath, size)
}

// AtomicQuotaCheckAndUpdate performs atomic quota verification and update.
// Returns newUsedBytes, quotaBytes, and error (repository.ErrQuotaExceeded if exceeded).
func (m *Manager) AtomicQuotaCheckAndUpdate(ctx context.Context, mailboxID string, additionalBytes int64) (int64, int64, error) {
	return m.msgRepo.AtomicQuotaCheckAndUpdate(ctx, mailboxID, additionalBytes)
}

// ErrQuotaExceeded returns the quota exceeded error for comparison.
func (m *Manager) ErrQuotaExceeded() error {
	return repository.ErrQuotaExceeded
}

// RecordQuotaExceeded records a quota exceeded event metric.
func (m *Manager) RecordQuotaExceeded(mailboxID, email string) {
	quotaExceededTotal.WithLabelValues(mailboxID, email).Inc()
	m.logger.Info("Quota exceeded",
		zap.String("mailbox_id", mailboxID),
		zap.String("email", email))
}

// RecordQuotaUsage records current quota usage metrics.
func (m *Manager) RecordQuotaUsage(mailboxID, email string, usedBytes, quotaBytes int64) {
	mailboxUsedBytes.WithLabelValues(mailboxID, email).Set(float64(usedBytes))
	if quotaBytes > 0 {
		mailboxQuotaBytes.WithLabelValues(mailboxID, email).Set(float64(quotaBytes))
		usagePercent := float64(usedBytes) / float64(quotaBytes) * 100
		mailboxQuotaUsagePercent.WithLabelValues(mailboxID, email).Set(usagePercent)
	}
}

// HasRecentQuotaWarning checks if a quota warning was sent recently (within 24 hours).
func (m *Manager) HasRecentQuotaWarning(ctx context.Context, warningKey string) bool {
	exists, err := m.redis.Exists(ctx, warningKey).Result()
	if err != nil {
		m.logger.Warn("Failed to check quota warning key", zap.Error(err))
		return false
	}
	return exists > 0
}

// MarkQuotaWarningSent marks a quota warning as sent (expires in 24 hours).
func (m *Manager) MarkQuotaWarningSent(ctx context.Context, warningKey string) {
	err := m.redis.Set(ctx, warningKey, "1", 24*time.Hour).Err()
	if err != nil {
		m.logger.Warn("Failed to mark quota warning sent", zap.Error(err))
	}
}

// SendQuotaWarningEmail sends a quota warning email to the mailbox owner.
func (m *Manager) SendQuotaWarningEmail(ctx context.Context, mailbox *domain.Mailbox, usagePercent float64, description string) error {
	// Get user email for notification
	userEmail, err := m.msgRepo.GetMailboxOwnerEmail(ctx, mailbox.ID)
	if err != nil {
		return fmt.Errorf("get mailbox owner: %w", err)
	}

	// Create warning email
	subject := fmt.Sprintf("Storage Warning: Your mailbox is at %s capacity", description)
	body := fmt.Sprintf(`Your mailbox %s is approaching its storage limit.

Current Usage: %.1f%%
Used: %s of %s

Please consider:
- Deleting old emails and attachments
- Emptying your trash folder
- Archiving old messages

If you need more storage, please contact your administrator.

This is an automated message. Please do not reply.`,
		mailbox.Email,
		usagePercent,
		formatBytes(mailbox.UsedBytes),
		formatBytes(mailbox.QuotaBytes),
	)

	// Queue the warning email
	return m.queueSystemEmail(ctx, userEmail, subject, body)
}

// queueSystemEmail queues a system notification email.
func (m *Manager) queueSystemEmail(ctx context.Context, to, subject, body string) error {
	msg := &domain.Message{
		ID:          generateMessageID(),
		FromAddress: "noreply@" + m.config.Server.DefaultDomain,
		Recipients:  []string{to},
		Subject:     subject,
		Headers: map[string]string{
			"X-System-Email": "quota-warning",
			"X-Priority":     "1",
		},
		Status:    "pending",
		Priority:  1, // High priority
		CreatedAt: time.Now(),
	}

	// Store body and create message
	bodyPath := filepath.Join(m.config.Storage.QueueDir, msg.ID+".eml")
	if err := os.WriteFile(bodyPath, []byte(body), 0600); err != nil {
		return fmt.Errorf("write message body: %w", err)
	}
	msg.RawMessagePath = bodyPath
	msg.BodySize = int64(len(body))

	return m.msgRepo.CreateMessage(ctx, msg)
}

// formatBytes formats bytes into human-readable format.
func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// generateMessageID generates a unique message ID.
func generateMessageID() string {
	h := sha256.New()
	h.Write([]byte(time.Now().String()))
	return hex.EncodeToString(h.Sum(nil))[:32]
}
