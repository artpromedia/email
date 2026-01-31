package spf

import (
	"context"
	"net"
	"testing"

	"go.uber.org/zap"
)

func TestNewValidator(t *testing.T) {
	logger := zap.NewNop()
	validator := NewValidator(logger)

	if validator == nil {
		t.Fatal("NewValidator() returned nil")
	}
	if validator.logger == nil {
		t.Error("NewValidator() did not set logger")
	}
	if validator.resolver == nil {
		t.Error("NewValidator() did not set resolver")
	}
	if validator.timeout <= 0 {
		t.Error("NewValidator() should set a positive timeout")
	}
	if validator.maxLookups != 10 {
		t.Errorf("NewValidator() maxLookups = %d, want 10", validator.maxLookups)
	}
}

func TestCheckIP4(t *testing.T) {
	logger := zap.NewNop()
	validator := NewValidator(logger)

	tests := []struct {
		name     string
		cidr     string
		ip       net.IP
		expected bool
	}{
		{
			name:     "exact IP match",
			cidr:     "192.168.1.1",
			ip:       net.ParseIP("192.168.1.1"),
			expected: true,
		},
		{
			name:     "IP in /24 range",
			cidr:     "192.168.1.0/24",
			ip:       net.ParseIP("192.168.1.100"),
			expected: true,
		},
		{
			name:     "IP not in range",
			cidr:     "192.168.1.0/24",
			ip:       net.ParseIP("192.168.2.1"),
			expected: false,
		},
		{
			name:     "IPv6 address against IPv4 CIDR",
			cidr:     "192.168.1.0/24",
			ip:       net.ParseIP("2001:db8::1"),
			expected: false,
		},
		{
			name:     "broad /8 range",
			cidr:     "10.0.0.0/8",
			ip:       net.ParseIP("10.255.255.255"),
			expected: true,
		},
		{
			name:     "single host /32",
			cidr:     "192.168.1.1/32",
			ip:       net.ParseIP("192.168.1.1"),
			expected: true,
		},
		{
			name:     "single host /32 no match",
			cidr:     "192.168.1.1/32",
			ip:       net.ParseIP("192.168.1.2"),
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := validator.checkIP4(tt.cidr, tt.ip)
			if result != tt.expected {
				t.Errorf("checkIP4(%q, %s) = %v, want %v",
					tt.cidr, tt.ip.String(), result, tt.expected)
			}
		})
	}
}

func TestCheckIP6(t *testing.T) {
	logger := zap.NewNop()
	validator := NewValidator(logger)

	tests := []struct {
		name     string
		cidr     string
		ip       net.IP
		expected bool
	}{
		{
			name:     "exact IPv6 match",
			cidr:     "2001:db8::1",
			ip:       net.ParseIP("2001:db8::1"),
			expected: true,
		},
		{
			name:     "IPv6 in /64 range",
			cidr:     "2001:db8::/64",
			ip:       net.ParseIP("2001:db8::ffff"),
			expected: true,
		},
		{
			name:     "IPv6 not in range",
			cidr:     "2001:db8::/64",
			ip:       net.ParseIP("2001:db9::1"),
			expected: false,
		},
		{
			name:     "IPv4 address against IPv6 CIDR",
			cidr:     "2001:db8::/64",
			ip:       net.ParseIP("192.168.1.1"),
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := validator.checkIP6(tt.cidr, tt.ip)
			if result != tt.expected {
				t.Errorf("checkIP6(%q, %s) = %v, want %v",
					tt.cidr, tt.ip.String(), result, tt.expected)
			}
		})
	}
}

func TestQualifierToResult(t *testing.T) {
	tests := []struct {
		qualifier string
		expected  Result
	}{
		{"+", ResultPass},
		{"-", ResultFail},
		{"~", ResultSoftFail},
		{"?", ResultNeutral},
		{"", ResultPass}, // Default
		{"x", ResultPass}, // Unknown defaults to pass
	}

	for _, tt := range tests {
		t.Run(tt.qualifier, func(t *testing.T) {
			result := qualifierToResult(tt.qualifier)
			if result != tt.expected {
				t.Errorf("qualifierToResult(%q) = %v, want %v",
					tt.qualifier, result, tt.expected)
			}
		})
	}
}

