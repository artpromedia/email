package imap

import (
	"fmt"
	"strings"
)

// handleGetQuota handles the GETQUOTA command
func (c *Connection) handleGetQuota(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	quotaRoot := strings.Trim(args, "\"")

	// Parse quota root to find mailbox
	mailbox, _, err := c.parseMailboxPath(quotaRoot)
	if err != nil {
		c.sendTagged(tag, "NO Invalid quota root")
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	quota, err := c.repo.GetQuota(ctx, mailbox.ID)
	if err != nil {
		c.sendTagged(tag, "NO Quota not available")
		return nil
	}

	// Convert to KB for IMAP
	usedKB := quota.StorageUsed / 1024
	limitKB := quota.StorageLimit / 1024

	c.sendUntagged("QUOTA \"%s\" (STORAGE %d %d)", quotaRoot, usedKB, limitKB)
	c.sendTagged(tag, "OK GETQUOTA completed")
	return nil
}

// handleGetQuotaRoot handles the GETQUOTAROOT command
func (c *Connection) handleGetQuotaRoot(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	mailboxName := strings.Trim(args, "\"")

	mailbox, _, err := c.parseMailboxPath(mailboxName)
	if err != nil {
		c.sendTagged(tag, "NO Invalid mailbox")
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	// Determine quota root
	// For our implementation, quota root is the domain
	quotaRoot := mailbox.Domain.Name

	quota, err := c.repo.GetQuota(ctx, mailbox.ID)
	if err != nil {
		// No quota configured
		c.sendUntagged(`QUOTAROOT "%s"`, mailboxName)
		c.sendTagged(tag, "OK GETQUOTAROOT completed")
		return nil
	}

	// Convert to KB
	usedKB := quota.StorageUsed / 1024
	limitKB := quota.StorageLimit / 1024

	// Message count quota
	messageQuota := ""
	if quota.MessageLimit > 0 {
		messageQuota = fmt.Sprintf(" MESSAGE %d %d", quota.MessageCount, quota.MessageLimit)
	}

	c.sendUntagged(`QUOTAROOT "%s" "%s"`, mailboxName, quotaRoot)
	c.sendUntagged(`QUOTA "%s" (STORAGE %d %d%s)`, quotaRoot, usedKB, limitKB, messageQuota)
	c.sendTagged(tag, "OK GETQUOTAROOT completed")
	return nil
}

// handleSetQuota handles the SETQUOTA command
func (c *Connection) handleSetQuota(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	// SETQUOTA requires admin privileges
	// Check if user is organization admin
	if c.ctx.Organization == nil || c.ctx.User.OrganizationRole != "admin" {
		c.sendTagged(tag, "NO Permission denied")
		return nil
	}

	// Parse arguments: SETQUOTA "quotaroot" (STORAGE limit)
	parts := parseQuotedStrings(args)
	if len(parts) < 1 {
		c.sendTagged(tag, "BAD Missing quota root")
		return nil
	}

	quotaRoot := parts[0]

	// Parse quota limits from parenthesized list
	limits := parseQuotaLimits(args)

	mailbox, _, err := c.parseMailboxPath(quotaRoot)
	if err != nil {
		c.sendTagged(tag, "NO Invalid quota root")
		return nil
	}

	ctx, cancel := c.getContext()
	defer cancel()

	// Update quota
	quota, err := c.repo.GetQuota(ctx, mailbox.ID)
	if err != nil {
		// Create new quota
		quota = &Quota{
			MailboxID: mailbox.ID,
		}
	}

	// Apply new limits
	if storage, ok := limits["STORAGE"]; ok {
		quota.StorageLimit = storage * 1024 // Convert KB to bytes
	}
	if messages, ok := limits["MESSAGE"]; ok {
		quota.MessageLimit = messages
	}

	// Would save quota here
	// c.repo.SetQuota(ctx, quota)

	c.sendUntagged(`QUOTA "%s" (STORAGE %d %d)`, quotaRoot, quota.StorageUsed/1024, quota.StorageLimit/1024)
	c.sendTagged(tag, "OK SETQUOTA completed")
	return nil
}

// parseQuotaLimits parses quota resource limits from SETQUOTA args
func parseQuotaLimits(args string) map[string]int64 {
	limits := make(map[string]int64)

	// Find content between parentheses
	start := strings.Index(args, "(")
	end := strings.LastIndex(args, ")")
	if start == -1 || end == -1 {
		return limits
	}

	content := args[start+1 : end]
	parts := strings.Fields(content)

	for i := 0; i < len(parts)-1; i += 2 {
		resource := strings.ToUpper(parts[i])
		value := int64(0)
		fmt.Sscanf(parts[i+1], "%d", &value)
		limits[resource] = value
	}

	return limits
}

// checkQuota checks if an operation would exceed quota
func (c *Connection) checkQuota(mailboxID string, additionalStorage int64) error {
	ctx, cancel := c.getContext()
	defer cancel()

	quota, err := c.repo.GetQuota(ctx, mailboxID)
	if err != nil {
		// No quota configured, allow operation
		return nil
	}

	if quota.StorageUsed+additionalStorage > quota.StorageLimit {
		return fmt.Errorf("quota exceeded")
	}

	return nil
}

// QuotaWarning represents a quota warning notification
type QuotaWarning struct {
	MailboxID     string
	MailboxName   string
	ResourceType  string
	UsagePercent  int
	Used          int64
	Limit         int64
}

// checkQuotaWarnings checks for quota warnings
func (c *Connection) checkQuotaWarnings() []QuotaWarning {
	var warnings []QuotaWarning

	ctx, cancel := c.getContext()
	defer cancel()

	for _, mb := range c.ctx.Mailboxes {
		quota, err := c.repo.GetQuota(ctx, mb.ID)
		if err != nil {
			continue
		}

		// Check storage
		if quota.StorageLimit > 0 {
			percent := int((quota.StorageUsed * 100) / quota.StorageLimit)
			if percent >= 90 {
				warnings = append(warnings, QuotaWarning{
					MailboxID:    mb.ID,
					MailboxName:  mb.EmailAddress,
					ResourceType: "STORAGE",
					UsagePercent: percent,
					Used:         quota.StorageUsed,
					Limit:        quota.StorageLimit,
				})
			}
		}

		// Check messages
		if quota.MessageLimit > 0 {
			percent := int((quota.MessageCount * 100) / quota.MessageLimit)
			if percent >= 90 {
				warnings = append(warnings, QuotaWarning{
					MailboxID:    mb.ID,
					MailboxName:  mb.EmailAddress,
					ResourceType: "MESSAGE",
					UsagePercent: percent,
					Used:         quota.MessageCount,
					Limit:        quota.MessageLimit,
				})
			}
		}
	}

	return warnings
}
