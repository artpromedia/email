package hub

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	"chat/internal/models"
	"chat/internal/repository"
)

// EventType represents WebSocket event types
type EventType string

const (
	EventMessage        EventType = "message"
	EventMessageUpdate  EventType = "message_update"
	EventMessageDelete  EventType = "message_delete"
	EventTyping         EventType = "typing"
	EventPresence       EventType = "presence"
	EventChannelUpdate  EventType = "channel_update"
	EventChannelJoin    EventType = "channel_join"
	EventChannelLeave   EventType = "channel_leave"
	EventReaction       EventType = "reaction"
	EventNotification   EventType = "notification"
	EventError          EventType = "error"
	EventPing           EventType = "ping"
	EventPong           EventType = "pong"
)

// Event represents a WebSocket event
type Event struct {
	Type      EventType   `json:"type"`
	ChannelID *uuid.UUID  `json:"channel_id,omitempty"`
	Payload   interface{} `json:"payload"`
	Timestamp time.Time   `json:"timestamp"`
}

// Client represents a connected WebSocket client
type Client struct {
	ID             uuid.UUID
	UserID         uuid.UUID
	OrganizationID uuid.UUID
	Conn           *websocket.Conn
	Send           chan []byte
	Hub            *Hub
	Channels       map[uuid.UUID]bool
	mu             sync.RWMutex
}

// Hub maintains the set of active clients and broadcasts messages
type Hub struct {
	// Registered clients by user ID
	clients map[uuid.UUID]map[*Client]bool

	// Clients by channel ID
	channelClients map[uuid.UUID]map[*Client]bool

	// Clients by organization ID
	orgClients map[uuid.UUID]map[*Client]bool

	// Register requests
	register chan *Client

	// Unregister requests
	unregister chan *Client

	// Broadcast to channel
	broadcast chan *ChannelBroadcast

	// Direct message to user
	direct chan *DirectBroadcast

	// Organization broadcast
	orgBroadcast chan *OrgBroadcast

	// Repository for persistence
	repo *repository.Repository

	// Logger
	logger *zap.Logger

	// Mutex for thread safety
	mu sync.RWMutex

	// Shutdown channel
	shutdown chan struct{}
}

// ChannelBroadcast represents a message to broadcast to a channel
type ChannelBroadcast struct {
	ChannelID uuid.UUID
	Event     *Event
	ExcludeClient *Client
}

// DirectBroadcast represents a message to send to a specific user
type DirectBroadcast struct {
	UserID uuid.UUID
	Event  *Event
}

// OrgBroadcast represents a message to broadcast to an organization
type OrgBroadcast struct {
	OrganizationID uuid.UUID
	Event          *Event
}

// NewHub creates a new Hub
func NewHub(repo *repository.Repository, logger *zap.Logger) *Hub {
	return &Hub{
		clients:        make(map[uuid.UUID]map[*Client]bool),
		channelClients: make(map[uuid.UUID]map[*Client]bool),
		orgClients:     make(map[uuid.UUID]map[*Client]bool),
		register:       make(chan *Client),
		unregister:     make(chan *Client),
		broadcast:      make(chan *ChannelBroadcast, 256),
		direct:         make(chan *DirectBroadcast, 256),
		orgBroadcast:   make(chan *OrgBroadcast, 256),
		repo:           repo,
		logger:         logger,
		shutdown:       make(chan struct{}),
	}
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.registerClient(client)

		case client := <-h.unregister:
			h.unregisterClient(client)

		case msg := <-h.broadcast:
			h.broadcastToChannel(msg)

		case msg := <-h.direct:
			h.sendToUser(msg)

		case msg := <-h.orgBroadcast:
			h.broadcastToOrg(msg)

		case <-ticker.C:
			h.cleanupStaleConnections()

		case <-h.shutdown:
			h.closeAllConnections()
			return
		}
	}
}

// Shutdown gracefully shuts down the hub
func (h *Hub) Shutdown() {
	close(h.shutdown)
}

func (h *Hub) registerClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Add to user clients map
	if h.clients[client.UserID] == nil {
		h.clients[client.UserID] = make(map[*Client]bool)
	}
	h.clients[client.UserID][client] = true

	// Add to organization clients map
	if h.orgClients[client.OrganizationID] == nil {
		h.orgClients[client.OrganizationID] = make(map[*Client]bool)
	}
	h.orgClients[client.OrganizationID][client] = true

	h.logger.Debug("Client registered",
		zap.String("user_id", client.UserID.String()),
		zap.String("client_id", client.ID.String()),
	)

	// Broadcast presence update
	h.broadcastPresence(client.UserID, client.OrganizationID, "online")
}

func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Remove from user clients
	if clients, ok := h.clients[client.UserID]; ok {
		delete(clients, client)
		if len(clients) == 0 {
			delete(h.clients, client.UserID)
			// User is now offline
			h.broadcastPresence(client.UserID, client.OrganizationID, "offline")
		}
	}

	// Remove from channel clients
	for channelID := range client.Channels {
		if clients, ok := h.channelClients[channelID]; ok {
			delete(clients, client)
			if len(clients) == 0 {
				delete(h.channelClients, channelID)
			}
		}
	}

	// Remove from org clients
	if clients, ok := h.orgClients[client.OrganizationID]; ok {
		delete(clients, client)
		if len(clients) == 0 {
			delete(h.orgClients, client.OrganizationID)
		}
	}

	close(client.Send)

	h.logger.Debug("Client unregistered",
		zap.String("user_id", client.UserID.String()),
		zap.String("client_id", client.ID.String()),
	)
}

