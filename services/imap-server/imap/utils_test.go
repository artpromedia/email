package imap

import (
	"testing"
)

func TestParseQuotedStrings(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "empty string",
			input:    "",
			expected: nil,
		},
		{
			name:     "single unquoted",
			input:    "hello",
			expected: []string{"hello"},
		},
		{
			name:     "single quoted",
			input:    `"hello world"`,
			expected: []string{"hello world"},
		},
		{
			name:     "multiple unquoted",
			input:    "hello world",
			expected: []string{"hello", "world"},
		},
		{
			name:     "mixed quoted and unquoted",
			input:    `user@example.com "my password"`,
			expected: []string{"user@example.com", "my password"},
		},
		{
			name:     "escaped quote",
			input:    `"hello \"world\""`,
			expected: []string{`hello "world"`},
		},
		{
			name:     "quoted with spaces",
			input:    `"hello   world"`,
			expected: []string{"hello   world"},
		},
		{
			name:     "multiple quoted strings",
			input:    `"first" "second" "third"`,
			expected: []string{"first", "second", "third"},
		},
		{
			name:     "empty quoted string",
			input:    `""`,
			expected: []string{""},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseQuotedStrings(tt.input)
			if len(result) != len(tt.expected) {
				t.Fatalf("parseQuotedStrings(%q) returned %d items, want %d",
					tt.input, len(result), len(tt.expected))
			}
			for i, v := range result {
				if v != tt.expected[i] {
					t.Errorf("parseQuotedStrings(%q)[%d] = %q, want %q",
						tt.input, i, v, tt.expected[i])
				}
			}
		})
	}
}

func TestQuoteString(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "simple string - no quoting needed",
			input:    "INBOX",
			expected: "INBOX",
		},
		{
			name:     "string with space",
			input:    "My Folder",
			expected: `"My Folder"`,
		},
		{
			name:     "string with quote",
			input:    `say "hello"`,
			expected: `"say \"hello\""`,
		},
		{
			name:     "string with backslash",
			input:    `path\to\folder`,
			expected: `"path\\to\\folder"`,
		},
		{
			name:     "string with parentheses",
			input:    "folder(1)",
			expected: `"folder(1)"`,
		},
		{
			name:     "empty string",
			input:    "",
			expected: `""`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := quoteString(tt.input)
			if result != tt.expected {
				t.Errorf("quoteString(%q) = %q, want %q",
					tt.input, result, tt.expected)
			}
		})
	}
}

func TestMatchMailboxPattern(t *testing.T) {
	tests := []struct {
		name     string
		mailbox  string
		pattern  string
		expected bool
	}{
		{
			name:     "exact match",
			mailbox:  "INBOX",
			pattern:  "INBOX",
			expected: true,
		},
		{
			name:     "wildcard all",
			mailbox:  "INBOX/Subfolder",
			pattern:  "*",
			expected: true,
		},
		{
			name:     "wildcard prefix",
			mailbox:  "INBOX/Subfolder",
			pattern:  "INBOX/*",
			expected: true,
		},
		{
			name:     "percent - single level",
			mailbox:  "INBOX",
			pattern:  "%",
			expected: true,
		},
		{
			name:     "percent - excludes hierarchy",
			mailbox:  "INBOX/Subfolder",
			pattern:  "%",
			expected: false,
		},
		{
			name:     "case insensitive",
			mailbox:  "inbox",
			pattern:  "INBOX",
			expected: true,
		},
		{
			name:     "no match",
			mailbox:  "Sent",
			pattern:  "INBOX",
			expected: false,
		},
		{
			name:     "complex pattern",
			mailbox:  "Archive/2024/January",
			pattern:  "Archive/*/January",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := matchMailboxPattern(tt.mailbox, tt.pattern)
			if result != tt.expected {
				t.Errorf("matchMailboxPattern(%q, %q) = %v, want %v",
					tt.mailbox, tt.pattern, result, tt.expected)
			}
		})
	}
}

