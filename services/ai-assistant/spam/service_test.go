package spam

import (
	"context"
	"testing"
	"time"
)

// mockRedis provides a minimal mock for Redis
type mockRedis struct {
	data map[string]interface{}
}

func newMockRedis() *mockRedis {
	return &mockRedis{data: make(map[string]interface{})}
}

// mockLLMProvider provides a mock LLM for testing
type mockLLMProvider struct {
	response string
	err      error
}

func (m *mockLLMProvider) Analyze(ctx context.Context, prompt string) (string, error) {
	if m.err != nil {
		return "", m.err
	}
	return m.response, nil
}

// mockMLClassifier provides a mock ML classifier for testing
type mockMLClassifier struct {
	score      float64
	confidence float64
	err        error
}

func (m *mockMLClassifier) Classify(ctx context.Context, text string) (float64, float64, error) {
	if m.err != nil {
		return 0, 0, m.err
	}
	return m.score, m.confidence, nil
}

func TestSpamService_CheckSpam_AllowBlockLists(t *testing.T) {
	tests := []struct {
		name            string
		senderEmail     string
		allowList       []string
		blockList       []string
		expectedVerdict SpamVerdict
	}{
		{
			name:            "sender on allow list returns ham",
			senderEmail:     "trusted@partner.com",
			allowList:       []string{"trusted@partner.com"},
			blockList:       []string{},
			expectedVerdict: VerdictHam,
		},
		{
			name:            "sender domain on allow list returns ham",
			senderEmail:     "anyone@trusted-domain.com",
			allowList:       []string{"trusted-domain.com"},
			blockList:       []string{},
			expectedVerdict: VerdictHam,
		},
		{
			name:            "sender on block list returns spam",
			senderEmail:     "spammer@evil.com",
			allowList:       []string{},
			blockList:       []string{"spammer@evil.com"},
			expectedVerdict: VerdictSpam,
		},
		{
			name:            "sender domain on block list returns spam",
			senderEmail:     "anyone@blocked-domain.com",
			allowList:       []string{},
			blockList:       []string{"blocked-domain.com"},
			expectedVerdict: VerdictSpam,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create service with no ML/LLM for simplicity
			service := createTestService(nil, nil)

			// Set up org settings with allow/block lists
			settings := &OrgSpamSettings{
				OrgID:     "test-org",
				Threshold: ThresholdMedium,
				AllowList: tt.allowList,
				BlockList: tt.blockList,
			}

			req := &SpamCheckRequest{
				EmailID: "test-email",
				OrgID:   "test-org",
				From: EmailAddress{
					Address: tt.senderEmail,
				},
				Subject: "Test Subject",
				Body:    "Test body content",
			}

			// Override getOrgSettings to return our test settings
			result, err := service.checkSpamWithSettings(context.Background(), req, settings)

			if err != nil {
				t.Fatalf("Unexpected error: %v", err)
			}

			if result.Verdict != tt.expectedVerdict {
				t.Errorf("Expected verdict %s, got %s", tt.expectedVerdict, result.Verdict)
			}
		})
	}
}

