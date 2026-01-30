package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog"
)

// AnthropicProvider implements the Provider interface for Anthropic Claude
type AnthropicProvider struct {
	apiKey      string
	baseURL     string
	model       string
	maxTokens   int
	temperature float64
	httpClient  *http.Client
	logger      zerolog.Logger
}

// AnthropicConfig contains Anthropic provider configuration
type AnthropicConfig struct {
	APIKey      string
	BaseURL     string
	Model       string
	MaxTokens   int
	Temperature float64
	Timeout     time.Duration
}

// NewAnthropicProvider creates a new Anthropic provider
func NewAnthropicProvider(cfg AnthropicConfig, logger zerolog.Logger) *AnthropicProvider {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	return &AnthropicProvider{
		apiKey:      cfg.APIKey,
		baseURL:     strings.TrimSuffix(cfg.BaseURL, "/"),
		model:       cfg.Model,
		maxTokens:   cfg.MaxTokens,
		temperature: cfg.Temperature,
		httpClient: &http.Client{
			Timeout: timeout,
		},
		logger: logger.With().Str("provider", "anthropic").Logger(),
	}
}

// Name returns the provider name
func (p *AnthropicProvider) Name() string {
	return "anthropic"
}

// IsAvailable checks if Anthropic is available
func (p *AnthropicProvider) IsAvailable(ctx context.Context) bool {
	return p.apiKey != ""
}

// Anthropic API types
type anthropicRequest struct {
	Model       string             `json:"model"`
	MaxTokens   int                `json:"max_tokens"`
	Messages    []anthropicMessage `json:"messages"`
	System      string             `json:"system,omitempty"`
	Temperature float64            `json:"temperature,omitempty"`
	TopP        float64            `json:"top_p,omitempty"`
	StopSequences []string         `json:"stop_sequences,omitempty"`
	Stream      bool               `json:"stream,omitempty"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicResponse struct {
	ID           string `json:"id"`
	Type         string `json:"type"`
	Role         string `json:"role"`
	Content      []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Model        string `json:"model"`
	StopReason   string `json:"stop_reason"`
	StopSequence string `json:"stop_sequence,omitempty"`
	Usage        struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

type anthropicStreamEvent struct {
	Type         string `json:"type"`
	Index        int    `json:"index,omitempty"`
	ContentBlock *struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content_block,omitempty"`
	Delta *struct {
		Type       string `json:"type"`
		Text       string `json:"text,omitempty"`
		StopReason string `json:"stop_reason,omitempty"`
	} `json:"delta,omitempty"`
	Message *anthropicResponse `json:"message,omitempty"`
	Usage   *struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage,omitempty"`
}

type anthropicErrorResponse struct {
	Type  string `json:"type"`
	Error struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

// Complete generates a completion
func (p *AnthropicProvider) Complete(ctx context.Context, req *CompletionRequest) (*CompletionResponse, error) {
	start := time.Now()

	model := req.Model
	if model == "" {
		model = p.model
	}

	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = p.maxTokens
	}

	temperature := req.Temperature
	if temperature == 0 {
		temperature = p.temperature
	}

	// Build messages (Anthropic doesn't have system in messages)
	messages := make([]anthropicMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		if m.Role == RoleSystem {
			continue // System is handled separately
		}
		role := string(m.Role)
		if m.Role == RoleAssistant {
			role = "assistant"
		} else {
			role = "user"
		}
		messages = append(messages, anthropicMessage{
			Role:    role,
			Content: m.Content,
		})
	}

	reqBody := anthropicRequest{
		Model:         model,
		MaxTokens:     maxTokens,
		Messages:      messages,
		System:        req.SystemPrompt,
		Temperature:   temperature,
		TopP:          req.TopP,
		StopSequences: req.StopSequences,
		Stream:        false,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return nil, &ProviderError{
			Provider:  p.Name(),
			Code:      ErrCodeTimeout,
			Message:   err.Error(),
			Retryable: true,
		}
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, p.parseError(resp.StatusCode, respBody)
	}

	var anthropicResp anthropicResponse
	if err := json.Unmarshal(respBody, &anthropicResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	content := ""
	if len(anthropicResp.Content) > 0 {
		content = anthropicResp.Content[0].Text
	}

	return &CompletionResponse{
		Content:      content,
		Model:        anthropicResp.Model,
		FinishReason: anthropicResp.StopReason,
		Provider:     p.Name(),
		LatencyMs:    time.Since(start).Milliseconds(),
		Usage: TokenUsage{
			PromptTokens:     anthropicResp.Usage.InputTokens,
			CompletionTokens: anthropicResp.Usage.OutputTokens,
			TotalTokens:      anthropicResp.Usage.InputTokens + anthropicResp.Usage.OutputTokens,
		},
	}, nil
}

// CompleteStream generates a streaming completion
func (p *AnthropicProvider) CompleteStream(ctx context.Context, req *CompletionRequest) (CompletionStream, error) {
	model := req.Model
	if model == "" {
		model = p.model
	}

	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = p.maxTokens
	}

	temperature := req.Temperature
	if temperature == 0 {
		temperature = p.temperature
	}

	// Build messages
	messages := make([]anthropicMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		if m.Role == RoleSystem {
			continue
		}
		role := "user"
		if m.Role == RoleAssistant {
			role = "assistant"
		}
		messages = append(messages, anthropicMessage{
			Role:    role,
			Content: m.Content,
		})
	}

	reqBody := anthropicRequest{
		Model:         model,
		MaxTokens:     maxTokens,
		Messages:      messages,
		System:        req.SystemPrompt,
		Temperature:   temperature,
		TopP:          req.TopP,
		StopSequences: req.StopSequences,
		Stream:        true,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	httpReq.Header.Set("Accept", "text/event-stream")

	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return nil, &ProviderError{
			Provider:  p.Name(),
			Code:      ErrCodeTimeout,
			Message:   err.Error(),
			Retryable: true,
		}
	}

	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		return nil, p.parseError(resp.StatusCode, respBody)
	}

	return &anthropicStream{
		reader:   bufio.NewReader(resp.Body),
		body:     resp.Body,
		provider: p.Name(),
	}, nil
}

