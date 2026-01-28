package imap

import (
	"encoding/base64"
	"regexp"
	"strings"
	"unicode/utf8"
)

// parseQuotedStrings parses quoted strings from IMAP arguments
func parseQuotedStrings(args string) []string {
	var result []string
	var current strings.Builder
	inQuotes := false
	escaped := false

	for _, r := range args {
		if escaped {
			current.WriteRune(r)
			escaped = false
			continue
		}

		switch r {
		case '\\':
			escaped = true
		case '"':
			if inQuotes {
				// End of quoted string
				result = append(result, current.String())
				current.Reset()
				inQuotes = false
			} else {
				// Start of quoted string
				inQuotes = true
			}
		case ' ':
			if inQuotes {
				current.WriteRune(r)
			} else if current.Len() > 0 {
				// End of unquoted token
				result = append(result, current.String())
				current.Reset()
			}
		default:
			current.WriteRune(r)
		}
	}

	// Add last token if any
	if current.Len() > 0 {
		result = append(result, current.String())
	}

	return result
}

// encodeModifiedUTF7 encodes a string to Modified UTF-7 for IMAP mailbox names
func encodeModifiedUTF7(s string) string {
	var result strings.Builder
	var utf7Buffer strings.Builder
	inUTF7 := false

	for _, r := range s {
		if r >= 0x20 && r <= 0x7E {
			// ASCII printable
			if inUTF7 {
				// Flush UTF-7 buffer
				result.WriteString("&")
				encoded := base64.StdEncoding.EncodeToString([]byte(utf7Buffer.String()))
				encoded = strings.ReplaceAll(encoded, "/", ",")
				encoded = strings.TrimRight(encoded, "=")
				result.WriteString(encoded)
				result.WriteString("-")
				utf7Buffer.Reset()
				inUTF7 = false
			}
			if r == '&' {
				result.WriteString("&-")
			} else {
				result.WriteRune(r)
			}
		} else {
			// Non-ASCII, need UTF-7 encoding
			if !inUTF7 {
				inUTF7 = true
			}
			// Write UTF-16BE representation
			if r < 0x10000 {
				utf7Buffer.WriteByte(byte(r >> 8))
				utf7Buffer.WriteByte(byte(r))
			} else {
				// Surrogate pair
				r -= 0x10000
				high := 0xD800 + ((r >> 10) & 0x3FF)
				low := 0xDC00 + (r & 0x3FF)
				utf7Buffer.WriteByte(byte(high >> 8))
				utf7Buffer.WriteByte(byte(high))
				utf7Buffer.WriteByte(byte(low >> 8))
				utf7Buffer.WriteByte(byte(low))
			}
		}
	}

	if inUTF7 {
		result.WriteString("&")
		encoded := base64.StdEncoding.EncodeToString([]byte(utf7Buffer.String()))
		encoded = strings.ReplaceAll(encoded, "/", ",")
		encoded = strings.TrimRight(encoded, "=")
		result.WriteString(encoded)
		result.WriteString("-")
	}

	return result.String()
}

// decodeModifiedUTF7 decodes Modified UTF-7 mailbox names
func decodeModifiedUTF7(s string) string {
	var result strings.Builder
	i := 0

	for i < len(s) {
		if s[i] == '&' {
			if i+1 < len(s) && s[i+1] == '-' {
				result.WriteByte('&')
				i += 2
				continue
			}

			// Find end of encoded section
			end := strings.Index(s[i+1:], "-")
			if end == -1 {
				result.WriteString(s[i:])
				break
			}

			encoded := s[i+1 : i+1+end]
			// Convert Modified Base64 to regular Base64
			encoded = strings.ReplaceAll(encoded, ",", "/")
			// Add padding
			switch len(encoded) % 4 {
			case 2:
				encoded += "=="
			case 3:
				encoded += "="
			}

			decoded, err := base64.StdEncoding.DecodeString(encoded)
			if err == nil {
				// Decode UTF-16BE
				for j := 0; j+1 < len(decoded); j += 2 {
					r := rune(decoded[j])<<8 | rune(decoded[j+1])
					if r >= 0xD800 && r <= 0xDBFF && j+3 < len(decoded) {
						// Surrogate pair
						low := rune(decoded[j+2])<<8 | rune(decoded[j+3])
						r = 0x10000 + ((r-0xD800)<<10 | (low - 0xDC00))
						j += 2
					}
					result.WriteRune(r)
				}
			}
			i = i + 1 + end + 1
		} else {
			result.WriteByte(s[i])
			i++
		}
	}

	return result.String()
}

// quoteString quotes a string for IMAP response
func quoteString(s string) string {
	// Check if quoting is needed
	needsQuote := false
	for _, r := range s {
		if r == ' ' || r == '"' || r == '\\' || r == '(' || r == ')' || r == '{' || r == '}' || !utf8.ValidRune(r) {
			needsQuote = true
			break
		}
	}

	if !needsQuote && len(s) > 0 {
		return s
	}

	// Quote and escape
	var result strings.Builder
	result.WriteByte('"')
	for _, r := range s {
		if r == '"' || r == '\\' {
			result.WriteByte('\\')
		}
		result.WriteRune(r)
	}
	result.WriteByte('"')
	return result.String()
}

