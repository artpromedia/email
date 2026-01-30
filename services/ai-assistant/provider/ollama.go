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

// OllamaProvider implements the Provider interface for local Ollama models
type OllamaProvider struct {
	baseURL        string
	model          string
	embeddingModel string
	httpClient     *http.Client
	logger         zerolog.Logger
}

// OllamaConfig contains Ollama provider configuration
type OllamaConfig struct {
	BaseURL        string
	Model          string
	EmbeddingModel string
	Timeout        time.Duration
}

// NewOllamaProvider creates a new Ollama provider
func NewOllamaProvider(cfg OllamaConfig, logger zerolog.Logger) *OllamaProvider {
	timeout := cfg.Timeout
	if timeout == 0 {
		timeout = 60 * time.Second // Longer timeout for local models
	}

	return &OllamaProvider{
		baseURL:        strings.TrimSuffix(cfg.BaseURL, "/"),
		model:          cfg.Model,
		embeddingModel: cfg.EmbeddingModel,
		httpClient: &http.Client{
			Timeout: timeout,
		},
		logger: logger.With().Str("provider", "ollama").Logger(),
	}
}

// Name returns the provider name
func (p *OllamaProvider) Name() string {
	return "ollama"
}

// IsAvailable checks if Ollama is available
func (p *OllamaProvider) IsAvailable(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", p.baseURL+"/api/tags", nil)
	if err != nil {
		return false
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		p.logger.Debug().Err(err).Msg("Ollama availability check failed")
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

// Ollama API types
type ollamaChatRequest struct {
	Model    string          `json:"model"`
	Messages []ollamaMessage `json:"messages"`
	Stream   bool            `json:"stream"`
	Options  *ollamaOptions  `json:"options,omitempty"`
}

type ollamaMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ollamaOptions struct {
	Temperature float64 `json:"temperature,omitempty"`
	TopP        float64 `json:"top_p,omitempty"`
	NumPredict  int     `json:"num_predict,omitempty"`
	Stop        []string `json:"stop,omitempty"`
}

type ollamaChatResponse struct {
	Model     string        `json:"model"`
	CreatedAt string        `json:"created_at"`
	Message   ollamaMessage `json:"message"`
	Done      bool          `json:"done"`
	DoneReason string       `json:"done_reason,omitempty"`
	TotalDuration    int64  `json:"total_duration,omitempty"`
	LoadDuration     int64  `json:"load_duration,omitempty"`
	PromptEvalCount  int    `json:"prompt_eval_count,omitempty"`
	EvalCount        int    `json:"eval_count,omitempty"`
}

type ollamaEmbedRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
}

type ollamaEmbedResponse struct {
	Embedding []float64 `json:"embedding"`
}

// Complete generates a completion
func (p *OllamaProvider) Complete(ctx context.Context, req *CompletionRequest) (*CompletionResponse, error) {
	start := time.Now()

	model := req.Model
	if model == "" {
		model = p.model
	}

	// Build messages
	messages := make([]ollamaMessage, 0, len(req.Messages)+1)
	if req.SystemPrompt != "" {
		messages = append(messages, ollamaMessage{
			Role:    "system",
			Content: req.SystemPrompt,
		})
	}
	for _, m := range req.Messages {
		messages = append(messages, ollamaMessage{
			Role:    string(m.Role),
			Content: m.Content,
		})
	}

	options := &ollamaOptions{}
	if req.Temperature > 0 {
		options.Temperature = req.Temperature
	}
	if req.TopP > 0 {
		options.TopP = req.TopP
	}
	if req.MaxTokens > 0 {
		options.NumPredict = req.MaxTokens
	}
	if len(req.StopSequences) > 0 {
		options.Stop = req.StopSequences
	}

	reqBody := ollamaChatRequest{
		Model:    model,
		Messages: messages,
		Stream:   false,
		Options:  options,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

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
		return nil, &ProviderError{
			Provider:   p.Name(),
			StatusCode: resp.StatusCode,
			Code:       ErrCodeServerError,
			Message:    string(respBody),
			Retryable:  resp.StatusCode >= 500,
		}
	}

	var ollamaResp ollamaChatResponse
	if err := json.Unmarshal(respBody, &ollamaResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &CompletionResponse{
		Content:      ollamaResp.Message.Content,
		Model:        ollamaResp.Model,
		FinishReason: ollamaResp.DoneReason,
		Provider:     p.Name(),
		LatencyMs:    time.Since(start).Milliseconds(),
		Usage: TokenUsage{
			PromptTokens:     ollamaResp.PromptEvalCount,
			CompletionTokens: ollamaResp.EvalCount,
			TotalTokens:      ollamaResp.PromptEvalCount + ollamaResp.EvalCount,
		},
	}, nil
}

// CompleteStream generates a streaming completion
func (p *OllamaProvider) CompleteStream(ctx context.Context, req *CompletionRequest) (CompletionStream, error) {
	model := req.Model
	if model == "" {
		model = p.model
	}

	// Build messages
	messages := make([]ollamaMessage, 0, len(req.Messages)+1)
	if req.SystemPrompt != "" {
		messages = append(messages, ollamaMessage{
			Role:    "system",
			Content: req.SystemPrompt,
		})
	}
	for _, m := range req.Messages {
		messages = append(messages, ollamaMessage{
			Role:    string(m.Role),
			Content: m.Content,
		})
	}

	options := &ollamaOptions{}
	if req.Temperature > 0 {
		options.Temperature = req.Temperature
	}
	if req.TopP > 0 {
		options.TopP = req.TopP
	}
	if req.MaxTokens > 0 {
		options.NumPredict = req.MaxTokens
	}

	reqBody := ollamaChatRequest{
		Model:    model,
		Messages: messages,
		Stream:   true,
		Options:  options,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

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
		return nil, &ProviderError{
			Provider:   p.Name(),
			StatusCode: resp.StatusCode,
			Code:       ErrCodeServerError,
			Message:    string(respBody),
			Retryable:  resp.StatusCode >= 500,
		}
	}

	return &ollamaStream{
		reader:   bufio.NewReader(resp.Body),
		body:     resp.Body,
		provider: p.Name(),
	}, nil
}

// ollamaStream implements CompletionStream for Ollama
type ollamaStream struct {
	reader   *bufio.Reader
	body     io.ReadCloser
	provider string
	usage    *TokenUsage
}

func (s *ollamaStream) Recv() (*CompletionChunk, error) {
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

	var resp ollamaChatResponse
	if err := json.Unmarshal(line, &resp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal chunk: %w", err)
	}

	if resp.Done {
		s.usage = &TokenUsage{
			PromptTokens:     resp.PromptEvalCount,
			CompletionTokens: resp.EvalCount,
			TotalTokens:      resp.PromptEvalCount + resp.EvalCount,
		}
		return &CompletionChunk{
			Content:      resp.Message.Content,
			IsFinal:      true,
			FinishReason: resp.DoneReason,
			Usage:        s.usage,
		}, io.EOF
	}

	return &CompletionChunk{
		Content: resp.Message.Content,
		IsFinal: false,
	}, nil
}

func (s *ollamaStream) Close() error {
	return s.body.Close()
}

// GenerateEmbedding generates embeddings for text
func (p *OllamaProvider) GenerateEmbedding(ctx context.Context, req *EmbeddingRequest) (*EmbeddingResponse, error) {
	start := time.Now()

	model := req.Model
	if model == "" {
		model = p.embeddingModel
	}

	reqBody := ollamaEmbedRequest{
		Model:  model,
		Prompt: req.Text,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/api/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

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
		return nil, &ProviderError{
			Provider:   p.Name(),
			StatusCode: resp.StatusCode,
			Code:       ErrCodeServerError,
			Message:    string(respBody),
			Retryable:  resp.StatusCode >= 500,
		}
	}

	var embedResp ollamaEmbedResponse
	if err := json.Unmarshal(respBody, &embedResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &EmbeddingResponse{
		Embedding: embedResp.Embedding,
		Model:     model,
		Provider:  p.Name(),
		LatencyMs: time.Since(start).Milliseconds(),
		Usage: TokenUsage{
			PromptTokens: len(req.Text) / 4, // Rough estimate
			TotalTokens:  len(req.Text) / 4,
		},
	}, nil
}

// GenerateEmbeddingBatch generates embeddings for multiple texts
func (p *OllamaProvider) GenerateEmbeddingBatch(ctx context.Context, req *EmbeddingBatchRequest) (*EmbeddingBatchResponse, error) {
	start := time.Now()

	embeddings := make([][]float64, len(req.Texts))
	var totalTokens int

	for i, text := range req.Texts {
		embReq := &EmbeddingRequest{
			Text:     text,
			Model:    req.Model,
			Metadata: req.Metadata,
		}

		embResp, err := p.GenerateEmbedding(ctx, embReq)
		if err != nil {
			return nil, fmt.Errorf("failed to generate embedding for text %d: %w", i, err)
		}

		embeddings[i] = embResp.Embedding
		totalTokens += embResp.Usage.TotalTokens
	}

	model := req.Model
	if model == "" {
		model = p.embeddingModel
	}

	return &EmbeddingBatchResponse{
		Embeddings: embeddings,
		Model:      model,
		Provider:   p.Name(),
		LatencyMs:  time.Since(start).Milliseconds(),
		Usage: TokenUsage{
			PromptTokens: totalTokens,
			TotalTokens:  totalTokens,
		},
	}, nil
}
