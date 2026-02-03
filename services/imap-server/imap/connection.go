package imap

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"

	"imap-server/config"
	"imap-server/repository"
)

// Connection represents an IMAP client connection
type Connection struct {
	id              string
	conn            net.Conn
	server          *Server
	config          *config.Config
	repo            *repository.Repository
	logger          *zap.Logger
	notifyHub       *NotifyHub
	oauth2Validator *OAuth2Validator
	ctx             *ConnectionContext
	reader          *bufio.Reader
	writer          *bufio.Writer
	writeMu         sync.Mutex
	shutdownChan    chan struct{}
	idleChan        chan IdleNotification
	idleStopChan    chan struct{}
}

// Handle handles the IMAP connection
func (c *Connection) Handle() {
	defer c.Close()

	c.reader = bufio.NewReader(c.conn)
	c.writer = bufio.NewWriter(c.conn)

	// Send greeting
	c.sendUntagged("OK [CAPABILITY %s] Enterprise Email IMAP Server ready", strings.Join(c.ctx.Capabilities, " "))

	// Main command loop
	for {
		select {
		case <-c.shutdownChan:
			c.sendUntagged("BYE Server shutting down")
			return
		default:
		}

		// Set read deadline
		c.conn.SetReadDeadline(time.Now().Add(c.config.Server.ReadTimeout))

		// Read command line
		line, err := c.reader.ReadString('\n')
		if err != nil {
			if err == io.EOF || isTimeout(err) {
				c.logger.Debug("Connection closed", zap.String("reason", err.Error()))
			} else {
				c.logger.Error("Read error", zap.Error(err))
			}
			return
		}

		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			continue
		}

		c.ctx.LastActivityAt = time.Now()
		c.logger.Debug("Received command", zap.String("line", line))

		// Parse and execute command
		if err := c.processCommand(line); err != nil {
			if err == errConnectionClosed {
				return
			}
			c.logger.Error("Command error", zap.Error(err))
		}
	}
}

// Close closes the connection
func (c *Connection) Close() {
	// Unsubscribe from notifications
	if c.notifyHub != nil {
		c.notifyHub.UnsubscribeAll(c.id)
	}

	// Close idle channel if active
	if c.idleStopChan != nil {
		close(c.idleStopChan)
	}

	c.conn.Close()
}

// processCommand parses and executes an IMAP command
func (c *Connection) processCommand(line string) error {
	// Parse tag and command
	parts := strings.SplitN(line, " ", 3)
	if len(parts) < 2 {
		c.sendUntagged("BAD Invalid command")
		return nil
	}

	tag := parts[0]
	command := strings.ToUpper(parts[1])
	args := ""
	if len(parts) > 2 {
		args = parts[2]
	}

	commandsProcessed.WithLabelValues(command).Inc()

	// Handle command
	switch command {
	case "CAPABILITY":
		return c.handleCapability(tag)
	case "NOOP":
		return c.handleNoop(tag)
	case "LOGOUT":
		return c.handleLogout(tag)
	case "STARTTLS":
		return c.handleStartTLS(tag)
	case "LOGIN":
		return c.handleLogin(tag, args)
	case "AUTHENTICATE":
		return c.handleAuthenticate(tag, args)
	case "NAMESPACE":
		return c.handleNamespace(tag)
	case "LIST":
		return c.handleList(tag, args)
	case "LSUB":
		return c.handleLsub(tag, args)
	case "SELECT":
		return c.handleSelect(tag, args, false)
	case "EXAMINE":
		return c.handleSelect(tag, args, true)
	case "CREATE":
		return c.handleCreate(tag, args)
	case "DELETE":
		return c.handleDelete(tag, args)
	case "RENAME":
		return c.handleRename(tag, args)
	case "SUBSCRIBE":
		return c.handleSubscribe(tag, args, true)
	case "UNSUBSCRIBE":
		return c.handleSubscribe(tag, args, false)
	case "STATUS":
		return c.handleStatus(tag, args)
	case "APPEND":
		return c.handleAppend(tag, args)
	case "CHECK":
		return c.handleCheck(tag)
	case "CLOSE":
		return c.handleClose(tag)
	case "UNSELECT":
		return c.handleUnselect(tag)
	case "EXPUNGE":
		return c.handleExpunge(tag)
	case "SEARCH", "UID SEARCH":
		return c.handleSearch(tag, args, strings.HasPrefix(command, "UID"))
	case "FETCH", "UID FETCH":
		return c.handleFetch(tag, args, strings.HasPrefix(command, "UID"))
	case "STORE", "UID STORE":
		return c.handleStore(tag, args, strings.HasPrefix(command, "UID"))
	case "COPY", "UID COPY":
		return c.handleCopy(tag, args, strings.HasPrefix(command, "UID"), false)
	case "MOVE", "UID MOVE":
		return c.handleCopy(tag, args, strings.HasPrefix(command, "UID"), true)
	case "IDLE":
		return c.handleIdle(tag)
	case "GETQUOTA":
		return c.handleGetQuota(tag, args)
	case "GETQUOTAROOT":
		return c.handleGetQuotaRoot(tag, args)
	case "SETQUOTA":
		return c.handleSetQuota(tag, args)
	case "ID":
		return c.handleID(tag, args)
	case "ENABLE":
		return c.handleEnable(tag, args)
	case "THREAD":
		return c.handleThread(tag, args, false)
	default:
		// Check for UID prefix
		if command == "UID" && len(args) > 0 {
			uidParts := strings.SplitN(args, " ", 2)
			if len(uidParts) >= 1 {
				uidCmd := strings.ToUpper(uidParts[0])
				uidArgs := ""
				if len(uidParts) > 1 {
					uidArgs = uidParts[1]
				}
				switch uidCmd {
				case "FETCH":
					return c.handleFetch(tag, uidArgs, true)
				case "STORE":
					return c.handleStore(tag, uidArgs, true)
				case "COPY":
					return c.handleCopy(tag, uidArgs, true, false)
				case "MOVE":
					return c.handleCopy(tag, uidArgs, true, true)
				case "SEARCH":
					return c.handleSearch(tag, uidArgs, true)
				case "EXPUNGE":
					return c.handleUIDExpunge(tag, uidArgs)
				case "THREAD":
					return c.handleThread(tag, uidArgs, true)
				}
			}
		}
		c.sendTagged(tag, "BAD Unknown command: %s", command)
	}

	return nil
}