func TestSpamService_QuickLayer(t *testing.T) {
	tests := []struct {
		name           string
		request        *SpamCheckRequest
		expectScore    float64 // approximate expected score
		expectPassed   bool
	}{
		{
			name: "clean email with good authentication",
			request: &SpamCheckRequest{
				SenderIP: "8.8.8.8",
				Headers: map[string]string{
					"Received-SPF":           "pass",
					"Authentication-Results": "dkim=pass; dmarc=pass",
					"DKIM-Signature":         "v=1; a=rsa-sha256;...",
				},
				From: EmailAddress{Address: "sender@legitimate.com"},
			},
			expectScore:  0.0,
			expectPassed: true,
		},
		{
			name: "SPF fail increases score",
			request: &SpamCheckRequest{
				SenderIP: "1.2.3.4",
				Headers: map[string]string{
					"Received-SPF":   "fail",
					"DKIM-Signature": "v=1; a=rsa-sha256;...",
				},
				From: EmailAddress{Address: "sender@example.com"},
			},
			expectScore:  0.3,
			expectPassed: true,
		},
		{
			name: "SPF softfail increases score moderately",
			request: &SpamCheckRequest{
				SenderIP: "1.2.3.4",
				Headers: map[string]string{
					"Received-SPF":   "softfail",
					"DKIM-Signature": "v=1; a=rsa-sha256;...",
				},
				From: EmailAddress{Address: "sender@example.com"},
			},
			expectScore:  0.15,
			expectPassed: true,
		},
		{
			name: "DKIM missing increases score",
			request: &SpamCheckRequest{
				SenderIP: "1.2.3.4",
				Headers: map[string]string{
					"Received-SPF": "pass",
				},
				From: EmailAddress{Address: "sender@example.com"},
			},
			expectScore:  0.1,
			expectPassed: true,
		},
		{
			name: "DKIM fail increases score",
			request: &SpamCheckRequest{
				SenderIP: "1.2.3.4",
				Headers: map[string]string{
					"Received-SPF":           "pass",
					"DKIM-Signature":         "v=1; a=rsa-sha256;...",
					"Authentication-Results": "dkim=fail",
				},
				From: EmailAddress{Address: "sender@example.com"},
			},
			expectScore:  0.3,
			expectPassed: true,
		},
		{
			name: "DMARC fail increases score",
			request: &SpamCheckRequest{
				SenderIP: "1.2.3.4",
				Headers: map[string]string{
					"Received-SPF":           "pass",
					"DKIM-Signature":         "v=1; a=rsa-sha256;...",
					"Authentication-Results": "dkim=pass; dmarc=fail",
				},
				From: EmailAddress{Address: "sender@example.com"},
			},
			expectScore:  0.25,
			expectPassed: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := createTestService(nil, nil)
			result := service.runQuickLayer(context.Background(), tt.request)

			if result.Passed != tt.expectPassed {
				t.Errorf("Expected passed=%v, got %v", tt.expectPassed, result.Passed)
			}

			// Allow some tolerance in score comparison
			tolerance := 0.1
			if result.Score < tt.expectScore-tolerance || result.Score > tt.expectScore+tolerance {
				t.Errorf("Expected score ~%v, got %v", tt.expectScore, result.Score)
			}
		})
	}
}

func TestSpamService_RulesLayer(t *testing.T) {
	tests := []struct {
		name           string
		request        *SpamCheckRequest
		minScore       float64
		expectPassed   bool
		expectFactors  []string
	}{
		{
			name: "clean business email",
			request: &SpamCheckRequest{
				Subject: "Quarterly Report Q4 2024",
				Body:    "Please find attached the quarterly financial report for your review.",
			},
			minScore:     0.0,
			expectPassed: true,
		},
		{
			name: "spam keywords trigger score",
			request: &SpamCheckRequest{
				Subject: "FREE MONEY - ACT NOW!!!",
				Body:    "Congratulations winner! You have been selected for our lottery!",
			},
			minScore:      0.1,
			expectPassed:  true,
			expectFactors: []string{"spam keywords"},
		},
		{
			name: "urgency patterns trigger score",
			request: &SpamCheckRequest{
				Subject: "URGENT: Your account will be suspended!",
				Body:    "Act now! Limited time offer expires today!",
			},
			minScore:      0.1,
			expectPassed:  true,
			expectFactors: []string{"urgency patterns"},
		},
		{
			name: "excessive capitalization",
			request: &SpamCheckRequest{
				Subject: "IMPORTANT ANNOUNCEMENT FOR ALL USERS",
				Body:    "THIS IS A VERY IMPORTANT MESSAGE THAT YOU MUST READ IMMEDIATELY",
			},
			minScore:      0.1,
			expectPassed:  true,
			expectFactors: []string{"capitalization"},
		},
		{
			name: "suspicious URLs detected",
			request: &SpamCheckRequest{
				Subject: "Check this out",
				Body:    "Click here: http://192.168.1.1/malware and https://evil.xyz/phishing",
			},
			minScore:      0.15,
			expectPassed:  true,
			expectFactors: []string{"suspicious URLs"},
		},
		{
			name: "suspicious attachment",
			request: &SpamCheckRequest{
				Subject: "Invoice attached",
				Body:    "Please see attached",
				Attachments: []Attachment{
					{Filename: "invoice.exe", ContentType: "application/octet-stream"},
				},
			},
			minScore:      0.2,
			expectPassed:  true,
			expectFactors: []string{"attachment"},
		},
		{
			name: "display name mismatch (brand spoofing)",
			request: &SpamCheckRequest{
				Subject: "Your PayPal account",
				Body:    "Please verify your account",
				From: EmailAddress{
					Name:    "PayPal Support",
					Address: "support@random-domain.com",
				},
			},
			minScore:      0.2,
			expectPassed:  true,
			expectFactors: []string{"display name"},
		},
		{
			name: "minimal body with attachments",
			request: &SpamCheckRequest{
				Subject: "See attached",
				Body:    "Hi",
				Attachments: []Attachment{
					{Filename: "document.pdf", ContentType: "application/pdf"},
				},
			},
			minScore:     0.15,
			expectPassed: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := createTestService(nil, nil)
			result := service.runRulesLayer(context.Background(), tt.request)

			if result.Passed != tt.expectPassed {
				t.Errorf("Expected passed=%v, got %v", tt.expectPassed, result.Passed)
			}

			if result.Score < tt.minScore {
				t.Errorf("Expected score >= %v, got %v", tt.minScore, result.Score)
			}

			// Check for expected factors
			for _, expectedFactor := range tt.expectFactors {
				found := false
				for _, factor := range result.Factors {
					if containsSubstring(factor, expectedFactor) {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("Expected factor containing '%s' not found in %v", expectedFactor, result.Factors)
				}
			}
		})
	}
}

