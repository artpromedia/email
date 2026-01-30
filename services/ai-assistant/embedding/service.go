package embedding

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/rs/zerolog"
	"golang.org/x/sync/errgroup"

	"github.com/enterprise-email/ai-assistant/provider"
)

// Service handles embedding generation
type Service struct {
	router        *provider.Router
	cache         *redis.Client
	cacheTTL      time.Duration
	maxTextLen    int
	batchSize     int
	maxConcurrent int
	logger        zerolog.Logger
}

// ServiceConfig contains embedding service configuration
type ServiceConfig struct {
	CacheTTL      time.Duration
	MaxTextLen    int
	BatchSize     int
	MaxConcurrent int
}

// NewService creates a new embedding service
func NewService(router *provider.Router, cache *redis.Client, cfg ServiceConfig, logger zerolog.Logger) *Service {
	return &Service{
		router:        router,
		cache:         cache,
		cacheTTL:      cfg.CacheTTL,
		maxTextLen:    cfg.MaxTextLen,
		batchSize:     cfg.BatchSize,
		maxConcurrent: cfg.MaxConcurrent,
		logger:        logger.With().Str("component", "embedding").Logger(),
	}
}

// EmbeddingRequest represents a single embedding request
type EmbeddingRequest struct {
	ID      string `json:"id"`      // Email ID or document ID
	Text    string `json:"text"`    // Text to embed
	OrgID   string `json:"org_id"`
	UserID  string `json:"user_id"`
}

// EmbeddingResponse represents a single embedding response
type EmbeddingResponse struct {
	ID          string    `json:"id"`
	Embedding   []float64 `json:"embedding"`
	ContentHash string    `json:"content_hash"`
	Model       string    `json:"model"`
	Provider    string    `json:"provider"`
	Cached      bool      `json:"cached"`
	LatencyMs   int64     `json:"latency_ms"`
}

// BatchEmbeddingRequest represents a batch embedding request
type BatchEmbeddingRequest struct {
	Items    []EmbeddingRequest `json:"items"`
	OrgID    string             `json:"org_id"`
	UserID   string             `json:"user_id"`
}

// BatchEmbeddingResponse represents a batch embedding response
type BatchEmbeddingResponse struct {
	Results     []EmbeddingResponse `json:"results"`
	Errors      []EmbeddingError    `json:"errors,omitempty"`
	TotalCount  int                 `json:"total_count"`
	CachedCount int                 `json:"cached_count"`
	LatencyMs   int64               `json:"latency_ms"`
}

// EmbeddingError represents an error for a single item
type EmbeddingError struct {
	ID      string `json:"id"`
	Error   string `json:"error"`
	Code    string `json:"code"`
}

// Generate generates an embedding for a single text
func (s *Service) Generate(ctx context.Context, req *EmbeddingRequest) (*EmbeddingResponse, error) {
	start := time.Now()

	// Truncate text if needed
	text := req.Text
	if len(text) > s.maxTextLen {
		text = text[:s.maxTextLen]
	}

	// Generate content hash
	contentHash := s.generateContentHash(text)

	// Check cache
	cacheKey := s.generateCacheKey(req.ID, contentHash)
	if cached, err := s.getFromCache(ctx, cacheKey); err == nil {
		cached.Cached = true
		cached.LatencyMs = time.Since(start).Milliseconds()
		return cached, nil
	}

	// Generate embedding
	embReq := &provider.EmbeddingRequest{
		Text: text,
		Metadata: provider.RequestMetadata{
			OrgID:   req.OrgID,
			UserID:  req.UserID,
			EmailID: req.ID,
			Feature: "embedding",
		},
	}

	embResp, err := s.router.EmbeddingWithFallback(ctx, embReq)
	if err != nil {
		return nil, fmt.Errorf("failed to generate embedding: %w", err)
	}

	result := &EmbeddingResponse{
		ID:          req.ID,
		Embedding:   embResp.Embedding,
		ContentHash: contentHash,
		Model:       embResp.Model,
		Provider:    embResp.Provider,
		Cached:      false,
		LatencyMs:   time.Since(start).Milliseconds(),
	}

	// Cache result
	if err := s.setInCache(ctx, cacheKey, result); err != nil {
		s.logger.Warn().Err(err).Msg("Failed to cache embedding")
	}

	return result, nil
}

