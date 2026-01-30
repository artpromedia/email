package provider

import (
	"context"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
)

// Router manages provider selection and fallback
type Router struct {
	providers     map[string]Provider
	fallbackChain []string
	defaults      map[string]string // feature -> provider name
	healthStatus  map[string]bool
	healthMutex   sync.RWMutex
	logger        zerolog.Logger
}

// RouterConfig contains router configuration
type RouterConfig struct {
	FallbackChain             string // comma-separated provider names
	DefaultAnalysisProvider   string
	DefaultEmbeddingProvider  string
	DefaultSmartReplyProvider string
}

// NewRouter creates a new provider router
func NewRouter(cfg RouterConfig, logger zerolog.Logger) *Router {
	chain := strings.Split(cfg.FallbackChain, ",")
	for i := range chain {
		chain[i] = strings.TrimSpace(chain[i])
	}

	return &Router{
		providers:     make(map[string]Provider),
		fallbackChain: chain,
		defaults: map[string]string{
			"analysis":    cfg.DefaultAnalysisProvider,
			"embedding":   cfg.DefaultEmbeddingProvider,
			"smart_reply": cfg.DefaultSmartReplyProvider,
		},
		healthStatus: make(map[string]bool),
		logger:       logger.With().Str("component", "router").Logger(),
	}
}

// RegisterProvider registers a provider
func (r *Router) RegisterProvider(p Provider) {
	r.providers[p.Name()] = p
	r.logger.Info().Str("provider", p.Name()).Msg("Registered provider")
}

// GetProvider returns the best available provider for a feature
func (r *Router) GetProvider(ctx context.Context, feature string) (Provider, error) {
	// Try default provider first
	if defaultName, ok := r.defaults[feature]; ok {
		if provider, ok := r.providers[defaultName]; ok {
			if r.isHealthy(ctx, provider) {
				return provider, nil
			}
		}
	}

	// Fall back through the chain
	for _, name := range r.fallbackChain {
		if provider, ok := r.providers[name]; ok {
			if r.isHealthy(ctx, provider) {
				r.logger.Info().
					Str("feature", feature).
					Str("provider", name).
					Msg("Using fallback provider")
				return provider, nil
			}
		}
	}

	return nil, &ProviderError{
		Provider:  "router",
		Code:      ErrCodeUnavailable,
		Message:   "no available providers",
		Retryable: true,
	}
}

// GetEmbeddingProvider returns the best available embedding provider
func (r *Router) GetEmbeddingProvider(ctx context.Context) (Provider, error) {
	// Embedding requires specific provider support
	// Try default embedding provider
	if defaultName := r.defaults["embedding"]; defaultName != "" {
		if provider, ok := r.providers[defaultName]; ok {
			if r.isHealthy(ctx, provider) {
				return provider, nil
			}
		}
	}

	// Only OpenAI and Ollama support embeddings
	for _, name := range []string{"openai", "ollama"} {
		if provider, ok := r.providers[name]; ok {
			if r.isHealthy(ctx, provider) {
				return provider, nil
			}
		}
	}

	return nil, &ProviderError{
		Provider:  "router",
		Code:      ErrCodeUnavailable,
		Message:   "no embedding providers available",
		Retryable: true,
	}
}

// isHealthy checks if a provider is healthy (cached)
func (r *Router) isHealthy(ctx context.Context, p Provider) bool {
	r.healthMutex.RLock()
	healthy, ok := r.healthStatus[p.Name()]
	r.healthMutex.RUnlock()

	if ok {
		return healthy
	}

	// Check health and cache result
	healthy = p.IsAvailable(ctx)

	r.healthMutex.Lock()
	r.healthStatus[p.Name()] = healthy
	r.healthMutex.Unlock()

	return healthy
}

// StartHealthChecker starts periodic health checks
func (r *Router) StartHealthChecker(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				r.checkAllHealth(ctx)
			}
		}
	}()
}