// JoinChannel adds a client to a channel
func (h *Hub) JoinChannel(client *Client, channelID uuid.UUID) {
	h.mu.Lock()
	defer h.mu.Unlock()

	client.mu.Lock()
	client.Channels[channelID] = true
	client.mu.Unlock()

	if h.channelClients[channelID] == nil {
		h.channelClients[channelID] = make(map[*Client]bool)
	}
	h.channelClients[channelID][client] = true
}

// LeaveChannel removes a client from a channel
func (h *Hub) LeaveChannel(client *Client, channelID uuid.UUID) {
	h.mu.Lock()
	defer h.mu.Unlock()

	client.mu.Lock()
	delete(client.Channels, channelID)
	client.mu.Unlock()

	if clients, ok := h.channelClients[channelID]; ok {
		delete(clients, client)
		if len(clients) == 0 {
			delete(h.channelClients, channelID)
		}
	}
}

func (h *Hub) broadcastToChannel(msg *ChannelBroadcast) {
	h.mu.RLock()
	clients := h.channelClients[msg.ChannelID]
	h.mu.RUnlock()

	data, err := json.Marshal(msg.Event)
	if err != nil {
		h.logger.Error("Failed to marshal event", zap.Error(err))
		return
	}

	for client := range clients {
		if msg.ExcludeClient != nil && client == msg.ExcludeClient {
			continue
		}
		select {
		case client.Send <- data:
		default:
			h.unregister <- client
		}
	}
}

func (h *Hub) sendToUser(msg *DirectBroadcast) {
	h.mu.RLock()
	clients := h.clients[msg.UserID]
	h.mu.RUnlock()

	data, err := json.Marshal(msg.Event)
	if err != nil {
		h.logger.Error("Failed to marshal event", zap.Error(err))
		return
	}

	for client := range clients {
		select {
		case client.Send <- data:
		default:
			h.unregister <- client
		}
	}
}

func (h *Hub) broadcastToOrg(msg *OrgBroadcast) {
	h.mu.RLock()
	clients := h.orgClients[msg.OrganizationID]
	h.mu.RUnlock()

	data, err := json.Marshal(msg.Event)
	if err != nil {
		h.logger.Error("Failed to marshal event", zap.Error(err))
		return
	}

	for client := range clients {
		select {
		case client.Send <- data:
		default:
			h.unregister <- client
		}
	}
}

func (h *Hub) broadcastPresence(userID, orgID uuid.UUID, status string) {
	event := &Event{
		Type: EventPresence,
		Payload: models.Presence{
			UserID:     userID,
			Status:     status,
			LastSeenAt: time.Now(),
		},
		Timestamp: time.Now(),
	}

	// Broadcast to organization
	go func() {
		h.orgBroadcast <- &OrgBroadcast{
			OrganizationID: orgID,
			Event:          event,
		}
	}()
}

func (h *Hub) cleanupStaleConnections() {
	// Implemented in client read/write pumps via ping/pong
}

func (h *Hub) closeAllConnections() {
	h.mu.Lock()
	defer h.mu.Unlock()

	for _, clients := range h.clients {
		for client := range clients {
			close(client.Send)
		}
	}
}

// BroadcastMessage broadcasts a new message to a channel
func (h *Hub) BroadcastMessage(channelID uuid.UUID, message *models.Message) {
	h.broadcast <- &ChannelBroadcast{
		ChannelID: channelID,
		Event: &Event{
			Type:      EventMessage,
			ChannelID: &channelID,
			Payload:   message,
			Timestamp: time.Now(),
		},
	}
}

// BroadcastTyping broadcasts typing indicator
func (h *Hub) BroadcastTyping(channelID, userID uuid.UUID, isTyping bool) {
	h.broadcast <- &ChannelBroadcast{
		ChannelID: channelID,
		Event: &Event{
			Type:      EventTyping,
			ChannelID: &channelID,
			Payload: map[string]interface{}{
				"user_id":   userID,
				"is_typing": isTyping,
			},
			Timestamp: time.Now(),
		},
	}
}

// Register registers a new client
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister unregisters a client
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// GetOnlineUsers returns online users for an organization
func (h *Hub) GetOnlineUsers(orgID uuid.UUID) []uuid.UUID {
	h.mu.RLock()
	defer h.mu.RUnlock()

	users := make([]uuid.UUID, 0)
	seen := make(map[uuid.UUID]bool)

	if clients, ok := h.orgClients[orgID]; ok {
		for client := range clients {
			if !seen[client.UserID] {
				users = append(users, client.UserID)
				seen[client.UserID] = true
			}
		}
	}

	return users
}

// IsUserOnline checks if a user is online
func (h *Hub) IsUserOnline(userID uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	clients, ok := h.clients[userID]
	return ok && len(clients) > 0
}