func TestGenerateSPFRecord(t *testing.T) {
	tests := []struct {
		name     string
		includes []string
		ip4s     []string
		ip6s     []string
		mx       bool
		policy   string
		expected string
	}{
		{
			name:     "basic reject policy",
			includes: nil,
			ip4s:     nil,
			ip6s:     nil,
			mx:       false,
			policy:   "reject",
			expected: "v=spf1 -all",
		},
		{
			name:     "with mx",
			includes: nil,
			ip4s:     nil,
			ip6s:     nil,
			mx:       true,
			policy:   "reject",
			expected: "v=spf1 mx -all",
		},
		{
			name:     "with includes",
			includes: []string{"_spf.google.com", "_spf.protection.outlook.com"},
			ip4s:     nil,
			ip6s:     nil,
			mx:       false,
			policy:   "reject",
			expected: "v=spf1 include:_spf.google.com include:_spf.protection.outlook.com -all",
		},
		{
			name:     "with IP4 addresses",
			includes: nil,
			ip4s:     []string{"192.168.1.0/24", "10.0.0.1"},
			ip6s:     nil,
			mx:       false,
			policy:   "reject",
			expected: "v=spf1 ip4:192.168.1.0/24 ip4:10.0.0.1 -all",
		},
		{
			name:     "with IP6 addresses",
			includes: nil,
			ip4s:     nil,
			ip6s:     []string{"2001:db8::/32"},
			mx:       false,
			policy:   "reject",
			expected: "v=spf1 ip6:2001:db8::/32 -all",
		},
		{
			name:     "softfail policy",
			includes: nil,
			ip4s:     nil,
			ip6s:     nil,
			mx:       true,
			policy:   "softfail",
			expected: "v=spf1 mx ~all",
		},
		{
			name:     "neutral policy",
			includes: nil,
			ip4s:     nil,
			ip6s:     nil,
			mx:       true,
			policy:   "neutral",
			expected: "v=spf1 mx ?all",
		},
		{
			name:     "full configuration",
			includes: []string{"_spf.google.com"},
			ip4s:     []string{"192.168.1.0/24"},
			ip6s:     []string{"2001:db8::/32"},
			mx:       true,
			policy:   "reject",
			expected: "v=spf1 include:_spf.google.com mx ip4:192.168.1.0/24 ip6:2001:db8::/32 -all",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := GenerateSPFRecord(tt.includes, tt.ip4s, tt.ip6s, tt.mx, tt.policy)
			if result != tt.expected {
				t.Errorf("GenerateSPFRecord() = %q, want %q", result, tt.expected)
			}
		})
	}
}