func TestSpamService_MLLayer(t *testing.T) {
	tests := []struct {
		name           string
		mlClassifier   *mockMLClassifier
		expectSkipped  bool
		expectScore    float64
	}{
		{
			name:          "ML not configured - skipped",
			mlClassifier:  nil,
			expectSkipped: true,
		},
		{
			name: "ML classifies as spam",
			mlClassifier: &mockMLClassifier{
				score:      0.8,
				confidence: 0.9,
			},
			expectSkipped: false,
			expectScore:   0.8,
		},
		{
			name: "ML classifies as ham",
			mlClassifier: &mockMLClassifier{
				score:      0.2,
				confidence: 0.85,
			},
			expectSkipped: false,
			expectScore:   0.2,
		},
		{
			name: "ML error - skipped",
			mlClassifier: &mockMLClassifier{
				err: context.DeadlineExceeded,
			},
			expectSkipped: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := createTestService(nil, tt.mlClassifier)
			req := &SpamCheckRequest{
				Subject: "Test email",
				Body:    "This is a test email body",
			}

			result := service.runMLLayer(context.Background(), req)

			if result.Skipped != tt.expectSkipped {
				t.Errorf("Expected skipped=%v, got %v", tt.expectSkipped, result.Skipped)
			}

			if !tt.expectSkipped && result.Score != tt.expectScore {
				t.Errorf("Expected score %v, got %v", tt.expectScore, result.Score)
			}
		})
	}
}

func TestSpamService_LLMLayer(t *testing.T) {
	tests := []struct {
		name          string
		llmProvider   *mockLLMProvider
		expectSkipped bool
		expectScore   float64
	}{
		{
			name:          "LLM not configured - skipped",
			llmProvider:   nil,
			expectSkipped: true,
		},
		{
			name: "LLM identifies spam",
			llmProvider: &mockLLMProvider{
				response: `{"score": 0.85, "reasoning": "Phishing attempt", "factors": ["requests credentials", "urgency"]}`,
			},
			expectSkipped: false,
			expectScore:   0.85,
		},
		{
			name: "LLM identifies ham",
			llmProvider: &mockLLMProvider{
				response: `{"score": 0.1, "reasoning": "Legitimate business email", "factors": []}`,
			},
			expectSkipped: false,
			expectScore:   0.1,
		},
		{
			name: "LLM error - skipped",
			llmProvider: &mockLLMProvider{
				err: context.DeadlineExceeded,
			},
			expectSkipped: true,
		},
		{
			name: "LLM invalid JSON - defaults to 0.5",
			llmProvider: &mockLLMProvider{
				response: "This is not JSON",
			},
			expectSkipped: false,
			expectScore:   0.5,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := createTestService(tt.llmProvider, nil)
			req := &SpamCheckRequest{
				EmailID: "test",
				From: EmailAddress{
					Name:    "Test Sender",
					Address: "sender@example.com",
				},
				Subject: "Test email",
				Body:    "This is a test email body",
			}

			result := service.runLLMLayer(context.Background(), req)

			if result.Skipped != tt.expectSkipped {
				t.Errorf("Expected skipped=%v, got %v (reason: %s)", tt.expectSkipped, result.Skipped, result.SkipReason)
			}

			if !tt.expectSkipped && result.Score != tt.expectScore {
				t.Errorf("Expected score %v, got %v", tt.expectScore, result.Score)
			}
		})
	}
}

