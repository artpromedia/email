package repository

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"strings"

	"go.uber.org/zap"

	"github.com/oonrumail/smtp-server/domain"
)

// EmailAddress represents a parsed email address for JSONB storage
type EmailAddress struct {
	Address string `json:"address"`
	Name    string `json:"name,omitempty"`
}

// ParsedMessage holds the MIME-parsed contents of an email
type ParsedMessage struct {
	MessageID  string
	InReplyTo  string
	References string
	Subject    string
	Sender     EmailAddress
	To         []EmailAddress
	Cc         []EmailAddress
	Bcc        []EmailAddress
	ReplyTo    string
	Date       string
	TextBody   string
	HTMLBody   string
	Snippet    string
	Headers    map[string]string
	Size       int64
}

// DeliverToMailFolder parses a raw email message and inserts it into the
// mail_messages table (used by the web app), filing it into the recipient's
// Inbox folder. This bridges the SMTP inbound pipeline with the web UI.
func (r *MessageRepository) DeliverToMailFolder(
	ctx context.Context,
	mailboxID string,
	msg *domain.Message,
	rawData []byte,
	storagePath string,
) error {
	// Parse the raw email
	parsed, err := parseRawEmail(rawData, msg)
	if err != nil {
		r.logger.Warn("Failed to parse email for mail_messages delivery",
			zap.String("mailbox_id", mailboxID),
			zap.String("message_id", msg.ID),
			zap.Error(err))
		// Use basic data from the queue message instead
		parsed = &ParsedMessage{
			MessageID: msg.Headers["Message-ID"],
			Subject:   msg.Subject,
			Sender:    EmailAddress{Address: msg.FromAddress, Name: msg.From},
			To:        addressListFromStrings(msg.Recipients),
			Cc:        addressListFromStrings(msg.Cc),
			Bcc:       addressListFromStrings(msg.Bcc),
			Size:      int64(len(rawData)),
			Headers:   msg.Headers,
		}
	}

	// Look up the Inbox folder for this mailbox
	var folderID string
	var uidNext int
	err = r.db.QueryRow(ctx, `
		SELECT id, uid_next FROM mail_folders
		WHERE mailbox_id = $1 AND special_use = '\Inbox'
		LIMIT 1
	`, mailboxID).Scan(&folderID, &uidNext)
	if err != nil {
		// Inbox doesn't exist – try to create default folders
		if createErr := r.ensureMailFolders(ctx, mailboxID); createErr != nil {
			return fmt.Errorf("ensure mail folders: %w", createErr)
		}
		// Retry lookup
		err = r.db.QueryRow(ctx, `
			SELECT id, uid_next FROM mail_folders
			WHERE mailbox_id = $1 AND special_use = '\Inbox'
			LIMIT 1
		`, mailboxID).Scan(&folderID, &uidNext)
		if err != nil {
			return fmt.Errorf("inbox folder not found after creation: %w", err)
		}
	}

	// Marshal JSONB fields
	senderJSON, _ := json.Marshal(parsed.Sender)
	toJSON, _ := json.Marshal(parsed.To)
	ccJSON, _ := json.Marshal(parsed.Cc)
	bccJSON, _ := json.Marshal(parsed.Bcc)
	headersJSON, _ := json.Marshal(parsed.Headers)
	flagsJSON := []byte(`["\\Recent"]`) // New messages get \Recent flag

	// Insert into mail_messages and atomically increment uid_next
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Atomically get and increment uid_next
	var uid int
	err = tx.QueryRow(ctx, `
		UPDATE mail_folders
		SET uid_next = uid_next + 1, updated_at = NOW()
		WHERE id = $1
		RETURNING uid_next - 1
	`, folderID).Scan(&uid)
	if err != nil {
		return fmt.Errorf("increment uid_next: %w", err)
	}

	// Insert the message
	_, err = tx.Exec(ctx, `
		INSERT INTO mail_messages (
			id, folder_id, mailbox_id, uid, message_id,
			in_reply_to, references_header, subject,
			sender, recipients_to, recipients_cc, recipients_bcc,
			reply_to, date, size, flags,
			snippet, text_body, html_body, raw_headers,
			body_path, created_at
		) VALUES (
			gen_random_uuid(), $1, $2, $3, $4,
			$5, $6, $7,
			$8, $9, $10, $11,
			$12, $13::timestamptz, $14, $15,
			$16, $17, $18, $19,
			$20, NOW()
		)
	`,
		folderID, mailboxID, uid, parsed.MessageID,
		nullIfEmpty(parsed.InReplyTo), nullIfEmpty(parsed.References), parsed.Subject,
		senderJSON, toJSON, ccJSON, bccJSON,
		nullIfEmpty(parsed.ReplyTo), nullIfEmpty(parsed.Date), parsed.Size, flagsJSON,
		parsed.Snippet, nullIfEmpty(parsed.TextBody), nullIfEmpty(parsed.HTMLBody), headersJSON,
		nullIfEmpty(storagePath),
	)
	if err != nil {
		return fmt.Errorf("insert mail_messages: %w", err)
	}

	// Update folder counts
	_, err = tx.Exec(ctx, `
		UPDATE mail_folders
		SET message_count = message_count + 1,
		    unseen_count = unseen_count + 1,
		    updated_at = NOW()
		WHERE id = $1
	`, folderID)
	if err != nil {
		return fmt.Errorf("update folder counts: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}

	r.logger.Debug("Delivered message to mail_messages",
		zap.String("mailbox_id", mailboxID),
		zap.String("folder_id", folderID),
		zap.Int("uid", uid),
		zap.String("subject", parsed.Subject))

	return nil
}

// ensureMailFolders creates the default mail_folders for a mailbox if they don't exist
func (r *MessageRepository) ensureMailFolders(ctx context.Context, mailboxID string) error {
	folders := []struct {
		name       string
		specialUse string
		sortOrder  int
	}{
		{"Inbox", "\\Inbox", 0},
		{"Sent", "\\Sent", 1},
		{"Drafts", "\\Drafts", 2},
		{"Trash", "\\Trash", 3},
		{"Spam", "\\Junk", 4},
		{"Archive", "\\Archive", 5},
	}

	for _, f := range folders {
		_, err := r.db.Exec(ctx, `
			INSERT INTO mail_folders (id, mailbox_id, name, full_path, special_use, uid_validity, uid_next, sort_order)
			VALUES (gen_random_uuid(), $1, $2, $3, $4, EXTRACT(EPOCH FROM NOW())::int, 1, $5)
			ON CONFLICT DO NOTHING
		`, mailboxID, f.name, f.name, f.specialUse, f.sortOrder)
		if err != nil {
			return fmt.Errorf("create folder %s: %w", f.name, err)
		}
	}

	return nil
}

// parseRawEmail parses an RFC 5322 message from raw bytes
func parseRawEmail(data []byte, queueMsg *domain.Message) (*ParsedMessage, error) {
	mailMsg, err := mail.ReadMessage(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("parse message: %w", err)
	}

	parsed := &ParsedMessage{
		MessageID:  cleanHeader(mailMsg.Header.Get("Message-Id")),
		InReplyTo:  cleanHeader(mailMsg.Header.Get("In-Reply-To")),
		References: mailMsg.Header.Get("References"),
		Subject:    decodeHeader(mailMsg.Header.Get("Subject")),
		ReplyTo:    mailMsg.Header.Get("Reply-To"),
		Date:       mailMsg.Header.Get("Date"),
		Size:       int64(len(data)),
		Headers:    headerMap(mailMsg.Header),
	}

	// Parse sender
	if from, err := mailMsg.Header.AddressList("From"); err == nil && len(from) > 0 {
		parsed.Sender = EmailAddress{Address: from[0].Address, Name: from[0].Name}
	} else {
		parsed.Sender = EmailAddress{Address: queueMsg.FromAddress, Name: queueMsg.From}
	}

	// Parse recipients
	if to, err := mailMsg.Header.AddressList("To"); err == nil {
		parsed.To = addressListFromMailAddrs(to)
	} else {
		parsed.To = addressListFromStrings(queueMsg.Recipients)
	}
	if cc, err := mailMsg.Header.AddressList("Cc"); err == nil {
		parsed.Cc = addressListFromMailAddrs(cc)
	}
	// Bcc is rarely in headers, use queue data
	parsed.Bcc = addressListFromStrings(queueMsg.Bcc)

	// Extract body parts
	contentType := mailMsg.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "text/plain"
	}
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		// If we can't parse content type, try reading as plain text
		body, _ := io.ReadAll(io.LimitReader(mailMsg.Body, 2*1024*1024)) // 2MB limit
		parsed.TextBody = string(body)
		parsed.Snippet = makeSnippet(parsed.TextBody, 200)
		return parsed, nil
	}

	if strings.HasPrefix(mediaType, "multipart/") {
		boundary := params["boundary"]
		if boundary != "" {
			textBody, htmlBody := extractMultipartBodies(mailMsg.Body, boundary)
			parsed.TextBody = textBody
			parsed.HTMLBody = htmlBody
		}
	} else if strings.HasPrefix(mediaType, "text/html") {
		body, _ := io.ReadAll(io.LimitReader(mailMsg.Body, 2*1024*1024))
		parsed.HTMLBody = string(body)
	} else {
		body, _ := io.ReadAll(io.LimitReader(mailMsg.Body, 2*1024*1024))
		parsed.TextBody = string(body)
	}

	// Generate snippet from text body, or strip HTML if only HTML available
	if parsed.TextBody != "" {
		parsed.Snippet = makeSnippet(parsed.TextBody, 200)
	} else if parsed.HTMLBody != "" {
		parsed.Snippet = makeSnippet(stripHTML(parsed.HTMLBody), 200)
	}

	return parsed, nil
}