func TestParseSequenceSet(t *testing.T) {
	tests := []struct {
		name     string
		seqSet   string
		maxSeq   uint32
		expected []uint32
	}{
		{
			name:     "single number",
			seqSet:   "5",
			maxSeq:   100,
			expected: []uint32{5},
		},
		{
			name:     "range",
			seqSet:   "1:3",
			maxSeq:   100,
			expected: []uint32{1, 2, 3},
		},
		{
			name:     "wildcard end",
			seqSet:   "1:*",
			maxSeq:   5,
			expected: []uint32{1, 2, 3, 4, 5},
		},
		{
			name:     "comma separated",
			seqSet:   "1,3,5",
			maxSeq:   100,
			expected: []uint32{1, 3, 5},
		},
		{
			name:     "reversed range",
			seqSet:   "5:3",
			maxSeq:   100,
			expected: []uint32{3, 4, 5},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseSequenceSet(tt.seqSet, tt.maxSeq)
			if len(result) != len(tt.expected) {
				t.Fatalf("parseSequenceSet(%q, %d) returned %d items, want %d",
					tt.seqSet, tt.maxSeq, len(result), len(tt.expected))
			}
			for i, v := range result {
				if v != tt.expected[i] {
					t.Errorf("parseSequenceSet(%q, %d)[%d] = %d, want %d",
						tt.seqSet, tt.maxSeq, i, v, tt.expected[i])
				}
			}
		})
	}
}

func TestSanitizeMailboxName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "normal name",
			input:    "MyFolder",
			expected: "MyFolder",
		},
		{
			name:     "path traversal attempt",
			input:    "../../../etc/passwd",
			expected: "/etc/passwd",
		},
		{
			name:     "leading slash",
			input:    "/INBOX",
			expected: "INBOX",
		},
		{
			name:     "trailing slash",
			input:    "INBOX/",
			expected: "INBOX",
		},
		{
			name:     "control characters",
			input:    "Folder\x00Name\x1F",
			expected: "FolderName",
		},
		{
			name:     "double dots",
			input:    "Folder..Name",
			expected: "FolderName",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sanitizeMailboxName(tt.input)
			if result != tt.expected {
				t.Errorf("sanitizeMailboxName(%q) = %q, want %q",
					tt.input, result, tt.expected)
			}
		})
	}
}

func TestIsSpecialFolder(t *testing.T) {
	tests := []struct {
		name     string
		folder   string
		expected bool
	}{
		{"INBOX", "INBOX", true},
		{"inbox lowercase", "inbox", true},
		{"Drafts", "Drafts", true},
		{"Sent", "Sent", true},
		{"Spam", "Spam", true},
		{"Junk", "Junk", true},
		{"Trash", "Trash", true},
		{"Archive", "Archive", true},
		{"custom folder", "MyFolder", false},
		{"INBOX prefix", "INBOX/Subfolder", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isSpecialFolder(tt.folder)
			if result != tt.expected {
				t.Errorf("isSpecialFolder(%q) = %v, want %v",
					tt.folder, result, tt.expected)
			}
		})
	}
}

func TestGetSpecialUseAttribute(t *testing.T) {
	tests := []struct {
		name       string
		folder     string
		expectNil  bool
		expected   SpecialUse
	}{
		{"Drafts", "Drafts", false, SpecialUseDrafts},
		{"DRAFTS uppercase", "DRAFTS", false, SpecialUseDrafts},
		{"Sent", "Sent", false, SpecialUseSent},
		{"Spam", "Spam", false, SpecialUseJunk},
		{"Junk", "Junk", false, SpecialUseJunk},
		{"Trash", "Trash", false, SpecialUseTrash},
		{"Archive", "Archive", false, SpecialUseArchive},
		{"Important", "Important", false, SpecialUseImportant},
		{"Custom folder", "MyFolder", true, ""},
		{"INBOX", "INBOX", true, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getSpecialUseAttribute(tt.folder)
			if tt.expectNil {
				if result != nil {
					t.Errorf("getSpecialUseAttribute(%q) = %v, want nil",
						tt.folder, *result)
				}
			} else {
				if result == nil {
					t.Fatalf("getSpecialUseAttribute(%q) = nil, want %v",
						tt.folder, tt.expected)
				}
				if *result != tt.expected {
					t.Errorf("getSpecialUseAttribute(%q) = %v, want %v",
						tt.folder, *result, tt.expected)
				}
			}
		})
	}
}

