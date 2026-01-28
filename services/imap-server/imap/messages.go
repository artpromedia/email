package imap

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// handleFetch handles the FETCH command
func (c *Connection) handleFetch(tag, args string, uid bool) error {
	if !c.requireSelected(tag) {
		return nil
	}

	// Parse sequence set and fetch items
	parts := strings.SplitN(args, " ", 2)
	if len(parts) < 2 {
		c.sendTagged(tag, "BAD FETCH requires sequence set and data items")
		return nil
	}

	seqSet := parts[0]
	fetchItems := parseFetchItems(parts[1])

	ctx, cancel := c.getContext()
	defer cancel()

	// Get messages based on sequence or UID set
	messages, err := c.repo.GetMessages(ctx, c.ctx.ActiveFolder.ID, seqSet, uid)
	if err != nil {
		c.logger.Error("Failed to fetch messages", zap.Error(err))
		c.sendTagged(tag, "NO FETCH failed")
		return nil
	}

	for _, msg := range messages {
		response := c.buildFetchResponse(&msg, fetchItems, uid)
		c.sendUntagged("%d FETCH %s", msg.SequenceNumber, response)

		// If BODY or RFC822 was fetched, mark as seen unless PEEK
		if c.shouldMarkSeen(fetchItems) && !c.ctx.ReadOnly {
			if err := c.repo.UpdateMessageFlags(ctx, msg.ID, []string{"\\Seen"}, "add"); err != nil {
				c.logger.Warn("Failed to mark message as seen", zap.Error(err))
			}
		}
	}

	command := "FETCH"
	if uid {
		command = "UID FETCH"
	}
	c.sendTagged(tag, "OK %s completed", command)
	return nil
}