// extractMultipartBodies recursively extracts text/plain and text/html parts
func extractMultipartBodies(body io.Reader, boundary string) (textBody, htmlBody string) {
	mr := multipart.NewReader(body, boundary)
	for {
		part, err := mr.NextPart()
		if err != nil {
			break
		}

		ct := part.Header.Get("Content-Type")
		if ct == "" {
			ct = "text/plain"
		}
		partMediaType, partParams, err := mime.ParseMediaType(ct)
		if err != nil {
			continue
		}

		switch {
		case partMediaType == "text/plain" && textBody == "":
			data, _ := io.ReadAll(io.LimitReader(part, 2*1024*1024))
			textBody = string(data)
		case partMediaType == "text/html" && htmlBody == "":
			data, _ := io.ReadAll(io.LimitReader(part, 2*1024*1024))
			htmlBody = string(data)
		case strings.HasPrefix(partMediaType, "multipart/"):
			if b := partParams["boundary"]; b != "" {
				t, h := extractMultipartBodies(part, b)
				if textBody == "" {
					textBody = t
				}
				if htmlBody == "" {
					htmlBody = h
				}
			}
		}
		part.Close()
	}
	return
}

// stripHTML removes HTML tags for snippet generation
func stripHTML(s string) string {
	var out strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
			out.WriteRune(' ')
		case !inTag:
			out.WriteRune(r)
		}
	}
	return out.String()
}