// literalString creates a literal string for large data
func literalString(s string) string {
	return "{" + string(rune(len(s))) + "}\r\n" + s
}

// matchMailboxPattern checks if a mailbox name matches a LIST pattern
func matchMailboxPattern(name, pattern string) bool {
	// Convert IMAP pattern to regex
	// * matches any characters including hierarchy delimiter
	// % matches any characters except hierarchy delimiter

	regexPattern := "^"
	for _, c := range pattern {
		switch c {
		case '*':
			regexPattern += ".*"
		case '%':
			regexPattern += "[^/]*"
		case '.', '+', '?', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\':
			regexPattern += "\\" + string(c)
		default:
			regexPattern += string(c)
		}
	}
	regexPattern += "$"

	matched, _ := regexp.MatchString("(?i)"+regexPattern, name)
	return matched
}

// parseSequenceSet parses an IMAP sequence set (e.g., "1:5,7,10:*")
func parseSequenceSet(seqSet string, maxSeq uint32) []uint32 {
	var result []uint32

	parts := strings.Split(seqSet, ",")
	for _, part := range parts {
		if strings.Contains(part, ":") {
			// Range
			rangeParts := strings.Split(part, ":")
			if len(rangeParts) != 2 {
				continue
			}

			start := parseSeqNum(rangeParts[0], maxSeq)
			end := parseSeqNum(rangeParts[1], maxSeq)

			if start > end {
				start, end = end, start
			}

			for i := start; i <= end; i++ {
				result = append(result, i)
			}
		} else {
			// Single number
			num := parseSeqNum(part, maxSeq)
			if num > 0 {
				result = append(result, num)
			}
		}
	}

	return result
}

// parseSeqNum parses a single sequence number (handles *)
func parseSeqNum(s string, maxSeq uint32) uint32 {
	if s == "*" {
		return maxSeq
	}

	var num uint32
	_, _ = strings.NewReader(s).Read([]byte{byte(num)})
	return num
}

// formatFlags formats a flag list for IMAP response
func formatFlags(flags []string) string {
	return "(" + strings.Join(flags, " ") + ")"
}

// formatList formats a list for IMAP response
func formatList(items []string) string {
	quoted := make([]string, len(items))
	for i, item := range items {
		quoted[i] = quoteString(item)
	}
	return "(" + strings.Join(quoted, " ") + ")"
}

// sanitizeMailboxName sanitizes a mailbox name for security
func sanitizeMailboxName(name string) string {
	// Remove control characters
	var result strings.Builder
	for _, r := range name {
		if r >= 0x20 && r != 0x7F {
			result.WriteRune(r)
		}
	}

	// Prevent path traversal
	clean := result.String()
	clean = strings.ReplaceAll(clean, "..", "")
	clean = strings.TrimPrefix(clean, "/")
	clean = strings.TrimSuffix(clean, "/")

	return clean
}

// isSpecialFolder checks if a folder name is a special folder
func isSpecialFolder(name string) bool {
	upper := strings.ToUpper(name)
	specialFolders := []string{
		"INBOX",
		"DRAFTS",
		"SENT",
		"SPAM",
		"JUNK",
		"TRASH",
		"ARCHIVE",
	}

	for _, special := range specialFolders {
		if upper == special {
			return true
		}
	}
	return false
}

// getSpecialUseAttribute returns the special-use attribute for a folder name
func getSpecialUseAttribute(name string) *SpecialUse {
	upper := strings.ToUpper(name)

	switch upper {
	case "DRAFTS":
		su := SpecialUseDrafts
		return &su
	case "SENT":
		su := SpecialUseSent
		return &su
	case "SPAM", "JUNK":
		su := SpecialUseJunk
		return &su
	case "TRASH":
		su := SpecialUseTrash
		return &su
	case "ARCHIVE":
		su := SpecialUseArchive
		return &su
	case "IMPORTANT":
		su := SpecialUseImportant
		return &su
	default:
		return nil
	}
}

// parseAtom parses an IMAP atom (unquoted string)
func parseAtom(s string) string {
	// Atoms cannot contain specials
	for _, c := range s {
		if c == '(' || c == ')' || c == '{' || c == ' ' || c == '"' || c == '\\' || c == ']' || c < 0x20 || c == 0x7F {
			return ""
		}
	}
	return s
}

// isValidFolderName checks if a folder name is valid
func isValidFolderName(name string) bool {
	if name == "" {
		return false
	}

	// Check for invalid characters
	for _, c := range name {
		// Control characters
		if c < 0x20 || c == 0x7F {
			return false
		}
		// IMAP special characters that shouldn't be in folder names
		if c == '*' || c == '%' || c == '\\' {
			return false
		}
	}

	// Check for reserved names
	reserved := []string{".", "..", "NIL", "nil"}
	for _, r := range reserved {
		if name == r {
			return false
		}
	}

	return true
}