// GenerateBatch generates embeddings for multiple texts
func (s *Service) GenerateBatch(ctx context.Context, req *BatchEmbeddingRequest) (*BatchEmbeddingResponse, error) {
	start := time.Now()

	results := make([]EmbeddingResponse, 0, len(req.Items))
	errors := make([]EmbeddingError, 0)
	cachedCount := 0

	// Process items that need embedding
	type embeddingItem struct {
		index       int
		request     EmbeddingRequest
		contentHash string
		cacheKey    string
	}

	toEmbed := make([]embeddingItem, 0)

	// First pass: check cache
	for i, item := range req.Items {
		text := item.Text
		if len(text) > s.maxTextLen {
			text = text[:s.maxTextLen]
		}

		contentHash := s.generateContentHash(text)
		cacheKey := s.generateCacheKey(item.ID, contentHash)

		if cached, err := s.getFromCache(ctx, cacheKey); err == nil {
			cached.Cached = true
			results = append(results, *cached)
			cachedCount++
			continue
		}

		toEmbed = append(toEmbed, embeddingItem{
			index:       i,
			request:     EmbeddingRequest{ID: item.ID, Text: text, OrgID: req.OrgID, UserID: req.UserID},
			contentHash: contentHash,
			cacheKey:    cacheKey,
		})
	}

	// Process uncached items in batches
	if len(toEmbed) > 0 {
		batchResults, batchErrors := s.processBatches(ctx, toEmbed, req.OrgID, req.UserID)
		results = append(results, batchResults...)
		errors = append(errors, batchErrors...)
	}

	return &BatchEmbeddingResponse{
		Results:     results,
		Errors:      errors,
		TotalCount:  len(req.Items),
		CachedCount: cachedCount,
		LatencyMs:   time.Since(start).Milliseconds(),
	}, nil
}

// processBatches processes items in batches with concurrency control
func (s *Service) processBatches(ctx context.Context, items []embeddingItem, orgID, userID string) ([]EmbeddingResponse, []EmbeddingError) {
	results := make([]EmbeddingResponse, 0, len(items))
	errors := make([]EmbeddingError, 0)

	// Split into batches
	batches := make([][]embeddingItem, 0)
	for i := 0; i < len(items); i += s.batchSize {
		end := i + s.batchSize
		if end > len(items) {
			end = len(items)
		}
		batches = append(batches, items[i:end])
	}

	// Process batches with limited concurrency
	resultChan := make(chan []EmbeddingResponse, len(batches))
	errorChan := make(chan []EmbeddingError, len(batches))

	g, gctx := errgroup.WithContext(ctx)
	sem := make(chan struct{}, s.maxConcurrent)

	for _, batch := range batches {
		batch := batch // capture
		g.Go(func() error {
			sem <- struct{}{}
			defer func() { <-sem }()

			batchResults, batchErrors := s.processSingleBatch(gctx, batch, orgID, userID)
			resultChan <- batchResults
			errorChan <- batchErrors
			return nil
		})
	}

	// Wait for all batches
	g.Wait()
	close(resultChan)
	close(errorChan)

	for r := range resultChan {
		results = append(results, r...)
	}
	for e := range errorChan {
		errors = append(errors, e...)
	}

	return results, errors
}