// makeSnippet creates a text snippet of the given max length
func makeSnippet(text string, maxLen int) string {
	// Normalize whitespace
	fields := strings.Fields(text)
	normalized := strings.Join(fields, " ")
	if len(normalized) <= maxLen {
		return normalized
	}
	// Truncate at word boundary
	truncated := normalized[:maxLen]
	lastSpace := strings.LastIndex(truncated, " ")
	if lastSpace > maxLen/2 {
		truncated = truncated[:lastSpace]
	}
	return truncated + "..."
}

// decodeHeader decodes RFC 2047 encoded header values
func decodeHeader(s string) string {
	decoder := new(mime.WordDecoder)
	decoded, err := decoder.DecodeHeader(s)
	if err != nil {
		return s
	}
	return decoded
}

// cleanHeader removes angle brackets from Message-ID style headers
func cleanHeader(s string) string {
	s = strings.TrimSpace(s)
	return s
}

// headerMap converts mail.Header to a string map
func headerMap(h mail.Header) map[string]string {
	result := make(map[string]string)
	for k, v := range h {
		if len(v) > 0 {
			result[k] = v[0]
		}
	}
	return result
}

// addressListFromMailAddrs converts []*mail.Address to []EmailAddress
func addressListFromMailAddrs(addrs []*mail.Address) []EmailAddress {
	result := make([]EmailAddress, 0, len(addrs))
	for _, a := range addrs {
		result = append(result, EmailAddress{Address: a.Address, Name: a.Name})
	}
	return result
}

// addressListFromStrings converts []string email addresses to []EmailAddress
func addressListFromStrings(addrs []string) []EmailAddress {
	result := make([]EmailAddress, 0, len(addrs))
	for _, a := range addrs {
		if a != "" {
			result = append(result, EmailAddress{Address: a})
		}
	}
	return result
}

// nullIfEmpty returns nil for empty strings (for nullable DB columns)
func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
