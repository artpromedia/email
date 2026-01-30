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

// OpenAIProvider implements the Provider interface for OpenAI
type OpenAIProvider struct {
	apiKey         string
	organization   string
	baseURL        string
	model          string
	embeddingModel string
	maxTokens      int
	temperature    float64
	httpClient     *http.Client
	logger         zerolog.Logger
}

// OpenAIConfig contains OpenAI provider configuration
type OpenAIConfig struct {
	APIKey         string
	Organization   string
	BaseURL        string
	Model          string
	EmbeddingModel string
	MaxTokens      int
	Temperature    float64
	Timeout        time.Duration
}

// NewOpenAIProvider creates a new OpenAI provider
func NewOpenAIProvider(cfg OpenAIConfig, logger zerolog.Logger) *OpenAIProvider {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	return &OpenAIProvider{
		apiKey:         cfg.APIKey,
		organization:   cfg.Organization,
		baseURL:        strings.TrimSuffix(cfg.BaseURL, "/"),
		model:          cfg.Model,
		embeddingModel: cfg.EmbeddingModel,
		maxTokens:      cfg.MaxTokens,
		temperature:    cfg.Temperature,
		httpClient: &http.Client{
			Timeout: timeout,
		},
		logger: logger.With().Str("provider", "openai").Logger(),
	}
}

// Name returns the provider name
func (p *OpenAIProvider) Name() string {
	return "openai"
}