// processSingleBatch processes a single batch of items
func (s *Service) processSingleBatch(ctx context.Context, items []embeddingItem, orgID, userID string) ([]EmbeddingResponse, []EmbeddingError) {
	results := make([]EmbeddingResponse, 0, len(items))
	errors := make([]EmbeddingError, 0)

	// Get embedding provider
	provider, err := s.router.GetEmbeddingProvider(ctx)
	if err != nil {
		for _, item := range items {
			errors = append(errors, EmbeddingError{
				ID:    item.request.ID,
				Error: err.Error(),
				Code:  "provider_unavailable",
			})
		}
		return results, errors
	}

	// Prepare batch request
	texts := make([]string, len(items))
	for i, item := range items {
		texts[i] = item.request.Text
	}

	batchReq := &provider.EmbeddingBatchRequest{
		Texts: texts,
		Metadata: provider.RequestMetadata{
			OrgID:   orgID,
			UserID:  userID,
			Feature: "embedding_batch",
		},
	}

	batchResp, err := provider.GenerateEmbeddingBatch(ctx, batchReq)
	if err != nil {
		// Fall back to individual requests
		return s.processIndividually(ctx, items, orgID, userID)
	}

	// Process results
	for i, item := range items {
		if i >= len(batchResp.Embeddings) {
			errors = append(errors, EmbeddingError{
				ID:    item.request.ID,
				Error: "missing embedding in response",
				Code:  "incomplete_response",
			})
			continue
		}

		result := EmbeddingResponse{
			ID:          item.request.ID,
			Embedding:   batchResp.Embeddings[i],
			ContentHash: item.contentHash,
			Model:       batchResp.Model,
			Provider:    batchResp.Provider,
			Cached:      false,
		}

		// Cache result
		if err := s.setInCache(ctx, item.cacheKey, &result); err != nil {
			s.logger.Warn().Err(err).Str("id", item.request.ID).Msg("Failed to cache embedding")
		}

		results = append(results, result)
	}

	return results, errors
}

// processIndividually processes items one at a time (fallback)
func (s *Service) processIndividually(ctx context.Context, items []embeddingItem, orgID, userID string) ([]EmbeddingResponse, []EmbeddingError) {
	results := make([]EmbeddingResponse, 0, len(items))
	errors := make([]EmbeddingError, 0)

	for _, item := range items {
		result, err := s.Generate(ctx, &item.request)
		if err != nil {
			errors = append(errors, EmbeddingError{
				ID:    item.request.ID,
				Error: err.Error(),
				Code:  "generation_failed",
			})
			continue
		}
		results = append(results, *result)
	}

	return results, errors
}

// generateContentHash creates a SHA256 hash of content
func (s *Service) generateContentHash(text string) string {
	hash := sha256.Sum256([]byte(text))
	return hex.EncodeToString(hash[:])
}

// generateCacheKey creates a cache key
func (s *Service) generateCacheKey(id, contentHash string) string {
	return fmt.Sprintf("embedding:%s:%s", id, contentHash[:16])
}

// getFromCache retrieves cached embedding
func (s *Service) getFromCache(ctx context.Context, key string) (*EmbeddingResponse, error) {
	data, err := s.cache.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}

	var result EmbeddingResponse
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// setInCache stores embedding in cache
func (s *Service) setInCache(ctx context.Context, key string, result *EmbeddingResponse) error {
	data, err := json.Marshal(result)
	if err != nil {
		return err
	}

	return s.cache.Set(ctx, key, data, s.cacheTTL).Err()
}

// InvalidateCache removes cached embedding for an ID
func (s *Service) InvalidateCache(ctx context.Context, id string) error {
	pattern := fmt.Sprintf("embedding:%s:*", id)
	iter := s.cache.Scan(ctx, 0, pattern, 100).Iterator()

	for iter.Next(ctx) {
		if err := s.cache.Del(ctx, iter.Val()).Err(); err != nil {
			s.logger.Warn().Err(err).Str("key", iter.Val()).Msg("Failed to delete cache key")
		}
	}

	return iter.Err()
}
