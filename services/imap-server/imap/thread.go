package imap

import (
	"fmt"
	"sort"
	"strings"

	"go.uber.org/zap"
)

// ThreadAlgorithm represents a threading algorithm (RFC 5256)
type ThreadAlgorithm string

const (
	ThreadAlgorithmOrderedSubject ThreadAlgorithm = "ORDEREDSUBJECT"
	ThreadAlgorithmReferences     ThreadAlgorithm = "REFERENCES"
)

// ThreadNode represents a node in a thread tree
type ThreadNode struct {
	UID      uint32
	Children []*ThreadNode
}

// handleThread handles the THREAD command (RFC 5256)
func (c *Connection) handleThread(tag, args string, uid bool) error {
	if !c.requireSelected(tag) {
		return nil
	}

	// Check if THREAD is enabled
	if !c.config.IMAP.EnableThread {
		c.sendTagged(tag, "BAD THREAD extension not enabled")
		return nil
	}

	// Parse THREAD command: THREAD algorithm charset search-criteria
	parts := strings.SplitN(args, " ", 3)
	if len(parts) < 3 {
		c.sendTagged(tag, "BAD THREAD requires algorithm, charset, and search criteria")
		return nil
	}

	algorithm := ThreadAlgorithm(strings.ToUpper(parts[0]))
	// charset := parts[1] // Usually "UTF-8" or "US-ASCII"
	searchCriteria := parts[2]

	// Validate algorithm
	if algorithm != ThreadAlgorithmOrderedSubject && algorithm != ThreadAlgorithmReferences {
		c.sendTagged(tag, "BAD Unknown threading algorithm")
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	// Parse search criteria
	criteria := parseSearchCriteria(searchCriteria)

	// Search for matching messages
	results, err := c.searchMessages(ctx, c.ctx.ActiveFolder.ID, criteria, uid)
	if err != nil {
		c.logger.Error("Failed to search messages for THREAD", zap.Error(err))
		c.sendTagged(tag, "NO THREAD failed")
		return nil
	}

	// If no results, return empty THREAD response
	if len(results) == 0 {
		c.sendUntagged("THREAD")
		command := "THREAD"
		if uid {
			command = "UID THREAD"
		}
		c.sendTagged(tag, "OK %s completed", command)
		return nil
	}

	// Get messages for threading
	messages, err := c.repo.GetMessages(ctx, c.ctx.ActiveFolder.ID, "1:*", uid)
	if err != nil {
		c.logger.Error("Failed to get messages for THREAD", zap.Error(err))
		c.sendTagged(tag, "NO THREAD failed")
		return nil
	}

	// Build thread tree based on algorithm
	var threads []*ThreadNode
	switch algorithm {
	case ThreadAlgorithmOrderedSubject:
		threads = c.threadByOrderedSubject(messages)
	case ThreadAlgorithmReferences:
		threads = c.threadByReferences(messages)
	}

	// Format and send response
	response := formatThreadResponse(threads)
	c.sendUntagged("THREAD %s", response)

	command := "THREAD"
	if uid {
		command = "UID THREAD"
	}
	c.sendTagged(tag, "OK %s completed", command)
	return nil
}

// threadByOrderedSubject implements the ORDEREDSUBJECT algorithm (RFC 5256)
// Groups messages by base subject, ordered by sent date
func (c *Connection) threadByOrderedSubject(messages []Message) []*ThreadNode {
	// Group messages by normalized subject
	subjectGroups := make(map[string][]*Message)

	for i := range messages {
		msg := &messages[i]
		baseSubject := normalizeSubject(msg.Subject)
		subjectGroups[baseSubject] = append(subjectGroups[baseSubject], msg)
	}

	var threads []*ThreadNode

	// Sort subjects alphabetically for consistent ordering
	var subjects []string
	for subject := range subjectGroups {
		subjects = append(subjects, subject)
	}
	sort.Strings(subjects)

	for _, subject := range subjects {
		group := subjectGroups[subject]

		// Sort messages within group by date
		sort.Slice(group, func(i, j int) bool {
			return group[i].Date.Before(group[j].Date)
		})

		// Create thread structure
		if len(group) == 1 {
			// Single message, no threading needed
			threads = append(threads, &ThreadNode{UID: group[0].UID})
		} else {
			// First message is the root
			root := &ThreadNode{UID: group[0].UID}
			for i := 1; i < len(group); i++ {
				root.Children = append(root.Children, &ThreadNode{UID: group[i].UID})
			}
			threads = append(threads, root)
		}
	}

	return threads
}

// threadByReferences implements the REFERENCES algorithm (RFC 5256)
// Uses In-Reply-To and References headers to build thread tree
func (c *Connection) threadByReferences(messages []Message) []*ThreadNode {
	// Build message ID to message map
	messageByID := make(map[string]*Message)
	messageByUID := make(map[uint32]*Message)

	for i := range messages {
		msg := &messages[i]
		if msg.MessageID != "" {
			messageByID[msg.MessageID] = msg
		}
		messageByUID[msg.UID] = msg
	}

	// Track which messages are children (have a parent)
	hasParent := make(map[uint32]bool)

	// Build parent-child relationships
	childrenMap := make(map[uint32][]*ThreadNode)

	for i := range messages {
		msg := &messages[i]
		var parentUID uint32

		// Check In-Reply-To first
		if msg.InReplyTo != "" {
			if parent, ok := messageByID[msg.InReplyTo]; ok {
				parentUID = parent.UID
			}
		}

		// If no parent found via In-Reply-To, check References
		if parentUID == 0 && len(msg.References) > 0 {
			// References are ordered, last one is immediate parent
			for i := len(msg.References) - 1; i >= 0; i-- {
				if parent, ok := messageByID[msg.References[i]]; ok {
					parentUID = parent.UID
					break
				}
			}
		}

		if parentUID != 0 && parentUID != msg.UID {
			hasParent[msg.UID] = true
			childrenMap[parentUID] = append(childrenMap[parentUID], &ThreadNode{UID: msg.UID})
		}
	}

	// Build thread trees starting from root messages (messages without parents)
	var threads []*ThreadNode

	for i := range messages {
		msg := &messages[i]
		if !hasParent[msg.UID] {
			root := buildThreadTree(msg.UID, childrenMap)
			threads = append(threads, root)
		}
	}

	// Sort threads by the UID of their root message
	sort.Slice(threads, func(i, j int) bool {
		return threads[i].UID < threads[j].UID
	})

	return threads
}

// buildThreadTree recursively builds a thread tree
func buildThreadTree(uid uint32, childrenMap map[uint32][]*ThreadNode) *ThreadNode {
	node := &ThreadNode{UID: uid}

	children := childrenMap[uid]
	for _, child := range children {
		childNode := buildThreadTree(child.UID, childrenMap)
		node.Children = append(node.Children, childNode)
	}

	// Sort children by UID for consistent ordering
	sort.Slice(node.Children, func(i, j int) bool {
		return node.Children[i].UID < node.Children[j].UID
	})

	return node
}

// normalizeSubject removes Re:, Fwd:, etc. prefixes from subject
func normalizeSubject(subject string) string {
	subject = strings.TrimSpace(subject)
	subject = strings.ToLower(subject)

	// Remove common prefixes
	prefixes := []string{"re:", "fwd:", "fw:", "aw:", "sv:", "antw:"}
	for {
		changed := false
		for _, prefix := range prefixes {
			if strings.HasPrefix(subject, prefix) {
				subject = strings.TrimPrefix(subject, prefix)
				subject = strings.TrimSpace(subject)
				changed = true
			}
		}
		if !changed {
			break
		}
	}

	// Also remove [tag] style prefixes
	for strings.HasPrefix(subject, "[") {
		end := strings.Index(subject, "]")
		if end == -1 {
			break
		}
		subject = strings.TrimSpace(subject[end+1:])
	}

	return subject
}

// formatThreadResponse formats thread nodes into IMAP THREAD response format
// Format: (uid1 uid2 (uid3 uid4)) where nested parens indicate children
func formatThreadResponse(threads []*ThreadNode) string {
	var parts []string

	for _, thread := range threads {
		parts = append(parts, formatThreadNode(thread))
	}

	return strings.Join(parts, "")
}

// formatThreadNode formats a single thread node and its children
func formatThreadNode(node *ThreadNode) string {
	if len(node.Children) == 0 {
		return fmt.Sprintf("(%d)", node.UID)
	}

	var result strings.Builder
	result.WriteString(fmt.Sprintf("(%d", node.UID))

	for _, child := range node.Children {
		if len(child.Children) == 0 {
			result.WriteString(fmt.Sprintf(" %d", child.UID))
		} else {
			result.WriteString(" ")
			result.WriteString(formatThreadNode(child))
		}
	}

	result.WriteString(")")
	return result.String()
}
