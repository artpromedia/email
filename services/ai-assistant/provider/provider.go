package provider

import (
	"context"
	"io"
)

// Provider defines the interface for LLM providers
type Provider interface {
	// Name returns the provider name
	Name() string

	// IsAvailable checks if the provider is currently available
	IsAvailable(ctx context.Context) bool

	// Complete generates a completion for the given request
	Complete(ctx context.Context, req *CompletionRequest) (*CompletionResponse, error)

	// CompleteStream generates a streaming completion
	CompleteStream(ctx context.Context, req *CompletionRequest) (CompletionStream, error)

	// GenerateEmbedding generates embeddings for the given text
	GenerateEmbedding(ctx context.Context, req *EmbeddingRequest) (*EmbeddingResponse, error)

	// GenerateEmbeddingBatch generates embeddings for multiple texts
	GenerateEmbeddingBatch(ctx context.Context, req *EmbeddingBatchRequest) (*EmbeddingBatchResponse, error)
}

// CompletionRequest represents a request for text completion
type CompletionRequest struct {
	// Model to use (optional, uses provider default)
	Model string `json:"model,omitempty"`

	// System prompt/instructions
	SystemPrompt string `json:"system_prompt,omitempty"`

	// Messages for chat-style completion
	Messages []Message `json:"messages"`

	// Maximum tokens to generate
	MaxTokens int `json:"max_tokens,omitempty"`

	// Temperature for randomness (0.0 - 2.0)
	Temperature float64 `json:"temperature,omitempty"`

	// Top-p nucleus sampling
	TopP float64 `json:"top_p,omitempty"`

	// Stop sequences
	StopSequences []string `json:"stop_sequences,omitempty"`

	// Request metadata for tracking
	Metadata RequestMetadata `json:"metadata,omitempty"`
}

// Message represents a chat message
type Message struct {
	Role    MessageRole `json:"role"`
	Content string      `json:"content"`
}

// MessageRole defines the role of a message sender
type MessageRole string

const (
	RoleSystem    MessageRole = "system"
	RoleUser      MessageRole = "user"
	RoleAssistant MessageRole = "assistant"
)

// RequestMetadata contains tracking information
type RequestMetadata struct {
	OrgID    string `json:"org_id,omitempty"`
	UserID   string `json:"user_id,omitempty"`
	EmailID  string `json:"email_id,omitempty"`
	Feature  string `json:"feature,omitempty"`
	TraceID  string `json:"trace_id,omitempty"`
}

// CompletionResponse represents a completion response
type CompletionResponse struct {
	// Generated content
	Content string `json:"content"`

	// Model used
	Model string `json:"model"`

	// Token usage
	Usage TokenUsage `json:"usage"`

	// Finish reason
	FinishReason string `json:"finish_reason"`

	// Provider name
	Provider string `json:"provider"`

	// Response latency in milliseconds
	LatencyMs int64 `json:"latency_ms"`
}

// TokenUsage tracks token consumption
type TokenUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// CompletionStream represents a streaming completion response
type CompletionStream interface {
	// Recv receives the next chunk of the response
	Recv() (*CompletionChunk, error)

	// Close closes the stream
	Close() error
}

// CompletionChunk represents a chunk in a streaming response
type CompletionChunk struct {
	// Content delta
	Content string `json:"content"`

	// Is this the final chunk
	IsFinal bool `json:"is_final"`

	// Cumulative usage (available on final chunk)
	Usage *TokenUsage `json:"usage,omitempty"`

	// Finish reason (available on final chunk)
	FinishReason string `json:"finish_reason,omitempty"`
}

// EmbeddingRequest represents a request for text embeddings
type EmbeddingRequest struct {
	// Text to embed
	Text string `json:"text"`

	// Model to use (optional, uses provider default)
	Model string `json:"model,omitempty"`

	// Request metadata
	Metadata RequestMetadata `json:"metadata,omitempty"`
}

// EmbeddingResponse represents an embedding response
type EmbeddingResponse struct {
	// Embedding vector
	Embedding []float64 `json:"embedding"`

	// Model used
	Model string `json:"model"`

	// Token usage
	Usage TokenUsage `json:"usage"`

	// Provider name
	Provider string `json:"provider"`

	// Response latency in milliseconds
	LatencyMs int64 `json:"latency_ms"`
}

// EmbeddingBatchRequest represents a batch embedding request
type EmbeddingBatchRequest struct {
	// Texts to embed
	Texts []string `json:"texts"`

	// Model to use (optional, uses provider default)
	Model string `json:"model,omitempty"`

	// Request metadata
	Metadata RequestMetadata `json:"metadata,omitempty"`
}

// EmbeddingBatchResponse represents a batch embedding response
type EmbeddingBatchResponse struct {
	// Embeddings for each input text
	Embeddings [][]float64 `json:"embeddings"`

	// Model used
	Model string `json:"model"`

	// Total token usage
	Usage TokenUsage `json:"usage"`

	// Provider name
	Provider string `json:"provider"`

	// Response latency in milliseconds
	LatencyMs int64 `json:"latency_ms"`
}

// StreamReader wraps an io.ReadCloser for streaming responses
type StreamReader struct {
	reader  io.ReadCloser
	decoder func([]byte) (*CompletionChunk, error)
	buffer  []byte
}

// ProviderError represents an error from a provider
type ProviderError struct {
	Provider   string `json:"provider"`
	StatusCode int    `json:"status_code,omitempty"`
	Code       string `json:"code,omitempty"`
	Message    string `json:"message"`
	Retryable  bool   `json:"retryable"`
}

func (e *ProviderError) Error() string {
	return e.Provider + ": " + e.Message
}

// IsRetryable returns true if the error is retryable
func (e *ProviderError) IsRetryable() bool {
	return e.Retryable
}

// Common error codes
const (
	ErrCodeRateLimited     = "rate_limited"
	ErrCodeContextLength   = "context_length_exceeded"
	ErrCodeInvalidRequest  = "invalid_request"
	ErrCodeAuthentication  = "authentication_error"
	ErrCodeServerError     = "server_error"
	ErrCodeTimeout         = "timeout"
	ErrCodeUnavailable     = "service_unavailable"
)
