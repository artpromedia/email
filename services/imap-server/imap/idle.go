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
	channels := make(map[string]<-chan *IdleNotification)

	for _, mb := range c.ctx.Mailboxes {
		channels[mb.ID] = c.notifyHub.Subscribe(mb.ID, c.id)
	}
	for _, shared := range c.ctx.SharedMailboxes {
		channels[shared.MailboxID] = c.notifyHub.Subscribe(shared.MailboxID, c.id)
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
			if notification != nil {
				c.sendIdleNotification(notification)
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

		case <-c.server.stopChan:
			// Server shutting down
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
		if count, ok := notification.Data["count"].(int); ok {
			c.sendUntagged("%d EXISTS", c.ctx.ActiveFolder.MessageCount+uint32(count))
		}

	case "RECENT":
		if count, ok := notification.Data["count"].(int); ok {
			c.sendUntagged("%d RECENT", count)
		}

	case "EXPUNGE":
		if seqNum, ok := notification.Data["sequence"].(uint32); ok {
			c.sendUntagged("%d EXPUNGE", seqNum)
		}

	case "FLAGS":
		if seqNum, ok := notification.Data["sequence"].(uint32); ok {
			if flags, ok := notification.Data["flags"].([]string); ok {
				flagStr := ""
				for i, f := range flags {
					if i > 0 {
						flagStr += " "
					}
					flagStr += f
				}
				c.sendUntagged("%d FETCH (FLAGS (%s))", seqNum, flagStr)
			}
		}

	case "STATUS":
		// Status update for non-selected mailbox
		if mailboxName, ok := notification.Data["mailbox"].(string); ok {
			if messages, ok := notification.Data["messages"].(uint32); ok {
				c.sendUntagged("STATUS %s (MESSAGES %d)", mailboxName, messages)
			}
		}
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

// NotifyHub methods for multi-domain notification support

// NotifyAllMailboxes sends notification to all mailboxes owned by a user
func (h *NotifyHub) NotifyAllMailboxes(mailboxIDs []string, notification *IdleNotification) {
	for _, id := range mailboxIDs {
		h.Notify(id, notification)
	}
}

// SubscribeMultiple subscribes to notifications from multiple mailboxes
func (h *NotifyHub) SubscribeMultiple(mailboxIDs []string, connID string) map[string]<-chan *IdleNotification {
	h.mu.Lock()
	defer h.mu.Unlock()

	channels := make(map[string]<-chan *IdleNotification)

	for _, id := range mailboxIDs {
		if _, exists := h.subscribers[id]; !exists {
			h.subscribers[id] = make(map[string]chan *IdleNotification)
		}

		ch := make(chan *IdleNotification, 100)
		h.subscribers[id][connID] = ch
		channels[id] = ch
	}

	return channels
}

// UnsubscribeMultiple removes subscription from multiple mailboxes
func (h *NotifyHub) UnsubscribeMultiple(mailboxIDs []string, connID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for _, id := range mailboxIDs {
		if subs, exists := h.subscribers[id]; exists {
			if ch, ok := subs[connID]; ok {
				close(ch)
				delete(subs, connID)
			}
		}
	}
}

// GetSubscribedMailboxes returns all mailbox IDs a connection is subscribed to
func (h *NotifyHub) GetSubscribedMailboxes(connID string) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var mailboxIDs []string
	for mailboxID, subs := range h.subscribers {
		if _, ok := subs[connID]; ok {
			mailboxIDs = append(mailboxIDs, mailboxID)
		}
	}

	return mailboxIDs
}
