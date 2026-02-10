package imap

import (
	"fmt"

	"go.uber.org/zap"
)

// handleCopy handles the COPY and MOVE commands
func (c *Connection) handleCopy(tag, args string, uid bool, isMove bool) error {
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
			// Check shared mailbox access - shared mailboxes are pre-filtered with permissions
			for _, shared := range c.ctx.SharedMailboxes {
				if shared.ID == destMailbox.ID {
					hasAccess = true
					break
				}
			}
		}
		if !hasAccess {
			c.sendTagged(tag, "NO Permission denied")
			return nil
		}
	}

	// Parse the sequence set to get UIDs
	var uidSet []uint32
	if uid {
		// seqSet contains UIDs directly
		uidSet = parseSequenceSet(seqSet, 0xFFFFFFFF)
	} else {
		// seqSet contains sequence numbers - convert to UIDs
		// For now, get all messages and filter by sequence number
		messages, err := c.repo.GetMessages(ctx, c.ctx.ActiveFolder.ID, 0, 10000)
		if err != nil {
			c.logger.Error("Failed to get messages for COPY", zap.Error(err))
			c.sendTagged(tag, "NO COPY failed")
			return nil
		}
		seqNumbers := parseSequenceSet(seqSet, uint32(len(messages)))
		seqMap := make(map[uint32]bool)
		for _, seq := range seqNumbers {
			seqMap[seq] = true
		}
		for _, msg := range messages {
			if seqMap[msg.SequenceNum] {
				uidSet = append(uidSet, msg.UID)
			}
		}
	}

	if len(uidSet) == 0 {
		c.sendTagged(tag, "OK COPY completed (no messages)")
		return nil
	}

	// Copy messages
	uidMap, err := c.repo.CopyMessages(ctx, c.ctx.ActiveFolder.ID, destFolder.ID, uidSet)
	if err != nil {
		c.logger.Error("Failed to copy messages", zap.Error(err))
		c.sendTagged(tag, "NO COPY failed")
		return nil
	}

	// If this is a MOVE, delete from source
	if isMove {
		_, err = c.repo.MoveMessages(ctx, c.ctx.ActiveFolder.ID, destFolder.ID, uidSet)
		if err != nil {
			c.logger.Warn("Move operation partially failed", zap.Error(err))
		}
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
		zap.Int("count", len(uidSet)),
		zap.String("dest_folder", destPath),
		zap.Bool("cross_domain", crossDomain),
		zap.Bool("is_move", isMove),
	)

	// Notify destination mailbox
	c.notifyHub.Notify(destMailbox.ID, IdleNotification{
		Type:       "EXISTS",
		MailboxID:  destMailbox.ID,
		FolderPath: destFolder.FullPath,
	})

	command := "COPY"
	if uid {
		command = "UID COPY"
	}
	if isMove {
		command = "MOVE"
		if uid {
			command = "UID MOVE"
		}
	}
	c.sendTagged(tag, "OK [COPYUID %d %s %s] %s completed",
		destFolder.UIDValidity, srcUIDs, destUIDs, command)
	return nil
}