// sendUntagged sends an untagged response
func (c *Connection) sendUntagged(format string, args ...interface{}) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	response := fmt.Sprintf("* "+format+"\r\n", args...)
	c.writer.WriteString(response)
	c.writer.Flush()
	c.logger.Debug("Sent response", zap.String("response", strings.TrimRight(response, "\r\n")))
}

// sendTagged sends a tagged response
func (c *Connection) sendTagged(tag, format string, args ...interface{}) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	response := fmt.Sprintf(tag+" "+format+"\r\n", args...)
	c.writer.WriteString(response)
	c.writer.Flush()
	c.logger.Debug("Sent response", zap.String("response", strings.TrimRight(response, "\r\n")))
}

// sendContinuation sends a continuation request
func (c *Connection) sendContinuation(format string, args ...interface{}) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	response := fmt.Sprintf("+ "+format+"\r\n", args...)
	c.writer.WriteString(response)
	c.writer.Flush()
}

// requireAuth checks if user is authenticated
func (c *Connection) requireAuth(tag string) bool {
	if !c.ctx.Authenticated {
		c.sendTagged(tag, "NO Not authenticated")
		return false
	}
	return true
}

// requireSelected checks if a mailbox is selected
func (c *Connection) requireSelected(tag string) bool {
	if !c.requireAuth(tag) {
		return false
	}
	if c.ctx.ActiveFolder == nil {
		c.sendTagged(tag, "NO No mailbox selected")
		return false
	}
	return true
}

// upgradeTLS upgrades the connection to TLS
func (c *Connection) upgradeTLS() error {
	if c.config.TLS.Enabled && c.server.tlsConfig != nil {
		tlsConn := tls.Server(c.conn, c.server.tlsConfig)
		if err := tlsConn.Handshake(); err != nil {
			return err
		}
		c.conn = tlsConn
		c.reader = bufio.NewReader(c.conn)
		c.writer = bufio.NewWriter(c.conn)
		c.ctx.TLSEnabled = true

		// Update capabilities
		c.ctx.Capabilities = c.server.getCapabilities(true)
	}
	return nil
}

// getContext returns a context with timeout
func (c *Connection) getContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 30*time.Second)
}

// parseMailboxPath parses a mailbox path and extracts domain context
// Returns (mailboxID, folderPath, error)
func (c *Connection) parseMailboxPath(path string) (*Mailbox, string, error) {
	path = strings.Trim(path, "\"")

	// Check for shared mailbox prefix
	if strings.HasPrefix(path, "Shared/") {
		return c.parseSharedMailboxPath(path)
	}

	// Check for domain-specific path (domain.com/FolderName)
	parts := strings.SplitN(path, "/", 2)
	if len(parts) == 2 {
		domainName := parts[0]
		folderPath := parts[1]

		// Find mailbox by domain
		for _, mb := range c.ctx.Mailboxes {
			if mb.Domain != nil && mb.Domain.Name == domainName {
				return mb, folderPath, nil
			}
		}
	}

	// Unified mode - use primary mailbox or active mailbox
	if c.ctx.ActiveMailbox != nil {
		return c.ctx.ActiveMailbox, path, nil
	}

	// Find primary mailbox
	for _, mb := range c.ctx.Mailboxes {
		if mb.IsPrimary {
			return mb, path, nil
		}
	}

	if len(c.ctx.Mailboxes) > 0 {
		return c.ctx.Mailboxes[0], path, nil
	}

	return nil, "", fmt.Errorf("no mailbox available")
}

// parseSharedMailboxPath parses a shared mailbox path
func (c *Connection) parseSharedMailboxPath(path string) (*Mailbox, string, error) {
	// Format: Shared/email@domain.com/FolderName
	path = strings.TrimPrefix(path, "Shared/")
	parts := strings.SplitN(path, "/", 2)
	if len(parts) < 1 {
		return nil, "", fmt.Errorf("invalid shared mailbox path")
	}

	sharedEmail := parts[0]
	folderPath := "INBOX"
	if len(parts) > 1 {
		folderPath = parts[1]
	}

	// Find shared mailbox
	for _, mb := range c.ctx.SharedMailboxes {
		if mb.Email == sharedEmail {
			return mb, folderPath, nil
		}
	}

	return nil, "", fmt.Errorf("shared mailbox not found: %s", sharedEmail)
}

// Helper errors
var errConnectionClosed = fmt.Errorf("connection closed")

// isTimeout checks if error is a timeout
func isTimeout(err error) bool {
	if netErr, ok := err.(net.Error); ok {
		return netErr.Timeout()
	}
	return false
}