func TestIsValidFolderName(t *testing.T) {
	tests := []struct {
		name     string
		folder   string
		expected bool
	}{
		{"normal name", "MyFolder", true},
		{"with spaces", "My Folder", true},
		{"with numbers", "Archive2024", true},
		{"empty string", "", false},
		{"control character", "Folder\x00", false},
		{"wildcard star", "Folder*", false},
		{"wildcard percent", "Folder%", false},
		{"backslash", "Folder\\Name", false},
		{"reserved dot", ".", false},
		{"reserved dotdot", "..", false},
		{"reserved NIL", "NIL", false},
		{"reserved nil lowercase", "nil", false},
		{"with slash (path separator)", "Folder/Subfolder", true},
		{"unicode characters", "文件夹", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isValidFolderName(tt.folder)
			if result != tt.expected {
				t.Errorf("isValidFolderName(%q) = %v, want %v",
					tt.folder, result, tt.expected)
			}
		})
	}
}

func TestFormatFlags(t *testing.T) {
	tests := []struct {
		name     string
		flags    []string
		expected string
	}{
		{
			name:     "empty flags",
			flags:    []string{},
			expected: "()",
		},
		{
			name:     "single flag",
			flags:    []string{"\\Seen"},
			expected: "(\\Seen)",
		},
		{
			name:     "multiple flags",
			flags:    []string{"\\Seen", "\\Answered", "\\Flagged"},
			expected: "(\\Seen \\Answered \\Flagged)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := formatFlags(tt.flags)
			if result != tt.expected {
				t.Errorf("formatFlags(%v) = %q, want %q",
					tt.flags, result, tt.expected)
			}
		})
	}
}

func TestFormatList(t *testing.T) {
	tests := []struct {
		name     string
		items    []string
		expected string
	}{
		{
			name:     "empty list",
			items:    []string{},
			expected: "()",
		},
		{
			name:     "single item",
			items:    []string{"item"},
			expected: "(item)",
		},
		{
			name:     "item needing quotes",
			items:    []string{"my item"},
			expected: `("my item")`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := formatList(tt.items)
			if result != tt.expected {
				t.Errorf("formatList(%v) = %q, want %q",
					tt.items, result, tt.expected)
			}
		})
	}
}

func TestParseAtom(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "valid atom",
			input:    "INBOX",
			expected: "INBOX",
		},
		{
			name:     "lowercase atom",
			input:    "inbox",
			expected: "inbox",
		},
		{
			name:     "with special - space",
			input:    "IN BOX",
			expected: "",
		},
		{
			name:     "with special - quote",
			input:    `IN"BOX`,
			expected: "",
		},
		{
			name:     "with special - parenthesis",
			input:    "INBOX(1)",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := parseAtom(tt.input)
			if result != tt.expected {
				t.Errorf("parseAtom(%q) = %q, want %q",
					tt.input, result, tt.expected)
			}
		})
	}
}

func TestEncodeDecodeModifiedUTF7(t *testing.T) {
	tests := []struct {
		name    string
		decoded string
	}{
		{"ASCII only", "INBOX"},
		{"ampersand", "&"},
		{"with spaces", "My Folder"},
		{"unicode - German", "Müller"},
		{"unicode - Japanese", "受信箱"},
		{"unicode - Chinese", "文件夹"},
		{"mixed ASCII and unicode", "Folder-文件夹"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			encoded := encodeModifiedUTF7(tt.decoded)
			decoded := decodeModifiedUTF7(encoded)
			if decoded != tt.decoded {
				t.Errorf("roundtrip failed: %q -> %q -> %q",
					tt.decoded, encoded, decoded)
			}
		})
	}
}

func TestEncodeModifiedUTF7_SpecificCases(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "ampersand encoding",
			input:    "&",
			expected: "&-",
		},
		{
			name:     "ASCII passthrough",
			input:    "INBOX",
			expected: "INBOX",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := encodeModifiedUTF7(tt.input)
			if result != tt.expected {
				t.Errorf("encodeModifiedUTF7(%q) = %q, want %q",
					tt.input, result, tt.expected)
			}
		})
	}
}