func TestSpamService_VerdictDetermination(t *testing.T) {
	tests := []struct {
		name            string
		score           float64
		threshold       SpamThreshold
		expectedVerdict SpamVerdict
		expectedAction  string
	}{
		{
			name:            "low score with medium threshold = ham",
			score:           0.2,
			threshold:       ThresholdMedium,
			expectedVerdict: VerdictHam,
			expectedAction:  "deliver",
		},
		{
			name:            "moderate score with medium threshold = suspicious",
			score:           0.5,
			threshold:       ThresholdMedium,
			expectedVerdict: VerdictSuspicious,
			expectedAction:  "spam_folder",
		},
		{
			name:            "high score with medium threshold = spam",
			score:           0.85,
			threshold:       ThresholdMedium,
			expectedVerdict: VerdictSpam,
			expectedAction:  "spam_folder",
		},
		{
			name:            "low threshold allows more through",
			score:           0.5,
			threshold:       ThresholdLow,
			expectedVerdict: VerdictHam,
			expectedAction:  "deliver",
		},
		{
			name:            "high threshold catches more",
			score:           0.35,
			threshold:       ThresholdHigh,
			expectedVerdict: VerdictSuspicious,
			expectedAction:  "spam_folder",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := createTestService(nil, nil)
			settings := &OrgSpamSettings{
				Threshold:        tt.threshold,
				QuarantineAction: "spam_folder",
			}

			verdict, action := service.determineVerdict(tt.score, settings)

			if verdict != tt.expectedVerdict {
				t.Errorf("Expected verdict %s, got %s", tt.expectedVerdict, verdict)
			}

			if action != tt.expectedAction {
				t.Errorf("Expected action %s, got %s", tt.expectedAction, action)
			}
		})
	}
}

func TestSpamService_HelperFunctions(t *testing.T) {
	t.Run("extractDomain", func(t *testing.T) {
		tests := []struct {
			email    string
			expected string
		}{
			{"user@example.com", "example.com"},
			{"USER@EXAMPLE.COM", "example.com"},
			{"invalid-email", ""},
			{"", ""},
		}

		for _, tt := range tests {
			result := extractDomain(tt.email)
			if result != tt.expected {
				t.Errorf("extractDomain(%s) = %s, expected %s", tt.email, result, tt.expected)
			}
		}
	})

	t.Run("extractURLs", func(t *testing.T) {
		text := "Check http://example.com and https://test.org/path"
		urls := extractURLs(text)

		if len(urls) != 2 {
			t.Errorf("Expected 2 URLs, got %d", len(urls))
		}
	})

	t.Run("isIPBasedURL", func(t *testing.T) {
		tests := []struct {
			url      string
			expected bool
		}{
			{"http://192.168.1.1/path", true},
			{"http://10.0.0.1", true},
			{"http://example.com", false},
			{"https://google.com/192.168.1.1", false},
		}

		for _, tt := range tests {
			result := isIPBasedURL(tt.url)
			if result != tt.expected {
				t.Errorf("isIPBasedURL(%s) = %v, expected %v", tt.url, result, tt.expected)
			}
		}
	})

	t.Run("calculateCapsRatio", func(t *testing.T) {
		tests := []struct {
			text     string
			minRatio float64
			maxRatio float64
		}{
			{"hello world", 0.0, 0.01},
			{"HELLO WORLD", 0.99, 1.0},
			{"Hello World", 0.15, 0.25},
			{"", 0.0, 0.0},
			{"12345!@#$%", 0.0, 0.0},
		}

		for _, tt := range tests {
			result := calculateCapsRatio(tt.text)
			if result < tt.minRatio || result > tt.maxRatio {
				t.Errorf("calculateCapsRatio(%s) = %v, expected between %v and %v", tt.text, result, tt.minRatio, tt.maxRatio)
			}
		}
	})

	t.Run("isSuspiciousAttachment", func(t *testing.T) {
		tests := []struct {
			filename string
			expected bool
		}{
			{"document.pdf", false},
			{"image.jpg", false},
			{"malware.exe", true},
			{"script.bat", true},
			{"trojan.scr", true},
			{"fake.pdf.exe", true},
			{"macro.vbs", true},
			{"archive.zip", true},
		}

		for _, tt := range tests {
			att := Attachment{Filename: tt.filename}
			result := isSuspiciousAttachment(att)
			if result != tt.expected {
				t.Errorf("isSuspiciousAttachment(%s) = %v, expected %v", tt.filename, result, tt.expected)
			}
		}
	})

	t.Run("reverseIP", func(t *testing.T) {
		tests := []struct {
			ip       string
			expected string
		}{
			{"192.168.1.1", "1.1.168.192"},
			{"8.8.8.8", "8.8.8.8"},
			{"10.0.0.1", "1.0.0.10"},
			{"invalid", "invalid"},
		}

		for _, tt := range tests {
			result := reverseIP(tt.ip)
			if result != tt.expected {
				t.Errorf("reverseIP(%s) = %s, expected %s", tt.ip, result, tt.expected)
			}
		}
	})
}