// checkAllHealth checks health of all providers
func (r *Router) checkAllHealth(ctx context.Context) {
	for name, provider := range r.providers {
		healthy := provider.IsAvailable(ctx)

		r.healthMutex.Lock()
		prev := r.healthStatus[name]
		r.healthStatus[name] = healthy
		r.healthMutex.Unlock()

		if prev != healthy {
			if healthy {
				r.logger.Info().Str("provider", name).Msg("Provider became available")
			} else {
				r.logger.Warn().Str("provider", name).Msg("Provider became unavailable")
			}
		}
	}
}

// GetHealthStatus returns the health status of all providers
func (r *Router) GetHealthStatus() map[string]bool {
	r.healthMutex.RLock()
	defer r.healthMutex.RUnlock()

	status := make(map[string]bool, len(r.healthStatus))
	for k, v := range r.healthStatus {
		status[k] = v
	}
	return status
}

// CompleteWithFallback attempts completion with fallback
func (r *Router) CompleteWithFallback(ctx context.Context, req *CompletionRequest, feature string) (*CompletionResponse, error) {
	var lastErr error

	// Get initial provider
	provider, err := r.GetProvider(ctx, feature)
	if err != nil {
		return nil, err
	}

	// Try providers in order
	tried := make(map[string]bool)

	for attempts := 0; attempts < len(r.providers); attempts++ {
		if tried[provider.Name()] {
			continue
		}
		tried[provider.Name()] = true

		resp, err := r.completeWithRetry(ctx, provider, req)
		if err == nil {
			return resp, nil
		}

		lastErr = err

		// Check if error is retryable
		if providerErr, ok := err.(*ProviderError); ok {
			if !providerErr.IsRetryable() {
				return nil, err
			}
		}

		// Mark provider as unhealthy
		r.healthMutex.Lock()
		r.healthStatus[provider.Name()] = false
		r.healthMutex.Unlock()

		// Try next provider
		provider, err = r.GetProvider(ctx, feature)
		if err != nil {
			return nil, lastErr
		}
	}

	return nil, lastErr
}

// completeWithRetry attempts completion with exponential backoff
func (r *Router) completeWithRetry(ctx context.Context, provider Provider, req *CompletionRequest) (*CompletionResponse, error) {
	maxRetries := 3
	baseDelay := 500 * time.Millisecond

	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		resp, err := provider.Complete(ctx, req)
		if err == nil {
			return resp, nil
		}

		lastErr = err

		// Check if retryable
		if providerErr, ok := err.(*ProviderError); ok {
			if !providerErr.IsRetryable() {
				return nil, err
			}
		}

		// Check context
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		// Calculate delay with jitter
		delay := baseDelay * time.Duration(1<<attempt)
		jitter := time.Duration(rand.Int63n(int64(delay / 4)))
		delay += jitter

		r.logger.Debug().
			Str("provider", provider.Name()).
			Int("attempt", attempt+1).
			Dur("delay", delay).
			Err(err).
			Msg("Retrying after error")

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(delay):
		}
	}

	return nil, lastErr
}

// EmbeddingWithFallback attempts embedding generation with fallback
func (r *Router) EmbeddingWithFallback(ctx context.Context, req *EmbeddingRequest) (*EmbeddingResponse, error) {
	provider, err := r.GetEmbeddingProvider(ctx)
	if err != nil {
		return nil, err
	}

	return r.embeddingWithRetry(ctx, provider, req)
}

// embeddingWithRetry attempts embedding with exponential backoff
func (r *Router) embeddingWithRetry(ctx context.Context, provider Provider, req *EmbeddingRequest) (*EmbeddingResponse, error) {
	maxRetries := 3
	baseDelay := 500 * time.Millisecond

	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		resp, err := provider.GenerateEmbedding(ctx, req)
		if err == nil {
			return resp, nil
		}

		lastErr = err

		// Check if retryable
		if providerErr, ok := err.(*ProviderError); ok {
			if !providerErr.IsRetryable() {
				return nil, err
			}
		}

		// Check context
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		// Calculate delay with jitter
		delay := baseDelay * time.Duration(1<<attempt)
		jitter := time.Duration(rand.Int63n(int64(delay / 4)))
		delay += jitter

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(delay):
		}
	}

	return nil, lastErr
}