func TestIsTemporaryError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "nil error",
			err:      nil,
			expected: false,
		},
		{
			name:     "temporary DNS error",
			err:      &net.DNSError{IsTemporary: true},
			expected: true,
		},
		{
			name:     "permanent DNS error",
			err:      &net.DNSError{IsTemporary: false},
			expected: false,
		},
		{
			name:     "non-DNS error",
			err:      &net.OpError{},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isTemporaryError(tt.err)
			if result != tt.expected {
				t.Errorf("isTemporaryError() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestMatchIP(t *testing.T) {
	tests := []struct {
		name       string
		ip         net.IP
		candidates []net.IP
		cidrLen    int
		expected   bool
	}{
		{
			name:       "exact match",
			ip:         net.ParseIP("192.168.1.1"),
			candidates: []net.IP{net.ParseIP("192.168.1.1")},
			cidrLen:    32,
			expected:   true,
		},
		{
			name:       "match in range",
			ip:         net.ParseIP("192.168.1.100"),
			candidates: []net.IP{net.ParseIP("192.168.1.1")},
			cidrLen:    24,
			expected:   true,
		},
		{
			name:       "no match",
			ip:         net.ParseIP("192.168.2.1"),
			candidates: []net.IP{net.ParseIP("192.168.1.1")},
			cidrLen:    24,
			expected:   false,
		},
		{
			name:       "multiple candidates - one match",
			ip:         net.ParseIP("10.0.0.5"),
			candidates: []net.IP{net.ParseIP("192.168.1.1"), net.ParseIP("10.0.0.1")},
			cidrLen:    24,
			expected:   true,
		},
		{
			name:       "IPv6 exact match",
			ip:         net.ParseIP("2001:db8::1"),
			candidates: []net.IP{net.ParseIP("2001:db8::1")},
			cidrLen:    128,
			expected:   true,
		},
		{
			name:       "IPv6 range match",
			ip:         net.ParseIP("2001:db8::ffff"),
			candidates: []net.IP{net.ParseIP("2001:db8::1")},
			cidrLen:    64,
			expected:   true,
		},
		{
			name:       "mixed IP versions - no match",
			ip:         net.ParseIP("192.168.1.1"),
			candidates: []net.IP{net.ParseIP("2001:db8::1")},
			cidrLen:    24,
			expected:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := matchIP(tt.ip, tt.candidates, tt.cidrLen)
			if result != tt.expected {
				t.Errorf("matchIP() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestResult_String(t *testing.T) {
	tests := []struct {
		result   Result
		expected string
	}{
		{ResultNone, "none"},
		{ResultNeutral, "neutral"},
		{ResultPass, "pass"},
		{ResultFail, "fail"},
		{ResultSoftFail, "softfail"},
		{ResultTempError, "temperror"},
		{ResultPermError, "permerror"},
	}

	for _, tt := range tests {
		t.Run(string(tt.result), func(t *testing.T) {
			if string(tt.result) != tt.expected {
				t.Errorf("Result = %q, want %q", string(tt.result), tt.expected)
			}
		})
	}
}

func TestValidator_EvaluateTerm_AllMechanism(t *testing.T) {
	logger := zap.NewNop()
	validator := NewValidator(logger)

	ctx := context.Background()
	ip := net.ParseIP("192.168.1.1")
	lookupCount := 0

	tests := []struct {
		term     string
		expected Result
	}{
		{"all", ResultPass},      // +all (default qualifier)
		{"+all", ResultPass},     // explicit +all
		{"-all", ResultFail},     // hard fail
		{"~all", ResultSoftFail}, // soft fail
		{"?all", ResultNeutral},  // neutral
	}

	for _, tt := range tests {
		t.Run(tt.term, func(t *testing.T) {
			lookupCount = 0
			result := validator.evaluateTerm(ctx, tt.term, ip, "example.com", &lookupCount)
			if result.result != tt.expected {
				t.Errorf("evaluateTerm(%q) = %v, want %v",
					tt.term, result.result, tt.expected)
			}
		})
	}
}

func TestCheckResult_Fields(t *testing.T) {
	result := &CheckResult{
		Result:      ResultPass,
		Domain:      "example.com",
		Mechanism:   "ip4:192.168.1.0/24",
		Explanation: "Sender is authorized",
		Error:       nil,
	}

	if result.Result != ResultPass {
		t.Errorf("Result = %v, want %v", result.Result, ResultPass)
	}
	if result.Domain != "example.com" {
		t.Errorf("Domain = %q, want %q", result.Domain, "example.com")
	}
	if result.Mechanism != "ip4:192.168.1.0/24" {
		t.Errorf("Mechanism = %q, want %q", result.Mechanism, "ip4:192.168.1.0/24")
	}
	if result.Explanation != "Sender is authorized" {
		t.Errorf("Explanation = %q, want %q", result.Explanation, "Sender is authorized")
	}
	if result.Error != nil {
		t.Errorf("Error = %v, want nil", result.Error)
	}
}
