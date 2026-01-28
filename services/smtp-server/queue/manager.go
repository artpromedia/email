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

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"smtp-server/config"
	"smtp-server/domain"
	"smtp-server/repository"
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
