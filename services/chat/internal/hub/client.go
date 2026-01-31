package hub

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 65536
)

// ClientMessage represents an incoming message from a client
type ClientMessage struct {
	Type      EventType       `json:"type"`
	ChannelID *uuid.UUID      `json:"channel_id,omitempty"`
	Payload   json.RawMessage `json:"payload"`
}

// NewClient creates a new client
func NewClient(hub *Hub, conn *websocket.Conn, userID, orgID uuid.UUID) *Client {
	return &Client{
		ID:             uuid.New(),
		UserID:         userID,
		OrganizationID: orgID,
		Conn:           conn,
		Send:           make(chan []byte, 256),
		Hub:            hub,
		Channels:       make(map[uuid.UUID]bool),
	}
}

// ReadPump pumps messages from the websocket connection to the hub
func (c *Client) ReadPump(logger *zap.Logger) {
	defer func() {
		c.Hub.Unregister(c)
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Error("WebSocket read error", zap.Error(err))
			}
			break
		}

		// Parse incoming message
		var clientMsg ClientMessage
		if err := json.Unmarshal(message, &clientMsg); err != nil {
			logger.Warn("Invalid message format", zap.Error(err))
			continue
		}

		// Handle different message types
		c.handleMessage(&clientMsg, logger)
	}
}

// WritePump pumps messages from the hub to the websocket connection
func (c *Client) WritePump(logger *zap.Logger) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current websocket message
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(msg *ClientMessage, logger *zap.Logger) {
	switch msg.Type {
	case EventTyping:
		if msg.ChannelID != nil {
			var payload struct {
				IsTyping bool `json:"is_typing"`
			}
			if err := json.Unmarshal(msg.Payload, &payload); err == nil {
				c.Hub.BroadcastTyping(*msg.ChannelID, c.UserID, payload.IsTyping)
			}
		}

	case EventPing:
		// Respond with pong
		response := Event{
			Type:      EventPong,
			Timestamp: time.Now(),
		}
		data, _ := json.Marshal(response)
		c.Send <- data

	case "subscribe":
		// Subscribe to a channel
		if msg.ChannelID != nil {
			c.Hub.JoinChannel(c, *msg.ChannelID)
			logger.Debug("Client subscribed to channel",
				zap.String("user_id", c.UserID.String()),
				zap.String("channel_id", msg.ChannelID.String()),
			)
		}

	case "unsubscribe":
		// Unsubscribe from a channel
		if msg.ChannelID != nil {
			c.Hub.LeaveChannel(c, *msg.ChannelID)
			logger.Debug("Client unsubscribed from channel",
				zap.String("user_id", c.UserID.String()),
				zap.String("channel_id", msg.ChannelID.String()),
			)
		}

	default:
		logger.Debug("Unknown message type", zap.String("type", string(msg.Type)))
	}
}

// SendEvent sends an event to the client
func (c *Client) SendEvent(event *Event) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	select {
	case c.Send <- data:
		return nil
	default:
		return ErrClientBufferFull
	}
}

var ErrClientBufferFull = &ClientError{Message: "client buffer full"}

type ClientError struct {
	Message string
}

func (e *ClientError) Error() string {
	return e.Message
}
