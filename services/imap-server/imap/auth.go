package imap

import (
	"strings"

	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

// handleCapability handles the CAPABILITY command
func (c *Connection) handleCapability(tag string) error {
	c.sendUntagged("CAPABILITY %s", strings.Join(c.ctx.Capabilities, " "))
	c.sendTagged(tag, "OK CAPABILITY completed")
	return nil
}

// handleNoop handles the NOOP command
func (c *Connection) handleNoop(tag string) error {
	// If a mailbox is selected, report any changes
	if c.ctx.ActiveFolder != nil {
		c.sendPendingUpdates()
	}
	c.sendTagged(tag, "OK NOOP completed")
	return nil
}

// handleLogout handles the LOGOUT command
func (c *Connection) handleLogout(tag string) error {
	c.sendUntagged("BYE Logging out")
	c.sendTagged(tag, "OK LOGOUT completed")
	return errConnectionClosed
}

// handleStartTLS handles the STARTTLS command
func (c *Connection) handleStartTLS(tag string) error {
	if c.ctx.TLSEnabled {
		c.sendTagged(tag, "BAD TLS already active")
		return nil
	}

	if !c.config.TLS.Enabled {
		c.sendTagged(tag, "BAD STARTTLS not available")
		return nil
	}

	c.sendTagged(tag, "OK Begin TLS negotiation now")

	if err := c.upgradeTLS(); err != nil {
		c.logger.Error("TLS upgrade failed", zap.Error(err))
		return errConnectionClosed
	}

	c.logger.Info("TLS upgrade successful")
	return nil
}

// handleLogin handles the LOGIN command
func (c *Connection) handleLogin(tag, args string) error {
	// Check if TLS is required
	if c.config.Auth.RequireEncryption && !c.ctx.TLSEnabled {
		c.sendTagged(tag, "NO [PRIVACYREQUIRED] Encryption required for authentication")
		authAttempts.WithLabelValues("LOGIN", "encryption_required").Inc()
		return nil
	}

	// Parse username and password
	parts := parseQuotedStrings(args)
	if len(parts) < 2 {
		c.sendTagged(tag, "BAD LOGIN requires username and password")
		return nil
	}

	username := parts[0]
	password := parts[1]

	return c.authenticate(tag, username, password, "LOGIN")
}

// handleAuthenticate handles the AUTHENTICATE command
func (c *Connection) handleAuthenticate(tag, args string) error {
	parts := strings.SplitN(args, " ", 2)
	mechanism := strings.ToUpper(parts[0])

	switch mechanism {
	case "PLAIN":
		return c.authenticatePlain(tag, parts)
	case "LOGIN":
		return c.authenticateLogin(tag)
	case "XOAUTH2":
		return c.handleAuthenticateXOAuth2(tag, parts)
	case "OAUTHBEARER":
		return c.handleAuthenticateOAuthBearer(tag, parts)
	default:
		c.sendTagged(tag, "NO [CANNOT] Unsupported authentication mechanism")
		return nil
	}
}

// authenticatePlain handles PLAIN authentication
func (c *Connection) authenticatePlain(tag string, parts []string) error {
	var credentials string

	if len(parts) > 1 && parts[1] != "" {
		// Credentials provided inline
		credentials = parts[1]
	} else {
		// Send continuation and wait for credentials
		c.sendContinuation("")
		line, err := c.reader.ReadString('\n')
		if err != nil {
			return err
		}
		credentials = strings.TrimRight(line, "\r\n")
	}

	// Decode base64 credentials
	decoded, err := decodeBase64(credentials)
	if err != nil {
		c.sendTagged(tag, "BAD Invalid base64 encoding")
		return nil
	}

	// PLAIN format: authzid\0authcid\0password
	authParts := strings.Split(string(decoded), "\x00")
	if len(authParts) != 3 {
		c.sendTagged(tag, "BAD Invalid PLAIN authentication data")
		return nil
	}

	username := authParts[1]
	password := authParts[2]

	return c.authenticate(tag, username, password, "PLAIN")
}

// authenticateLogin handles LOGIN authentication
func (c *Connection) authenticateLogin(tag string) error {
	// Request username
	c.sendContinuation("VXNlcm5hbWU6") // "Username:" in base64
	line, err := c.reader.ReadString('\n')
	if err != nil {
		return err
	}
	username, err := decodeBase64(strings.TrimRight(line, "\r\n"))
	if err != nil {
		c.sendTagged(tag, "BAD Invalid base64 encoding")
		return nil
	}

	// Request password
	c.sendContinuation("UGFzc3dvcmQ6") // "Password:" in base64
	line, err = c.reader.ReadString('\n')
	if err != nil {
		return err
	}
	password, err := decodeBase64(strings.TrimRight(line, "\r\n"))
	if err != nil {
		c.sendTagged(tag, "BAD Invalid base64 encoding")
		return nil
	}

	return c.authenticate(tag, string(username), string(password), "LOGIN")
}

// authenticate performs the actual authentication
func (c *Connection) authenticate(tag, username, password, method string) error {
	ctx, cancel := c.getContext()
	defer cancel()

	// Look up user by email (any of their addresses)
	user, err := c.repo.GetUserByEmail(ctx, username)
	if err != nil {
		c.logger.Warn("Authentication failed - user not found",
			zap.String("username", username),
			zap.Error(err),
		)
		c.sendTagged(tag, "NO [AUTHENTICATIONFAILED] Invalid credentials")
		authAttempts.WithLabelValues(method, "user_not_found").Inc()
		return nil
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		c.logger.Warn("Authentication failed - invalid password",
			zap.String("username", username),
		)
		c.sendTagged(tag, "NO [AUTHENTICATIONFAILED] Invalid credentials")
		authAttempts.WithLabelValues(method, "invalid_password").Inc()
		return nil
	}

	// Get organization
	org, err := c.repo.GetOrganization(ctx, user.OrganizationID)
	if err != nil {
		c.logger.Error("Failed to get organization", zap.Error(err))
		c.sendTagged(tag, "NO [UNAVAILABLE] Internal error")
		return nil
	}

	// Get user's mailboxes
	mailboxes, err := c.repo.GetUserMailboxes(ctx, user.ID)
	if err != nil {
		c.logger.Error("Failed to get mailboxes", zap.Error(err))
		c.sendTagged(tag, "NO [UNAVAILABLE] Internal error")
		return nil
	}

	// Get shared mailboxes
	sharedMailboxes, err := c.repo.GetSharedMailboxes(ctx, user.ID)
	if err != nil {
		c.logger.Warn("Failed to get shared mailboxes", zap.Error(err))
		// Non-fatal, continue without shared mailboxes
	}

	// Update context
	c.ctx.User = user
	c.ctx.Organization = org
	c.ctx.Mailboxes = mailboxes
	c.ctx.SharedMailboxes = sharedMailboxes
	c.ctx.Authenticated = true
	c.ctx.ID = c.id

	// Set default namespace mode based on user preference or number of mailboxes
	if len(mailboxes) > 1 {
		// If user has multiple mailboxes, default to domain-separated
		for _, mb := range mailboxes {
			if mb.NamespaceMode != "" {
				c.ctx.NamespaceMode = mb.NamespaceMode
				break
			}
		}
	}

	// Update last login
	c.repo.UpdateLastLogin(ctx, user.ID)

	c.logger.Info("User authenticated",
		zap.String("user_id", user.ID),
		zap.String("email", username),
		zap.Int("mailbox_count", len(mailboxes)),
		zap.Int("shared_mailbox_count", len(sharedMailboxes)),
	)

	authAttempts.WithLabelValues(method, "success").Inc()
	c.sendTagged(tag, "OK [CAPABILITY %s] Logged in", strings.Join(c.ctx.Capabilities, " "))
	return nil
}

// handleID handles the ID command
func (c *Connection) handleID(tag, args string) error {
	// Parse client ID (optional)
	// We just acknowledge and return our server ID
	c.sendUntagged(`ID ("name" "OONRUMAIL IMAP" "version" "1.0")`)
	c.sendTagged(tag, "OK ID completed")
	return nil
}

// handleEnable handles the ENABLE command
func (c *Connection) handleEnable(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	extensions := strings.Fields(strings.ToUpper(args))
	enabled := []string{}

	for _, ext := range extensions {
		switch ext {
		case "QRESYNC":
			if c.config.IMAP.EnableQRESYNC {
				enabled = append(enabled, "QRESYNC")
				c.ctx.QRESYNCEnabled = true
				// QRESYNC implies CONDSTORE
				if !c.ctx.CONDSTOREEnabled {
					c.ctx.CONDSTOREEnabled = true
				}
			}
		case "CONDSTORE":
			if c.config.IMAP.EnableCONDSTORE {
				enabled = append(enabled, "CONDSTORE")
				c.ctx.CONDSTOREEnabled = true
			}
		}
	}

	if len(enabled) > 0 {
		c.sendUntagged("ENABLED %s", strings.Join(enabled, " "))
	}
	c.sendTagged(tag, "OK ENABLE completed")
	return nil
}

// sendPendingUpdates sends any pending updates for the selected mailbox
func (c *Connection) sendPendingUpdates() {
	if c.ctx.ActiveFolder == nil {
		return
	}

	ctx, cancel := c.getContext()
	defer cancel()

	// Refresh folder stats from database
	folder, err := c.repo.GetFolderByPath(ctx, c.ctx.ActiveMailbox.ID, c.ctx.ActiveFolder.FullPath)
	if err != nil {
		return
	}

	// Check for EXISTS changes
	if folder.MessageCount != c.ctx.ActiveFolder.MessageCount {
		c.sendUntagged("%d EXISTS", folder.MessageCount)
		c.ctx.ActiveFolder.MessageCount = folder.MessageCount
	}

	// Check for RECENT changes
	if folder.RecentCount != c.ctx.ActiveFolder.RecentCount {
		c.sendUntagged("%d RECENT", folder.RecentCount)
		c.ctx.ActiveFolder.RecentCount = folder.RecentCount
	}
}
