package imap

import (
	"time"

	"go.uber.org/zap"
)

// handleIdle handles the IDLE command (RFC 2177)
func (c *Connection) handleIdle(tag string) error {
	if !c.requireSelected(tag) {
		return nil
	}

	// Send continuation
	c.sendContinuation("idling")

	c.logger.Info("Entering IDLE mode",
		zap.String("mailbox_id", c.ctx.ActiveMailbox.ID),
	)

	// Subscribe to notifications for all user's mailboxes
	// In addition to the active mailbox, we want notifications for all mailboxes
	channels := make(map[string]<-chan IdleNotification)

	for _, mb := range c.ctx.Mailboxes {
		channels[mb.ID] = c.notifyHub.Subscribe(mb.ID, c.id)
	}
	for _, shared := range c.ctx.SharedMailboxes {
		channels[shared.ID] = c.notifyHub.Subscribe(shared.ID, c.id)
	}

	// Set up timeout
	timeout := time.NewTimer(29 * time.Minute) // RFC recommends renewing before 30 min
	defer timeout.Stop()

	// IDLE loop
	done := make(chan struct{})
	go c.waitForDone(done)

	for {
		select {
		case notification := <-c.idleChan:
			// Notification for active mailbox
			if notification.Type != "" {
				c.sendIdleNotification(&notification)
			}

		case <-timeout.C:
			// Send BYE due to timeout
			c.logger.Info("IDLE timeout")
			c.sendUntagged("BYE IDLE timeout")
			return nil

		case <-done:
			// Client sent DONE
			c.logger.Info("IDLE terminated by client")
			c.sendTagged(tag, "OK IDLE terminated")
			return nil
		}
	}
}

// waitForDone waits for DONE command from client
func (c *Connection) waitForDone(done chan<- struct{}) {
	for {
		line, err := c.reader.ReadString('\n')
		if err != nil {
			close(done)
			return
		}

		if line == "DONE\r\n" || line == "DONE\n" || line == "done\r\n" || line == "done\n" {
			close(done)
			return
		}
	}
}

// sendIdleNotification sends a notification during IDLE
func (c *Connection) sendIdleNotification(notification *IdleNotification) {
	switch notification.Type {
	case "EXISTS":
		// EXISTS notification - send new message count
		c.sendUntagged("%d EXISTS", c.ctx.ActiveFolder.MessageCount+1)

	case "RECENT":
		c.sendUntagged("%d RECENT", 1)

	case "EXPUNGE":
		if notification.SeqNum > 0 {
			c.sendUntagged("%d EXPUNGE", notification.SeqNum)
		}

	case "FLAGS":
		if notification.SeqNum > 0 && len(notification.Flags) > 0 {
			flagStr := ""
			for i, f := range notification.Flags {
				if i > 0 {
					flagStr += " "
				}
				flagStr += string(f)
			}
			c.sendUntagged("%d FETCH (FLAGS (%s))", notification.SeqNum, flagStr)
		}

	case "STATUS":
		// Status update for non-selected mailbox
		c.sendUntagged("STATUS %s (MESSAGES %d)", notification.FolderPath, c.ctx.ActiveFolder.MessageCount)
	}
}

// handleNotify handles the NOTIFY command (RFC 5465)
func (c *Connection) handleNotify(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	// Parse NOTIFY arguments
	// NOTIFY SET (mailboxes (INBOXES) (messageNew messageExpunge flagChange))
	// This is a simplified implementation

	if args == "NONE" {
		// Disable all notifications
		c.notifyHub.UnsubscribeAll(c.id)
		c.sendTagged(tag, "OK NOTIFY disabled")
		return nil
	}

	// Parse event types and mailbox filters
	// Production would need full RFC 5465 parsing

	c.sendTagged(tag, "OK NOTIFY enabled")
	return nil
}
