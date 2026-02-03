package imap

import (
	"fmt"

	"go.uber.org/zap"
)

// handleCopy handles the COPY command
func (c *Connection) handleCopy(tag, args string, uid bool) error {
	if !c.requireSelected(tag) {
		return nil
	}

	// Parse sequence set and destination
	parts := parseQuotedStrings(args)
	if len(parts) < 2 {
		c.sendTagged(tag, "BAD COPY requires sequence set and destination")
		return nil
	}

	seqSet := parts[0]
	destName := parts[1]

	// Parse destination mailbox
	destMailbox, destPath, err := c.parseMailboxPath(destName)
	if err != nil {
		c.sendTagged(tag, "NO [TRYCREATE] %s", err.Error())
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	// Get destination folder
	destFolder, err := c.repo.GetFolderByPath(ctx, destMailbox.ID, destPath)
	if err != nil {
		c.sendTagged(tag, "NO [TRYCREATE] Destination mailbox does not exist")
		return nil
	}

	// Check if this is a cross-domain copy
	crossDomain := c.ctx.ActiveMailbox.ID != destMailbox.ID

	// Check permissions for cross-domain copy
	if crossDomain {
		hasAccess := false
		for _, mb := range c.ctx.Mailboxes {
			if mb.ID == destMailbox.ID {
				hasAccess = true
				break
			}
		}
		if !hasAccess {
			// Check shared mailbox access
			for _, shared := range c.ctx.SharedMailboxes {
				if shared.MailboxID == destMailbox.ID {
					// Check for insert permission
					for _, perm := range shared.Permissions {
						if perm == PermissionInsert || perm == PermissionAll {
							hasAccess = true
							break
						}
					}
					break
				}
			}
		}
		if !hasAccess {
			c.sendTagged(tag, "NO Permission denied")
			return nil
		}
	}

	// Get messages to copy
	messages, err := c.repo.GetMessages(ctx, c.ctx.ActiveFolder.ID, seqSet, uid)
	if err != nil {
		c.logger.Error("Failed to get messages for COPY", zap.Error(err))
		c.sendTagged(tag, "NO COPY failed")
		return nil
	}

	if len(messages) == 0 {
		c.sendTagged(tag, "OK COPY completed (no messages)")
		return nil
	}

	// Copy messages
	uidMap, err := c.repo.CopyMessages(ctx, messages, destFolder.ID, crossDomain)
	if err != nil {
		c.logger.Error("Failed to copy messages", zap.Error(err))
		c.sendTagged(tag, "NO COPY failed")
		return nil
	}

	// Update destination folder counts
	if err := c.repo.UpdateFolderCounts(ctx, destFolder.ID); err != nil {
		c.logger.Warn("Failed to update folder counts", zap.Error(err))
	}

	// Build COPYUID response
	var srcUIDs, destUIDs string
	for srcUID, destUID := range uidMap {
		if srcUIDs != "" {
			srcUIDs += ","
			destUIDs += ","
		}
		srcUIDs += fmt.Sprintf("%d", srcUID)
		destUIDs += fmt.Sprintf("%d", destUID)
	}

	c.logger.Info("Messages copied",
		zap.Int("count", len(messages)),
		zap.String("dest_folder", destPath),
		zap.Bool("cross_domain", crossDomain),
	)

	// Notify destination mailbox
	c.notifyHub.Notify(destMailbox.ID, &IdleNotification{
		Type:      "EXISTS",
		MailboxID: destMailbox.ID,
		FolderID:  destFolder.ID,
		Data: map[string]interface{}{
			"count": len(messages),
		},
	})

	command := "COPY"
	if uid {
		command = "UID COPY"
	}
	c.sendTagged(tag, "OK [COPYUID %d %s %s] %s completed",
		destFolder.UIDValidity, srcUIDs, destUIDs, command)
	return nil
}

// handleMove handles the MOVE command (RFC 6851)
func (c *Connection) handleMove(tag, args string, uid bool) error {
	if !c.requireSelected(tag) {
		return nil
	}

	if c.ctx.ReadOnly {
		c.sendTagged(tag, "NO Mailbox is read-only")
		return nil
	}

	// Parse sequence set and destination
	parts := parseQuotedStrings(args)
	if len(parts) < 2 {
		c.sendTagged(tag, "BAD MOVE requires sequence set and destination")
		return nil
	}

	seqSet := parts[0]
	destName := parts[1]

	// Parse destination mailbox
	destMailbox, destPath, err := c.parseMailboxPath(destName)
	if err != nil {
		c.sendTagged(tag, "NO [TRYCREATE] %s", err.Error())
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	// Get destination folder
	destFolder, err := c.repo.GetFolderByPath(ctx, destMailbox.ID, destPath)
	if err != nil {
		c.sendTagged(tag, "NO [TRYCREATE] Destination mailbox does not exist")
		return nil
	}

	// Check if this is a cross-domain move
	crossDomain := c.ctx.ActiveMailbox.ID != destMailbox.ID

	// Check permissions for cross-domain move
	if crossDomain {
		hasAccess := false
		for _, mb := range c.ctx.Mailboxes {
			if mb.ID == destMailbox.ID {
				hasAccess = true
				break
			}
		}
		if !hasAccess {
			for _, shared := range c.ctx.SharedMailboxes {
				if shared.MailboxID == destMailbox.ID {
					for _, perm := range shared.Permissions {
						if perm == PermissionInsert || perm == PermissionAll {
							hasAccess = true
							break
						}
					}
					break
				}
			}
		}
		if !hasAccess {
			c.sendTagged(tag, "NO Permission denied")
			return nil
		}
	}

	// Get messages to move
	messages, err := c.repo.GetMessages(ctx, c.ctx.ActiveFolder.ID, seqSet, uid)
	if err != nil {
		c.logger.Error("Failed to get messages for MOVE", zap.Error(err))
		c.sendTagged(tag, "NO MOVE failed")
		return nil
	}

	if len(messages) == 0 {
		c.sendTagged(tag, "OK MOVE completed (no messages)")
		return nil
	}

	// Move messages
	uidMap, err := c.repo.MoveMessages(ctx, messages, destFolder.ID, crossDomain)
	if err != nil {
		c.logger.Error("Failed to move messages", zap.Error(err))
		c.sendTagged(tag, "NO MOVE failed")
		return nil
	}

	// Update folder counts
	if err := c.repo.UpdateFolderCounts(ctx, c.ctx.ActiveFolder.ID); err != nil {
		c.logger.Warn("Failed to update source folder counts", zap.Error(err))
	}
	if err := c.repo.UpdateFolderCounts(ctx, destFolder.ID); err != nil {
		c.logger.Warn("Failed to update dest folder counts", zap.Error(err))
	}

	// Send EXPUNGE for moved messages
	var srcUIDs, destUIDs string
	var expungeSeqs []uint32
	var expungeUIDs []uint32

	for srcUID, destUID := range uidMap {
		if srcUIDs != "" {
			srcUIDs += ","
			destUIDs += ","
		}
		srcUIDs += fmt.Sprintf("%d", srcUID)
		destUIDs += fmt.Sprintf("%d", destUID)

		// Find sequence number
		for _, msg := range messages {
			if msg.UID == srcUID {
				expungeSeqs = append(expungeSeqs, msg.SequenceNumber)
				expungeUIDs = append(expungeUIDs, msg.UID)
				break
			}
		}
	}

	// For QRESYNC, send VANISHED response with UIDs
	if c.ctx.QRESYNCEnabled && len(expungeUIDs) > 0 {
		uidList := formatUIDSet(expungeUIDs)
		c.sendUntagged("VANISHED %s", uidList)
	} else {
		// Send EXPUNGE in reverse order (traditional)
		for i := len(expungeSeqs) - 1; i >= 0; i-- {
			c.sendUntagged("%d EXPUNGE", expungeSeqs[i])
		}
	}

	c.logger.Info("Messages moved",
		zap.Int("count", len(messages)),
		zap.String("dest_folder", destPath),
		zap.Bool("cross_domain", crossDomain),
	)

	// Notify both mailboxes
	c.notifyHub.Notify(c.ctx.ActiveMailbox.ID, &IdleNotification{
		Type:      "EXPUNGE",
		MailboxID: c.ctx.ActiveMailbox.ID,
		FolderID:  c.ctx.ActiveFolder.ID,
		Data: map[string]interface{}{
			"count": len(messages),
		},
	})

	c.notifyHub.Notify(destMailbox.ID, &IdleNotification{
		Type:      "EXISTS",
		MailboxID: destMailbox.ID,
		FolderID:  destFolder.ID,
		Data: map[string]interface{}{
			"count": len(messages),
		},
	})

	command := "MOVE"
	if uid {
		command = "UID MOVE"
	}
	c.sendTagged(tag, "OK [COPYUID %d %s %s] %s completed",
		destFolder.UIDValidity, srcUIDs, destUIDs, command)
	return nil
}