// handleStore handles the STORE command
func (c *Connection) handleStore(tag, args string, uid bool) error {
	if !c.requireSelected(tag) {
		return nil
	}

	if c.ctx.ReadOnly {
		c.sendTagged(tag, "NO Mailbox is read-only")
		return nil
	}

	// Parse sequence set, operation, and flags
	parts := strings.SplitN(args, " ", 3)
	if len(parts) < 3 {
		c.sendTagged(tag, "BAD STORE requires sequence set, data item, and flags")
		return nil
	}

	seqSet := parts[0]
	dataItem := strings.ToUpper(parts[1])
	flagsStr := parts[2]

	// Parse flags
	flags := parseFlagList(flagsStr)

	// Determine operation
	var operation string
	var silent bool
	switch {
	case strings.HasPrefix(dataItem, "+FLAGS"):
		operation = "add"
		silent = strings.Contains(dataItem, ".SILENT")
	case strings.HasPrefix(dataItem, "-FLAGS"):
		operation = "remove"
		silent = strings.Contains(dataItem, ".SILENT")
	case strings.HasPrefix(dataItem, "FLAGS"):
		operation = "replace"
		silent = strings.Contains(dataItem, ".SILENT")
	default:
		c.sendTagged(tag, "BAD Invalid STORE data item")
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	// Get messages
	messages, err := c.repo.GetMessages(ctx, c.ctx.ActiveFolder.ID, seqSet, uid)
	if err != nil {
		c.logger.Error("Failed to get messages for STORE", zap.Error(err))
		c.sendTagged(tag, "NO STORE failed")
		return nil
	}

	for _, msg := range messages {
		// Update flags
		if err := c.repo.UpdateMessageFlags(ctx, msg.ID, flags, operation); err != nil {
			c.logger.Warn("Failed to update flags", zap.String("message_id", msg.ID), zap.Error(err))
			continue
		}

		// Send FETCH response unless SILENT
		if !silent {
			// Get updated flags
			newFlags := c.applyFlagOperation(msg.Flags, flags, operation)
			flagList := strings.Join(newFlags, " ")

			if uid {
				c.sendUntagged("%d FETCH (UID %d FLAGS (%s))", msg.SequenceNumber, msg.UID, flagList)
			} else {
				c.sendUntagged("%d FETCH (FLAGS (%s))", msg.SequenceNumber, flagList)
			}
		}

		// Notify other connections
		c.notifyHub.Notify(c.ctx.ActiveMailbox.ID, &IdleNotification{
			Type:      "FLAGS",
			MailboxID: c.ctx.ActiveMailbox.ID,
			MessageID: msg.ID,
			UID:       msg.UID,
			Data: map[string]interface{}{
				"flags": c.applyFlagOperation(msg.Flags, flags, operation),
			},
		})
	}

	command := "STORE"
	if uid {
		command = "UID STORE"
	}
	c.sendTagged(tag, "OK %s completed", command)
	return nil
}

// handleSearch handles the SEARCH command
func (c *Connection) handleSearch(tag, args string, uid bool) error {
	if !c.requireSelected(tag) {
		return nil
	}

	// Parse search criteria
	criteria := parseSearchCriteria(args)

	ctx, cancel := c.getContext()
	defer cancel()

	// Search messages
	results, err := c.searchMessages(ctx, c.ctx.ActiveFolder.ID, criteria, uid)
	if err != nil {
		c.logger.Error("Failed to search messages", zap.Error(err))
		c.sendTagged(tag, "NO SEARCH failed")
		return nil
	}

	command := "SEARCH"
	if uid {
		command = "UID SEARCH"
	}

	if len(results) > 0 {
		c.sendUntagged("SEARCH %s", strings.Join(results, " "))
	} else {
		c.sendUntagged("SEARCH")
	}

	c.sendTagged(tag, "OK %s completed", command)
	return nil
}

// handleExpunge handles the EXPUNGE command
func (c *Connection) handleExpunge(tag string) error {
	if !c.requireSelected(tag) {
		return nil
	}

	if c.ctx.ReadOnly {
		c.sendTagged(tag, "NO Mailbox is read-only")
		return nil
	}

	expunged := c.expungeMessages()

	// Send EXPUNGE responses in reverse order
	for i := len(expunged) - 1; i >= 0; i-- {
		c.sendUntagged("%d EXPUNGE", expunged[i])
	}

	c.sendTagged(tag, "OK EXPUNGE completed")
	return nil
}

// handleAppend handles the APPEND command
func (c *Connection) handleAppend(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	// Parse APPEND arguments: mailbox [flags] [date-time] literal
	mailboxName, flags, internalDate, literalSize, err := parseAppendArgs(args)
	if err != nil {
		c.sendTagged(tag, "BAD %s", err.Error())
		return nil
	}

	mailbox, folderPath, err := c.parseMailboxPath(mailboxName)
	if err != nil {
		c.sendTagged(tag, "NO [TRYCREATE] %s", err.Error())
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	folder, err := c.repo.GetFolderByPath(ctx, mailbox.ID, folderPath)
	if err != nil {
		c.sendTagged(tag, "NO [TRYCREATE] Mailbox does not exist")
		return nil
	}

	// Check quota
	quota, _ := c.repo.GetQuota(ctx, mailbox.ID)
	if quota != nil && quota.StorageUsed+int64(literalSize) > quota.StorageLimit {
		c.sendTagged(tag, "NO [OVERQUOTA] Quota exceeded")
		return nil
	}

	// Send continuation request
	c.sendContinuation("Ready for literal data")

	// Read literal data
	messageData := make([]byte, literalSize)
	_, err = c.reader.Read(messageData)
	if err != nil {
		c.logger.Error("Failed to read message data", zap.Error(err))
		c.sendTagged(tag, "BAD Failed to read message data")
		return nil
	}

	// Parse message
	size := int64(len(messageData))

	// Generate UID
	uid := folder.UIDNext

	// Create message record
	message := &Message{
		ID:         uuid.New().String(),
		MailboxID:  mailbox.ID,
		FolderID:   folder.ID,
		UID:        uid,
		Flags:      flags,
		Size:       size,
		ReceivedAt: internalDate,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	// Parse headers from message data
	message.Subject, message.From, message.To, message.MessageID, message.Date = parseMessageHeaders(string(messageData))

	// Store message
	if err := c.storeMessage(ctx, message, messageData); err != nil {
		c.logger.Error("Failed to store message", zap.Error(err))
		c.sendTagged(tag, "NO APPEND failed")
		return nil
	}

	// Update folder counters
	if err := c.repo.UpdateFolderCounts(ctx, folder.ID); err != nil {
		c.logger.Warn("Failed to update folder counts", zap.Error(err))
	}

	c.logger.Info("Message appended",
		zap.String("folder", folderPath),
		zap.Uint32("uid", uid),
	)

	c.sendTagged(tag, "OK [APPENDUID %d %d] APPEND completed", folder.UIDValidity, uid)
	return nil
}

// buildFetchResponse builds FETCH response data
func (c *Connection) buildFetchResponse(msg *Message, items []string, uid bool) string {
	var parts []string

	for _, item := range items {
		upperItem := strings.ToUpper(item)

		switch {
		case upperItem == "FLAGS":
			flags := strings.Join(msg.Flags, " ")
			parts = append(parts, fmt.Sprintf("FLAGS (%s)", flags))

		case upperItem == "UID":
			parts = append(parts, fmt.Sprintf("UID %d", msg.UID))

		case upperItem == "INTERNALDATE":
			parts = append(parts, fmt.Sprintf(`INTERNALDATE "%s"`, msg.ReceivedAt.Format("02-Jan-2006 15:04:05 -0700")))

		case upperItem == "RFC822.SIZE":
			parts = append(parts, fmt.Sprintf("RFC822.SIZE %d", msg.Size))

		case upperItem == "ENVELOPE":
			parts = append(parts, fmt.Sprintf("ENVELOPE %s", c.buildEnvelope(msg)))

		case upperItem == "BODYSTRUCTURE":
			parts = append(parts, fmt.Sprintf("BODYSTRUCTURE %s", c.buildBodyStructure(msg)))

		case strings.HasPrefix(upperItem, "BODY[") || strings.HasPrefix(upperItem, "BODY.PEEK["):
			section := extractBodySection(item)
			data := c.fetchBodySection(msg, section)
			parts = append(parts, fmt.Sprintf("BODY[%s] {%d}\r\n%s", section, len(data), data))

		case upperItem == "RFC822":
			data := c.fetchFullMessage(msg)
			parts = append(parts, fmt.Sprintf("RFC822 {%d}\r\n%s", len(data), data))

		case upperItem == "RFC822.HEADER":
			data := c.fetchHeaders(msg)
			parts = append(parts, fmt.Sprintf("RFC822.HEADER {%d}\r\n%s", len(data), data))

		case upperItem == "RFC822.TEXT":
			data := c.fetchBody(msg)
			parts = append(parts, fmt.Sprintf("RFC822.TEXT {%d}\r\n%s", len(data), data))
		}
	}

	if uid {
		// Ensure UID is included
		hasUID := false
		for _, p := range parts {
			if strings.HasPrefix(p, "UID ") {
				hasUID = true
				break
			}
		}
		if !hasUID {
			parts = append(parts, fmt.Sprintf("UID %d", msg.UID))
		}
	}

	return "(" + strings.Join(parts, " ") + ")"
}

// parseFetchItems parses FETCH data items
func parseFetchItems(args string) []string {
	args = strings.TrimSpace(args)

	// Handle macros
	switch strings.ToUpper(args) {
	case "ALL":
		return []string{"FLAGS", "INTERNALDATE", "RFC822.SIZE", "ENVELOPE"}
	case "FAST":
		return []string{"FLAGS", "INTERNALDATE", "RFC822.SIZE"}
	case "FULL":
		return []string{"FLAGS", "INTERNALDATE", "RFC822.SIZE", "ENVELOPE", "BODYSTRUCTURE"}
	}

	// Handle parenthesized list
	if strings.HasPrefix(args, "(") && strings.HasSuffix(args, ")") {
		args = args[1 : len(args)-1]
	}

	return strings.Fields(args)
}

// parseFlagList parses a flag list from STORE command
func parseFlagList(args string) []string {
	args = strings.TrimSpace(args)
	if strings.HasPrefix(args, "(") && strings.HasSuffix(args, ")") {
		args = args[1 : len(args)-1]
	}
	return strings.Fields(args)
}

// parseSearchCriteria parses SEARCH criteria
func parseSearchCriteria(args string) []SearchKey {
	var criteria []SearchKey
	args = strings.TrimSpace(args)

	// Simple tokenization - production would need proper parsing
	tokens := strings.Fields(args)

	for i := 0; i < len(tokens); i++ {
		key := strings.ToUpper(tokens[i])
		criterion := SearchKey{Key: key}

		switch key {
		case "ALL", "ANSWERED", "DELETED", "DRAFT", "FLAGGED", "NEW", "OLD", "RECENT", "SEEN", "UNANSWERED", "UNDELETED", "UNDRAFT", "UNFLAGGED", "UNSEEN":
			// No value needed

		case "FROM", "TO", "CC", "BCC", "SUBJECT", "BODY", "TEXT":
			if i+1 < len(tokens) {
				i++
				criterion.Value = tokens[i]
			}

		case "BEFORE", "ON", "SINCE", "SENTBEFORE", "SENTON", "SENTSINCE":
			if i+1 < len(tokens) {
				i++
				criterion.Value = tokens[i]
			}

		case "LARGER", "SMALLER":
			if i+1 < len(tokens) {
				i++
				criterion.Value = tokens[i]
			}

		case "UID":
			if i+1 < len(tokens) {
				i++
				criterion.Value = tokens[i]
			}

		case "OR":
			// Would need to handle nested criteria
			continue

		case "NOT":
			// Would need to handle negation
			continue

		default:
			// Might be a sequence set
			criterion.Key = "SEQSET"
			criterion.Value = key
		}

		criteria = append(criteria, criterion)
	}

	return criteria
}

// applyFlagOperation applies flag changes and returns new flag list
func (c *Connection) applyFlagOperation(current, changes []string, operation string) []string {
	flagMap := make(map[string]bool)

	switch operation {
	case "add":
		for _, f := range current {
			flagMap[f] = true
		}
		for _, f := range changes {
			flagMap[f] = true
		}

	case "remove":
		for _, f := range current {
			flagMap[f] = true
		}
		for _, f := range changes {
			delete(flagMap, f)
		}

	case "replace":
		for _, f := range changes {
			flagMap[f] = true
		}
	}

	var result []string
	for f := range flagMap {
		result = append(result, f)
	}
	return result
}

// shouldMarkSeen checks if FETCH items should mark message as seen
func (c *Connection) shouldMarkSeen(items []string) bool {
	for _, item := range items {
		upper := strings.ToUpper(item)
		// BODY[...] without .PEEK marks as seen
		if strings.HasPrefix(upper, "BODY[") && !strings.HasPrefix(upper, "BODY.PEEK[") {
			return true
		}
		// RFC822 and RFC822.TEXT mark as seen
		if upper == "RFC822" || upper == "RFC822.TEXT" {
			return true
		}
	}
	return false
}

// expungeMessages removes messages with \Deleted flag
func (c *Connection) expungeMessages() []uint32 {
	ctx, cancel := c.getContext()
	defer cancel()

	messages, _ := c.repo.GetMessages(ctx, c.ctx.ActiveFolder.ID, "1:*", false)

	var expunged []uint32
	for _, msg := range messages {
		for _, flag := range msg.Flags {
			if flag == "\\Deleted" {
				// Delete message
				// Would call repo.DeleteMessage here
				expunged = append(expunged, msg.SequenceNumber)
				break
			}
		}
	}

	return expunged
}

// searchMessages searches messages based on criteria
func (c *Connection) searchMessages(ctx interface{}, folderID string, criteria []SearchKey, uid bool) ([]string, error) {
	// Implementation would build SQL query from criteria
	// For now, return empty results
	return []string{}, nil
}

// parseAppendArgs parses APPEND command arguments
func parseAppendArgs(args string) (mailbox string, flags []string, internalDate time.Time, literalSize int, err error) {
	// Default values
	internalDate = time.Now()

	// Parse mailbox name
	parts := parseQuotedStrings(args)
	if len(parts) < 1 {
		err = fmt.Errorf("missing mailbox name")
		return
	}
	mailbox = parts[0]

	// Find flags if present
	flagStart := strings.Index(args, "(")
	flagEnd := strings.Index(args, ")")
	if flagStart != -1 && flagEnd != -1 {
		flagStr := args[flagStart+1 : flagEnd]
		flags = strings.Fields(flagStr)
	}

	// Find date-time if present
	dateStart := strings.Index(args, "\"")
	if dateStart > flagEnd {
		dateEnd := strings.Index(args[dateStart+1:], "\"")
		if dateEnd != -1 {
			dateStr := args[dateStart+1 : dateStart+1+dateEnd]
			if t, parseErr := time.Parse("02-Jan-2006 15:04:05 -0700", dateStr); parseErr == nil {
				internalDate = t
			}
		}
	}

	// Find literal size
	literalStart := strings.Index(args, "{")
	literalEnd := strings.Index(args, "}")
	if literalStart != -1 && literalEnd != -1 {
		sizeStr := args[literalStart+1 : literalEnd]
		sizeStr = strings.TrimSuffix(sizeStr, "+") // Non-synchronizing literal
		literalSize, err = strconv.Atoi(sizeStr)
	} else {
		err = fmt.Errorf("missing literal size")
	}

	return
}

// parseMessageHeaders extracts common headers from message data
func parseMessageHeaders(data string) (subject, from, to, messageID string, date time.Time) {
	lines := strings.Split(data, "\r\n")
	for _, line := range lines {
		if line == "" {
			break // End of headers
		}

		lower := strings.ToLower(line)
		if strings.HasPrefix(lower, "subject:") {
			subject = strings.TrimSpace(line[8:])
		} else if strings.HasPrefix(lower, "from:") {
			from = strings.TrimSpace(line[5:])
		} else if strings.HasPrefix(lower, "to:") {
			to = strings.TrimSpace(line[3:])
		} else if strings.HasPrefix(lower, "message-id:") {
			messageID = strings.TrimSpace(line[11:])
		} else if strings.HasPrefix(lower, "date:") {
			dateStr := strings.TrimSpace(line[5:])
			// Try parsing common date formats
			formats := []string{
				time.RFC1123Z,
				time.RFC1123,
				time.RFC822Z,
				time.RFC822,
				"Mon, 2 Jan 2006 15:04:05 -0700",
			}
			for _, format := range formats {
				if t, err := time.Parse(format, dateStr); err == nil {
					date = t
					break
				}
			}
		}
	}
	return
}

// storeMessage stores message data
func (c *Connection) storeMessage(ctx interface{}, msg *Message, data []byte) error {
	// Would store to file system or object storage
	// And insert database record
	return nil
}

// extractBodySection extracts the section specifier from BODY[section]
func extractBodySection(item string) string {
	start := strings.Index(item, "[")
	end := strings.Index(item, "]")
	if start != -1 && end != -1 {
		return item[start+1 : end]
	}
	return ""
}

// buildEnvelope builds ENVELOPE response
func (c *Connection) buildEnvelope(msg *Message) string {
	// Simplified envelope structure
	return fmt.Sprintf(`("%s" NIL ((%s)) ((%s)) ((%s)) ((%s)) NIL NIL NIL "%s")`,
		msg.Date.Format("Mon, 02 Jan 2006 15:04:05 -0700"),
		msg.From,
		msg.From, // Sender
		msg.From, // Reply-To
		msg.To,
		msg.MessageID,
	)
}

// buildBodyStructure builds BODYSTRUCTURE response
func (c *Connection) buildBodyStructure(msg *Message) string {
	// Simplified body structure - would need actual MIME parsing
	return `("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 0 0)`
}

// fetchBodySection fetches a specific body section
func (c *Connection) fetchBodySection(msg *Message, section string) string {
	// Would fetch from storage based on section
	return ""
}

// fetchFullMessage fetches the complete message
func (c *Connection) fetchFullMessage(msg *Message) string {
	// Would fetch from storage
	return ""
}

// fetchHeaders fetches message headers
func (c *Connection) fetchHeaders(msg *Message) string {
	// Would fetch from storage
	return ""
}

// fetchBody fetches message body
func (c *Connection) fetchBody(msg *Message) string {
	// Would fetch from storage
	return ""
}

// sendPendingUpdates sends any pending mailbox updates
func (c *Connection) sendPendingUpdates() {
	// Would check for updates and send EXISTS, RECENT, FLAGS changes
}

// sendContinuation sends a continuation response
func (c *Connection) sendContinuation(msg string) {
	fmt.Fprintf(c.writer, "+ %s\r\n", msg)
	c.writer.Flush()
}

// decodeBase64 decodes base64 encoded string
func decodeBase64(s string) (string, error) {
	decoded, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return "", err
	}
	return string(decoded), nil
}