// IsAvailable checks if OpenAI is available
func (p *OpenAIProvider) IsAvailable(ctx context.Context) bool {
	if p.apiKey == "" {
		return false
	}

	// Quick health check by listing models
	req, err := http.NewRequestWithContext(ctx, "GET", p.baseURL+"/models", nil)
	if err != nil {
		return false
	}

	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	if p.organization != "" {
		req.Header.Set("OpenAI-Organization", p.organization)
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	resp, err := p.httpClient.Do(req.WithContext(ctx))
	if err != nil {
		p.logger.Debug().Err(err).Msg("OpenAI availability check failed")
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

// OpenAI API request/response types
type openAIChatRequest struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Temperature float64         `json:"temperature,omitempty"`
	TopP        float64         `json:"top_p,omitempty"`
	Stop        []string        `json:"stop,omitempty"`
	Stream      bool            `json:"stream,omitempty"`
}

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIChatResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index        int           `json:"index"`
		Message      openAIMessage `json:"message"`
		FinishReason string        `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

type openAIStreamChunk struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index int `json:"index"`
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage,omitempty"`
}

type openAIEmbeddingRequest struct {
	Model string   `json:"model"`
	Input []string `json:"input"`
}

type openAIEmbeddingResponse struct {
	Object string `json:"object"`
	Data   []struct {
		Object    string    `json:"object"`
		Index     int       `json:"index"`
		Embedding []float64 `json:"embedding"`
	} `json:"data"`
	Model string `json:"model"`
	Usage struct {
		PromptTokens int `json:"prompt_tokens"`
		TotalTokens  int `json:"total_tokens"`
	} `json:"usage"`
}

type openAIErrorResponse struct {
	Error struct {
		Message string `json:"message"`
		Type    string `json:"type"`
		Code    string `json:"code"`
	} `json:"error"`
}

// Complete generates a completion
func (p *OpenAIProvider) Complete(ctx context.Context, req *CompletionRequest) (*CompletionResponse, error) {
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

	// Build messages
	messages := make([]openAIMessage, 0, len(req.Messages)+1)
	if req.SystemPrompt != "" {
		messages = append(messages, openAIMessage{
			Role:    "system",
			Content: req.SystemPrompt,
		})
	}
	for _, m := range req.Messages {
		messages = append(messages, openAIMessage{
			Role:    string(m.Role),
			Content: m.Content,
		})
	}

	reqBody := openAIChatRequest{
		Model:       model,
		Messages:    messages,
		MaxTokens:   maxTokens,
		Temperature: temperature,
		TopP:        req.TopP,
		Stop:        req.StopSequences,
		Stream:      false,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	if p.organization != "" {
		httpReq.Header.Set("OpenAI-Organization", p.organization)
	}

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

	var chatResp openAIChatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	content := ""
	finishReason := ""
	if len(chatResp.Choices) > 0 {
		content = chatResp.Choices[0].Message.Content
		finishReason = chatResp.Choices[0].FinishReason
	}

	return &CompletionResponse{
		Content:      content,
		Model:        chatResp.Model,
		FinishReason: finishReason,
		Provider:     p.Name(),
		LatencyMs:    time.Since(start).Milliseconds(),
		Usage: TokenUsage{
			PromptTokens:     chatResp.Usage.PromptTokens,
			CompletionTokens: chatResp.Usage.CompletionTokens,
			TotalTokens:      chatResp.Usage.TotalTokens,
		},
	}, nil
}

// CompleteStream generates a streaming completion
func (p *OpenAIProvider) CompleteStream(ctx context.Context, req *CompletionRequest) (CompletionStream, error) {
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
	messages := make([]openAIMessage, 0, len(req.Messages)+1)
	if req.SystemPrompt != "" {
		messages = append(messages, openAIMessage{
			Role:    "system",
			Content: req.SystemPrompt,
		})
	}
	for _, m := range req.Messages {
		messages = append(messages, openAIMessage{
			Role:    string(m.Role),
			Content: m.Content,
		})
	}

	reqBody := openAIChatRequest{
		Model:       model,
		Messages:    messages,
		MaxTokens:   maxTokens,
		Temperature: temperature,
		TopP:        req.TopP,
		Stop:        req.StopSequences,
		Stream:      true,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("Accept", "text/event-stream")
	if p.organization != "" {
		httpReq.Header.Set("OpenAI-Organization", p.organization)
	}

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

	return &openAIStream{
		reader:   bufio.NewReader(resp.Body),
		body:     resp.Body,
		provider: p.Name(),
	}, nil
}

// openAIStream implements CompletionStream for OpenAI
type openAIStream struct {
	reader   *bufio.Reader
	body     io.ReadCloser
	provider string
	usage    *TokenUsage
}

func (s *openAIStream) Recv() (*CompletionChunk, error) {
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
		if string(data) == "[DONE]" {
			return &CompletionChunk{
				IsFinal: true,
				Usage:   s.usage,
			}, io.EOF
		}

		var chunk openAIStreamChunk
		if err := json.Unmarshal(data, &chunk); err != nil {
			continue
		}

		if chunk.Usage != nil {
			s.usage = &TokenUsage{
				PromptTokens:     chunk.Usage.PromptTokens,
				CompletionTokens: chunk.Usage.CompletionTokens,
				TotalTokens:      chunk.Usage.TotalTokens,
			}
		}

		content := ""
		finishReason := ""
		if len(chunk.Choices) > 0 {
			content = chunk.Choices[0].Delta.Content
			finishReason = chunk.Choices[0].FinishReason
		}

		isFinal := finishReason != ""

		return &CompletionChunk{
			Content:      content,
			IsFinal:      isFinal,
			FinishReason: finishReason,
			Usage:        s.usage,
		}, nil
	}
}

func (s *openAIStream) Close() error {
	return s.body.Close()
}

// GenerateEmbedding generates embeddings for text
func (p *OpenAIProvider) GenerateEmbedding(ctx context.Context, req *EmbeddingRequest) (*EmbeddingResponse, error) {
	batchReq := &EmbeddingBatchRequest{
		Texts:    []string{req.Text},
		Model:    req.Model,
		Metadata: req.Metadata,
	}

	batchResp, err := p.GenerateEmbeddingBatch(ctx, batchReq)
	if err != nil {
		return nil, err
	}

	if len(batchResp.Embeddings) == 0 {
		return nil, fmt.Errorf("no embeddings returned")
	}

	return &EmbeddingResponse{
		Embedding: batchResp.Embeddings[0],
		Model:     batchResp.Model,
		Usage:     batchResp.Usage,
		Provider:  batchResp.Provider,
		LatencyMs: batchResp.LatencyMs,
	}, nil
}

// GenerateEmbeddingBatch generates embeddings for multiple texts
func (p *OpenAIProvider) GenerateEmbeddingBatch(ctx context.Context, req *EmbeddingBatchRequest) (*EmbeddingBatchResponse, error) {
	start := time.Now()

	model := req.Model
	if model == "" {
		model = p.embeddingModel
	}

	reqBody := openAIEmbeddingRequest{
		Model: model,
		Input: req.Texts,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	if p.organization != "" {
		httpReq.Header.Set("OpenAI-Organization", p.organization)
	}

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

	var embResp openAIEmbeddingResponse
	if err := json.Unmarshal(respBody, &embResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	// Sort embeddings by index to maintain order
	embeddings := make([][]float64, len(req.Texts))
	for _, d := range embResp.Data {
		if d.Index < len(embeddings) {
			embeddings[d.Index] = d.Embedding
		}
	}

	return &EmbeddingBatchResponse{
		Embeddings: embeddings,
		Model:      embResp.Model,
		Provider:   p.Name(),
		LatencyMs:  time.Since(start).Milliseconds(),
		Usage: TokenUsage{
			PromptTokens: embResp.Usage.PromptTokens,
			TotalTokens:  embResp.Usage.TotalTokens,
		},
	}, nil
}

// parseError converts OpenAI error responses to ProviderError
func (p *OpenAIProvider) parseError(statusCode int, body []byte) *ProviderError {
	var errResp openAIErrorResponse
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
		if strings.Contains(errResp.Error.Code, "context_length") {
			code = ErrCodeContextLength
		}
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