func TestSpamService_ConfidenceCalculation(t *testing.T) {
	tests := []struct {
		name           string
		layerResults   []LayerResult
		minConfidence  float64
	}{
		{
			name: "all layers agree on low score = high confidence",
			layerResults: []LayerResult{
				{Layer: "quick", Score: 0.1, Skipped: false},
				{Layer: "rules", Score: 0.15, Skipped: false},
				{Layer: "ml", Score: 0.12, Skipped: false},
			},
			minConfidence: 0.8,
		},
		{
			name: "all layers agree on high score = high confidence",
			layerResults: []LayerResult{
				{Layer: "quick", Score: 0.9, Skipped: false},
				{Layer: "rules", Score: 0.85, Skipped: false},
				{Layer: "ml", Score: 0.88, Skipped: false},
			},
			minConfidence: 0.8,
		},
		{
			name: "layers disagree = lower confidence",
			layerResults: []LayerResult{
				{Layer: "quick", Score: 0.2, Skipped: false},
				{Layer: "rules", Score: 0.8, Skipped: false},
				{Layer: "ml", Score: 0.5, Skipped: false},
			},
			minConfidence: 0.5,
		},
		{
			name: "some layers skipped",
			layerResults: []LayerResult{
				{Layer: "quick", Score: 0.1, Skipped: false},
				{Layer: "rules", Score: 0.15, Skipped: false},
				{Layer: "ml", Skipped: true},
				{Layer: "llm", Skipped: true},
			},
			minConfidence: 0.5,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := createTestService(nil, nil)
			confidence := service.calculateConfidence(tt.layerResults)

			if confidence < tt.minConfidence {
				t.Errorf("Expected confidence >= %v, got %v", tt.minConfidence, confidence)
			}
		})
	}
}

// Helper functions

func createTestService(llm LLMProvider, ml MLClassifier) *Service {
	return &Service{
		llmProvider:     llm,
		mlClassifier:    ml,
		ipBlacklist:     make(map[string]bool),
		domainBlacklist: make(map[string]bool),
		urlBlacklist:    make(map[string]bool),
		spamKeywords:    defaultSpamKeywords(),
		urgencyPatterns: compileUrgencyPatterns(),
	}
}

func (s *Service) checkSpamWithSettings(ctx context.Context, req *SpamCheckRequest, settings *OrgSpamSettings) (*SpamCheckResponse, error) {
	start := time.Now()

	// Check allow/block lists
	if s.isAllowed(req.From.Address, settings.AllowList) {
		return &SpamCheckResponse{
			EmailID:         req.EmailID,
			Verdict:         VerdictHam,
			Score:           0.0,
			Confidence:      1.0,
			SuggestedAction: "deliver",
			ProcessingTime:  time.Since(start),
			Timestamp:       time.Now(),
		}, nil
	}

	if s.isBlocked(req.From.Address, settings.BlockList) {
		return &SpamCheckResponse{
			EmailID:         req.EmailID,
			Verdict:         VerdictSpam,
			Score:           1.0,
			Confidence:      1.0,
			SuggestedAction: settings.QuarantineAction,
			ProcessingTime:  time.Since(start),
			Timestamp:       time.Now(),
		}, nil
	}

	// Run layers
	var layerResults []LayerResult
	var totalScore float64

	layer1 := s.runQuickLayer(ctx, req)
	layerResults = append(layerResults, layer1)
	totalScore += layer1.Score * 0.25

	layer2 := s.runRulesLayer(ctx, req)
	layerResults = append(layerResults, layer2)
	totalScore += layer2.Score * 0.25

	layer3 := s.runMLLayer(ctx, req)
	layerResults = append(layerResults, layer3)
	totalScore += layer3.Score * 0.35

	verdict, action := s.determineVerdict(totalScore, settings)

	return &SpamCheckResponse{
		EmailID:         req.EmailID,
		Verdict:         verdict,
		Score:           totalScore,
		Confidence:      s.calculateConfidence(layerResults),
		LayerResults:    layerResults,
		SuggestedAction: action,
		ProcessingTime:  time.Since(start),
		Timestamp:       time.Now(),
	}, nil
}

func containsSubstring(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && len(substr) > 0 && findSubstring(s, substr)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
