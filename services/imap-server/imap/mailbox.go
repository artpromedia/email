package imap

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// handleSelect handles SELECT and EXAMINE commands
func (c *Connection) handleSelect(tag, args string, readOnly bool) error {
	if !c.requireAuth(tag) {
		return nil
	}

	mailboxName := strings.Trim(args, "\"")
	if mailboxName == "" {
		c.sendTagged(tag, "BAD Missing mailbox name")
		return nil
	}

	// Parse mailbox path to get domain context and folder
	mailbox, folderPath, err := c.parseMailboxPath(mailboxName)
	if err != nil {
		c.sendTagged(tag, "NO %s", err.Error())
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	// Get folder
	folder, err := c.repo.GetFolderByPath(ctx, mailbox.ID, folderPath)
	if err != nil {
		c.sendTagged(tag, "NO Mailbox does not exist")
		return nil
	}

	if !folder.Selectable {
		c.sendTagged(tag, "NO Mailbox is not selectable")
		return nil
	}

	// Update context
	c.ctx.ActiveMailbox = mailbox
	c.ctx.ActiveFolder = folder
	c.ctx.DomainContext = mailbox.Domain
	c.ctx.ReadOnly = readOnly

	// Subscribe to notifications for this mailbox
	c.notifyHub.UnsubscribeAll(c.id)
	c.idleChan = c.notifyHub.Subscribe(mailbox.ID, c.id)

	// Send response
	c.sendUntagged("FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)")
	c.sendUntagged("%d EXISTS", folder.MessageCount)
	c.sendUntagged("%d RECENT", folder.RecentCount)

	if folder.UnseenCount > 0 && folder.FirstUnseen > 0 {
		c.sendUntagged("OK [UNSEEN %d] First unseen message", folder.FirstUnseen)
	}

	c.sendUntagged("OK [UIDVALIDITY %d] UIDs valid", folder.UIDValidity)
	c.sendUntagged("OK [UIDNEXT %d] Predicted next UID", folder.UIDNext)

	if folder.HighestModSeq > 0 {
		c.sendUntagged("OK [HIGHESTMODSEQ %d] Highest modseq", folder.HighestModSeq)
	}

	permFlags := "\\Seen \\Answered \\Flagged \\Deleted \\Draft"
	if !readOnly {
		permFlags += " \\*"
	}
	c.sendUntagged("OK [PERMANENTFLAGS (%s)] Limited", permFlags)

	command := "SELECT"
	accessType := "READ-WRITE"
	if readOnly {
		command = "EXAMINE"
		accessType = "READ-ONLY"
	}

	c.logger.Info("Mailbox selected",
		zap.String("mailbox", mailboxName),
		zap.String("folder", folderPath),
		zap.Bool("read_only", readOnly),
	)

	c.sendTagged(tag, "OK [%s] %s completed", accessType, command)
	return nil
}

// handleCreate handles the CREATE command
func (c *Connection) handleCreate(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	mailboxName := strings.Trim(args, "\"")
	if mailboxName == "" {
		c.sendTagged(tag, "BAD Missing mailbox name")
		return nil
	}

	// Parse mailbox path
	mailbox, folderPath, err := c.parseMailboxPath(mailboxName)
	if err != nil {
		c.sendTagged(tag, "NO %s", err.Error())
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	// Check if folder already exists
	existing, _ := c.repo.GetFolderByPath(ctx, mailbox.ID, folderPath)
	if existing != nil {
		c.sendTagged(tag, "NO Mailbox already exists")
		return nil
	}

	// Extract folder name and parent
	parts := strings.Split(folderPath, "/")
	folderName := parts[len(parts)-1]

	var parentID *string
	if len(parts) > 1 {
		parentPath := strings.Join(parts[:len(parts)-1], "/")
		parent, _ := c.repo.GetFolderByPath(ctx, mailbox.ID, parentPath)
		if parent != nil {
			parentID = &parent.ID
		}
	}

	// Create folder
	folder := &Folder{
		ID:            uuid.New().String(),
		MailboxID:     mailbox.ID,
		Name:          folderName,
		FullPath:      folderPath,
		ParentID:      parentID,
		Delimiter:     "/",
		UIDValidity:   uint32(time.Now().Unix()),
		UIDNext:       1,
		HighestModSeq: 1,
		Subscribed:    true,
		Selectable:    true,
		Attributes:    []string{"\\HasNoChildren"},
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := c.repo.CreateFolder(ctx, folder); err != nil {
		c.logger.Error("Failed to create folder", zap.Error(err))
		c.sendTagged(tag, "NO Cannot create mailbox")
		return nil
	}

	c.logger.Info("Folder created",
		zap.String("folder", folderPath),
		zap.String("mailbox_id", mailbox.ID),
	)

	c.sendTagged(tag, "OK CREATE completed")
	return nil
}

// handleDelete handles the DELETE command
func (c *Connection) handleDelete(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	mailboxName := strings.Trim(args, "\"")
	if mailboxName == "" {
		c.sendTagged(tag, "BAD Missing mailbox name")
		return nil
	}

	// Prevent deleting INBOX
	if strings.EqualFold(mailboxName, "INBOX") || strings.HasSuffix(strings.ToUpper(mailboxName), "/INBOX") {
		c.sendTagged(tag, "NO Cannot delete INBOX")
		return nil
	}

	mailbox, folderPath, err := c.parseMailboxPath(mailboxName)
	if err != nil {
		c.sendTagged(tag, "NO %s", err.Error())
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	folder, err := c.repo.GetFolderByPath(ctx, mailbox.ID, folderPath)
	if err != nil {
		c.sendTagged(tag, "NO Mailbox does not exist")
		return nil
	}

	// Check for special-use folders
	if folder.SpecialUse != nil {
		c.sendTagged(tag, "NO Cannot delete special-use mailbox")
		return nil
	}

	if err := c.repo.DeleteFolder(ctx, folder.ID); err != nil {
		c.logger.Error("Failed to delete folder", zap.Error(err))
		c.sendTagged(tag, "NO Cannot delete mailbox")
		return nil
	}

	c.sendTagged(tag, "OK DELETE completed")
	return nil
}

// handleRename handles the RENAME command
func (c *Connection) handleRename(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	parts := parseQuotedStrings(args)
	if len(parts) < 2 {
		c.sendTagged(tag, "BAD RENAME requires old and new mailbox names")
		return nil
	}

	oldName := parts[0]
	newName := parts[1]

	// Prevent renaming INBOX to itself
	if strings.EqualFold(oldName, "INBOX") && strings.EqualFold(newName, "INBOX") {
		c.sendTagged(tag, "NO Cannot rename INBOX to itself")
		return nil
	}

	mailbox, oldPath, err := c.parseMailboxPath(oldName)
	if err != nil {
		c.sendTagged(tag, "NO %s", err.Error())
		return nil
	}

	_, newPath, err := c.parseMailboxPath(newName)
	if err != nil {
		c.sendTagged(tag, "NO %s", err.Error())
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	folder, err := c.repo.GetFolderByPath(ctx, mailbox.ID, oldPath)
	if err != nil {
		c.sendTagged(tag, "NO Mailbox does not exist")
		return nil
	}

	// Extract new folder name
	nameParts := strings.Split(newPath, "/")
	newFolderName := nameParts[len(nameParts)-1]

	if err := c.repo.RenameFolder(ctx, folder.ID, newFolderName, newPath); err != nil {
		c.logger.Error("Failed to rename folder", zap.Error(err))
		c.sendTagged(tag, "NO Cannot rename mailbox")
		return nil
	}

	c.sendTagged(tag, "OK RENAME completed")
	return nil
}

// handleSubscribe handles SUBSCRIBE and UNSUBSCRIBE commands
func (c *Connection) handleSubscribe(tag, args string, subscribe bool) error {
	if !c.requireAuth(tag) {
		return nil
	}

	mailboxName := strings.Trim(args, "\"")

	mailbox, folderPath, err := c.parseMailboxPath(mailboxName)
	if err != nil {
		c.sendTagged(tag, "NO %s", err.Error())
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	folder, err := c.repo.GetFolderByPath(ctx, mailbox.ID, folderPath)
	if err != nil {
		c.sendTagged(tag, "NO Mailbox does not exist")
		return nil
	}

	// Update subscription status
	folder.Subscribed = subscribe
	// Would update in database here

	command := "SUBSCRIBE"
	if !subscribe {
		command = "UNSUBSCRIBE"
	}

	c.sendTagged(tag, "OK %s completed", command)
	return nil
}

// handleStatus handles the STATUS command
func (c *Connection) handleStatus(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	// Parse mailbox name and status items
	parts := parseQuotedStrings(args)
	if len(parts) < 1 {
		c.sendTagged(tag, "BAD STATUS requires mailbox name")
		return nil
	}

	mailboxName := parts[0]

	// Parse status data items from remainder
	statusItems := parseStatusItems(args)

	mailbox, folderPath, err := c.parseMailboxPath(mailboxName)
	if err != nil {
		c.sendTagged(tag, "NO %s", err.Error())
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	folder, err := c.repo.GetFolderByPath(ctx, mailbox.ID, folderPath)
	if err != nil {
		c.sendTagged(tag, "NO Mailbox does not exist")
		return nil
	}

	// Build status response
	var statusParts []string
	for _, item := range statusItems {
		switch strings.ToUpper(item) {
		case "MESSAGES":
			statusParts = append(statusParts, fmt.Sprintf("MESSAGES %d", folder.MessageCount))
		case "RECENT":
			statusParts = append(statusParts, fmt.Sprintf("RECENT %d", folder.RecentCount))
		case "UIDNEXT":
			statusParts = append(statusParts, fmt.Sprintf("UIDNEXT %d", folder.UIDNext))
		case "UIDVALIDITY":
			statusParts = append(statusParts, fmt.Sprintf("UIDVALIDITY %d", folder.UIDValidity))
		case "UNSEEN":
			statusParts = append(statusParts, fmt.Sprintf("UNSEEN %d", folder.UnseenCount))
		case "HIGHESTMODSEQ":
			statusParts = append(statusParts, fmt.Sprintf("HIGHESTMODSEQ %d", folder.HighestModSeq))
		}
	}

	c.sendUntagged(`STATUS "%s" (%s)`, mailboxName, strings.Join(statusParts, " "))
	c.sendTagged(tag, "OK STATUS completed")
	return nil
}

// handleCheck handles the CHECK command
func (c *Connection) handleCheck(tag string) error {
	if !c.requireSelected(tag) {
		return nil
	}

	// Sync mailbox state
	c.sendPendingUpdates()

	c.sendTagged(tag, "OK CHECK completed")
	return nil
}

// handleClose handles the CLOSE command
func (c *Connection) handleClose(tag string) error {
	if !c.requireSelected(tag) {
		return nil
	}

	// Expunge deleted messages if not read-only
	if !c.ctx.ReadOnly {
		c.expungeMessages()
	}

	// Clear selection
	c.notifyHub.Unsubscribe(c.ctx.ActiveMailbox.ID, c.id)
	c.ctx.ActiveMailbox = nil
	c.ctx.ActiveFolder = nil
	c.ctx.DomainContext = nil
	c.ctx.ReadOnly = false

	c.sendTagged(tag, "OK CLOSE completed")
	return nil
}

// handleUnselect handles the UNSELECT command (like CLOSE but without expunge)
func (c *Connection) handleUnselect(tag string) error {
	if !c.requireSelected(tag) {
		return nil
	}

	// Clear selection without expunging
	c.notifyHub.Unsubscribe(c.ctx.ActiveMailbox.ID, c.id)
	c.ctx.ActiveMailbox = nil
	c.ctx.ActiveFolder = nil
	c.ctx.DomainContext = nil
	c.ctx.ReadOnly = false

	c.sendTagged(tag, "OK UNSELECT completed")
	return nil
}

// parseStatusItems parses STATUS data items from arguments
func parseStatusItems(args string) []string {
	// Find content between parentheses
	start := strings.Index(args, "(")
	end := strings.LastIndex(args, ")")
	if start == -1 || end == -1 || end <= start {
		return nil
	}

	content := args[start+1 : end]
	return strings.Fields(content)
}
