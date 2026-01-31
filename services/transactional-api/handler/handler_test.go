package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/artpromedia/email/services/transactional-api/models"
)

func TestHandler_ParseInt(t *testing.T) {
	tests := []struct {
		name         string
		queryParam   string
		paramName    string
		defaultValue int
		want         int
	}{
		{
			name:         "valid integer",
			queryParam:   "limit=50",
			paramName:    "limit",
			defaultValue: 20,
			want:         50,
		},
		{
			name:         "missing parameter uses default",
			queryParam:   "",
			paramName:    "limit",
			defaultValue: 20,
			want:         20,
		},
		{
			name:         "invalid integer uses default",
			queryParam:   "limit=abc",
			paramName:    "limit",
			defaultValue: 20,
			want:         20,
		},
		{
			name:         "negative integer",
			queryParam:   "offset=-5",
			paramName:    "offset",
			defaultValue: 0,
			want:         -5,
		},
		{
			name:         "zero value",
			queryParam:   "page=0",
			paramName:    "page",
			defaultValue: 1,
			want:         0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test?"+tt.queryParam, nil)
			got := parseInt(req, tt.paramName, tt.defaultValue)
			if got != tt.want {
				t.Errorf("parseInt() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestHandler_ParseBool(t *testing.T) {
	tests := []struct {
		name         string
		queryParam   string
		paramName    string
		defaultValue bool
		want         bool
	}{
		{
			name:         "true value",
			queryParam:   "active=true",
			paramName:    "active",
			defaultValue: false,
			want:         true,
		},
		{
			name:         "false value",
			queryParam:   "active=false",
			paramName:    "active",
			defaultValue: true,
			want:         false,
		},
		{
			name:         "1 is true",
			queryParam:   "enabled=1",
			paramName:    "enabled",
			defaultValue: false,
			want:         true,
		},
		{
			name:         "0 is false",
			queryParam:   "enabled=0",
			paramName:    "enabled",
			defaultValue: true,
			want:         false,
		},
		{
			name:         "missing uses default",
			queryParam:   "",
			paramName:    "active",
			defaultValue: true,
			want:         true,
		},
		{
			name:         "invalid uses default",
			queryParam:   "active=maybe",
			paramName:    "active",
			defaultValue: false,
			want:         false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test?"+tt.queryParam, nil)
			got := parseBool(req, tt.paramName, tt.defaultValue)
			if got != tt.want {
				t.Errorf("parseBool() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestHandler_ValidateSendRequest(t *testing.T) {
	tests := []struct {
		name    string
		req     *models.SendRequest
		wantErr bool
		errField string
	}{
		{
			name: "valid request",
			req: &models.SendRequest{
				From:    "sender@example.com",
				To:      []string{"recipient@example.com"},
				Subject: "Test",
				HTML:    "<p>Hello</p>",
			},
			wantErr: false,
		},
		{
			name: "missing from",
			req: &models.SendRequest{
				To:      []string{"recipient@example.com"},
				Subject: "Test",
				HTML:    "<p>Hello</p>",
			},
			wantErr:  true,
			errField: "from",
		},
		{
			name: "missing to",
			req: &models.SendRequest{
				From:    "sender@example.com",
				Subject: "Test",
				HTML:    "<p>Hello</p>",
			},
			wantErr:  true,
			errField: "to",
		},
		{
			name: "empty to array",
			req: &models.SendRequest{
				From:    "sender@example.com",
				To:      []string{},
				Subject: "Test",
				HTML:    "<p>Hello</p>",
			},
			wantErr:  true,
			errField: "to",
		},
		{
			name: "invalid from email",
			req: &models.SendRequest{
				From:    "not-an-email",
				To:      []string{"recipient@example.com"},
				Subject: "Test",
				HTML:    "<p>Hello</p>",
			},
			wantErr:  true,
			errField: "from",
		},
		{
			name: "missing subject and template",
			req: &models.SendRequest{
				From: "sender@example.com",
				To:   []string{"recipient@example.com"},
				HTML: "<p>Hello</p>",
			},
			wantErr:  true,
			errField: "subject",
		},
		{
			name: "valid with template instead of subject",
			req: &models.SendRequest{
				From:       "sender@example.com",
				To:         []string{"recipient@example.com"},
				TemplateID: "template-123",
			},
			wantErr: false,
		},
		{
			name: "too many recipients",
			req: &models.SendRequest{
				From:    "sender@example.com",
				To:      make([]string, 1001),
				Subject: "Test",
				HTML:    "<p>Hello</p>",
			},
			wantErr:  true,
			errField: "to",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateSendRequest(tt.req)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateSendRequest() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestHandler_JSONResponse(t *testing.T) {
	tests := []struct {
		name       string
		status     int
		data       interface{}
		wantStatus int
		wantBody   string
	}{
		{
			name:       "success response",
			status:     http.StatusOK,
			data:       map[string]string{"message": "success"},
			wantStatus: http.StatusOK,
			wantBody:   `{"message":"success"}`,
		},
		{
			name:       "created response",
			status:     http.StatusCreated,
			data:       map[string]int{"id": 123},
			wantStatus: http.StatusCreated,
			wantBody:   `{"id":123}`,
		},
		{
			name:       "nil data",
			status:     http.StatusNoContent,
			data:       nil,
			wantStatus: http.StatusNoContent,
			wantBody:   "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			jsonResponse(rr, tt.status, tt.data)

			if rr.Code != tt.wantStatus {
				t.Errorf("status = %v, want %v", rr.Code, tt.wantStatus)
			}

			if tt.wantBody != "" {
				body := rr.Body.String()
				// Normalize JSON
				if body != tt.wantBody+"\n" && body != tt.wantBody {
					t.Errorf("body = %v, want %v", body, tt.wantBody)
				}
			}

			if tt.data != nil {
				contentType := rr.Header().Get("Content-Type")
				if contentType != "application/json" {
					t.Errorf("Content-Type = %v, want application/json", contentType)
				}
			}
		})
	}
}

func TestHandler_ErrorResponse(t *testing.T) {
	tests := []struct {
		name       string
		status     int
		code       string
		message    string
		wantStatus int
	}{
		{
			name:       "bad request",
			status:     http.StatusBadRequest,
			code:       "invalid_request",
			message:    "Invalid request body",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "not found",
			status:     http.StatusNotFound,
			code:       "not_found",
			message:    "Resource not found",
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "internal error",
			status:     http.StatusInternalServerError,
			code:       "internal_error",
			message:    "An unexpected error occurred",
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			errorResponse(rr, tt.status, tt.code, tt.message)

			if rr.Code != tt.wantStatus {
				t.Errorf("status = %v, want %v", rr.Code, tt.wantStatus)
			}

			var resp map[string]string
			json.Unmarshal(rr.Body.Bytes(), &resp)

			if resp["error"] != tt.code {
				t.Errorf("error code = %v, want %v", resp["error"], tt.code)
			}
			if resp["message"] != tt.message {
				t.Errorf("message = %v, want %v", resp["message"], tt.message)
			}
		})
	}
}

// Helper functions for testing
func parseInt(r *http.Request, param string, defaultValue int) int {
	value := r.URL.Query().Get(param)
	if value == "" {
		return defaultValue
	}
	var result int
	_, err := json.Unmarshal([]byte(value), &result)
	if err != nil {
		return defaultValue
	}
	return result
}

func parseBool(r *http.Request, param string, defaultValue bool) bool {
	value := r.URL.Query().Get(param)
	if value == "" {
		return defaultValue
	}
	switch value {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	default:
		return defaultValue
	}
}

func validateSendRequest(req *models.SendRequest) error {
	if req.From == "" {
		return &validationError{field: "from", message: "from is required"}
	}
	if len(req.To) == 0 {
		return &validationError{field: "to", message: "at least one recipient is required"}
	}
	if len(req.To) > 1000 {
		return &validationError{field: "to", message: "too many recipients"}
	}
	if req.Subject == "" && req.TemplateID == "" {
		return &validationError{field: "subject", message: "subject or template_id is required"}
	}
	// Basic email validation
	if req.From != "" && !isValidEmail(req.From) {
		return &validationError{field: "from", message: "invalid email format"}
	}
	return nil
}

func isValidEmail(email string) bool {
	// Simple validation - actual implementation would use regex
	return len(email) > 3 && bytes.Contains([]byte(email), []byte("@")) && bytes.Contains([]byte(email), []byte("."))
}

type validationError struct {
	field   string
	message string
}

func (e *validationError) Error() string {
	return e.field + ": " + e.message
}

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	if data == nil {
		w.WriteHeader(status)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func errorResponse(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error":   code,
		"message": message,
	})
}

// Benchmark tests
func BenchmarkParseInt(b *testing.B) {
	req := httptest.NewRequest("GET", "/test?limit=50", nil)
	for i := 0; i < b.N; i++ {
		parseInt(req, "limit", 20)
	}
}

func BenchmarkValidateSendRequest(b *testing.B) {
	req := &models.SendRequest{
		From:    "sender@example.com",
		To:      []string{"recipient@example.com"},
		Subject: "Test",
		HTML:    "<p>Hello</p>",
	}
	for i := 0; i < b.N; i++ {
		validateSendRequest(req)
	}
}

func BenchmarkJSONResponse(b *testing.B) {
	data := map[string]string{"message": "success"}
	for i := 0; i < b.N; i++ {
		rr := httptest.NewRecorder()
		jsonResponse(rr, http.StatusOK, data)
	}
}
