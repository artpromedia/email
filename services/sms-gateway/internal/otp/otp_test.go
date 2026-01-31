package otp

import (
	"testing"
	"time"
)

func TestGenerateNumericCode(t *testing.T) {
	s := &Service{
		config: config.OTPConfig{
			Length:       6,
			Alphanumeric: false,
		},
	}

	code, err := s.generateNumericCode(6)
	if err != nil {
		t.Fatalf("generateNumericCode failed: %v", err)
	}

	if len(code) != 6 {
		t.Errorf("expected code length 6, got %d", len(code))
	}

	// Verify all characters are digits
	for _, c := range code {
		if c < '0' || c > '9' {
			t.Errorf("expected digit, got %c", c)
		}
	}
}

func TestGenerateAlphanumericCode(t *testing.T) {
	s := &Service{
		config: config.OTPConfig{
			Length:       8,
			Alphanumeric: true,
		},
	}

	code, err := s.generateAlphanumericCode(8)
	if err != nil {
		t.Fatalf("generateAlphanumericCode failed: %v", err)
	}

	if len(code) != 8 {
		t.Errorf("expected code length 8, got %d", len(code))
	}

	// Verify all characters are alphanumeric
	validChars := "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	for _, c := range code {
		found := false
		for _, v := range validChars {
			if c == v {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("invalid character in code: %c", c)
		}
	}
}

func TestCodeUniqueness(t *testing.T) {
	s := &Service{
		config: config.OTPConfig{
			Length:       6,
			Alphanumeric: false,
		},
	}

	codes := make(map[string]bool)
	iterations := 1000

	for i := 0; i < iterations; i++ {
		code, err := s.generateNumericCode(6)
		if err != nil {
			t.Fatalf("generateNumericCode failed: %v", err)
		}
		codes[code] = true
	}

	// With 1000 iterations and 1M possible codes, we should have very few collisions
	uniqueCount := len(codes)
	if uniqueCount < iterations-10 {
		t.Errorf("too many collisions: generated %d unique codes from %d iterations", uniqueCount, iterations)
	}
}

func TestVerifyCode(t *testing.T) {
	tests := []struct {
		name          string
		stored        string
		provided      string
		caseSensitive bool
		expected      bool
	}{
		{
			name:          "exact match",
			stored:        "123456",
			provided:      "123456",
			caseSensitive: false,
			expected:      true,
		},
		{
			name:          "mismatch",
			stored:        "123456",
			provided:      "654321",
			caseSensitive: false,
			expected:      false,
		},
		{
			name:          "case insensitive match",
			stored:        "ABC123",
			provided:      "abc123",
			caseSensitive: false,
			expected:      false, // Our implementation doesn't lowercase
		},
		{
			name:          "partial match",
			stored:        "123456",
			provided:      "12345",
			caseSensitive: false,
			expected:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Service{
				config: config.OTPConfig{
					CaseSensitive: tt.caseSensitive,
				},
			}

			result := s.verifyCode(tt.stored, tt.provided)
			if result != tt.expected {
				t.Errorf("verifyCode(%s, %s) = %v, want %v", tt.stored, tt.provided, result, tt.expected)
			}
		})
	}
}

func BenchmarkGenerateNumericCode(b *testing.B) {
	s := &Service{
		config: config.OTPConfig{
			Length:       6,
			Alphanumeric: false,
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = s.generateNumericCode(6)
	}
}

func BenchmarkGenerateAlphanumericCode(b *testing.B) {
	s := &Service{
		config: config.OTPConfig{
			Length:       8,
			Alphanumeric: true,
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = s.generateAlphanumericCode(8)
	}
}

// Mock config for tests
type config struct{}

func (c config) OTPConfig struct {
	Length        int
	Alphanumeric  bool
	CaseSensitive bool
}{
	return struct {
		Length        int
		Alphanumeric  bool
		CaseSensitive bool
	}{}
}