// anthropicStream implements CompletionStream for Anthropic
type anthropicStream struct {
	reader   *bufio.Reader
	body     io.ReadCloser
	provider string
	usage    *TokenUsage
}

func (s *anthropicStream) Recv() (*CompletionChunk, error) {
	for {
		line, err := s.reader.ReadBytes('\n')
		if err != nil {
			if err == io.EOF {
				return &CompletionChunk{
					IsFinal: true,
					Usage:   s.usage,
				}, io.EOF
			}
			return nil, err
		}

		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			continue
		}

		// Check for SSE data prefix
		if !bytes.HasPrefix(line, []byte("data: ")) {
			continue
		}

		data := bytes.TrimPrefix(line, []byte("data: "))

		var event anthropicStreamEvent
		if err := json.Unmarshal(data, &event); err != nil {
			continue
		}

		switch event.Type {
		case "content_block_delta":
			if event.Delta != nil && event.Delta.Text != "" {
				return &CompletionChunk{
					Content: event.Delta.Text,
					IsFinal: false,
				}, nil
			}
		case "message_delta":
			if event.Usage != nil {
				s.usage = &TokenUsage{
					PromptTokens:     event.Usage.InputTokens,
					CompletionTokens: event.Usage.OutputTokens,
					TotalTokens:      event.Usage.InputTokens + event.Usage.OutputTokens,
				}
			}
			finishReason := ""
			if event.Delta != nil {
				finishReason = event.Delta.StopReason
			}
			return &CompletionChunk{
				IsFinal:      true,
				FinishReason: finishReason,
				Usage:        s.usage,
			}, nil
		case "message_stop":
			return &CompletionChunk{
				IsFinal: true,
				Usage:   s.usage,
			}, io.EOF
		}
	}
}

func (s *anthropicStream) Close() error {
	return s.body.Close()
}

// GenerateEmbedding is not supported by Anthropic
func (p *AnthropicProvider) GenerateEmbedding(ctx context.Context, req *EmbeddingRequest) (*EmbeddingResponse, error) {
	return nil, &ProviderError{
		Provider:  p.Name(),
		Code:      ErrCodeInvalidRequest,
		Message:   "Anthropic does not support embeddings",
		Retryable: false,
	}
}

// GenerateEmbeddingBatch is not supported by Anthropic
func (p *AnthropicProvider) GenerateEmbeddingBatch(ctx context.Context, req *EmbeddingBatchRequest) (*EmbeddingBatchResponse, error) {
	return nil, &ProviderError{
		Provider:  p.Name(),
		Code:      ErrCodeInvalidRequest,
		Message:   "Anthropic does not support embeddings",
		Retryable: false,
	}
}

// parseError converts Anthropic error responses to ProviderError
func (p *AnthropicProvider) parseError(statusCode int, body []byte) *ProviderError {
	var errResp anthropicErrorResponse
	json.Unmarshal(body, &errResp)

	code := ErrCodeServerError
	retryable := false

	switch statusCode {
	case http.StatusTooManyRequests:
		code = ErrCodeRateLimited
		retryable = true
	case http.StatusUnauthorized:
		code = ErrCodeAuthentication
	case http.StatusBadRequest:
		code = ErrCodeInvalidRequest
	case http.StatusServiceUnavailable, http.StatusBadGateway, http.StatusGatewayTimeout:
		code = ErrCodeUnavailable
		retryable = true
	case http.StatusInternalServerError:
		code = ErrCodeServerError
		retryable = true
	}

	message := errResp.Error.Message
	if message == "" {
		message = fmt.Sprintf("HTTP %d", statusCode)
	}

	return &ProviderError{
		Provider:   p.Name(),
		StatusCode: statusCode,
		Code:       code,
		Message:    message,
		Retryable:  retryable,
	}
}
