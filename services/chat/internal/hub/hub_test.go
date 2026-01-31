package hub

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"chat/internal/models"
)

func TestHub(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	hub := NewHub(nil, logger)
	go hub.Run()
	defer hub.Shutdown()

	t.Run("RegisterAndUnregisterClient", func(t *testing.T) {
		userID := uuid.New()
		orgID := uuid.New()

		client := &Client{
			ID:             uuid.New(),
			UserID:         userID,
			OrganizationID: orgID,
			Send:           make(chan []byte, 256),
			Hub:            hub,
			Channels:       make(map[uuid.UUID]bool),
		}

		// Register
		hub.Register(client)
		time.Sleep(50 * time.Millisecond)

		assert.True(t, hub.IsUserOnline(userID))

		// Unregister
		hub.Unregister(client)
		time.Sleep(50 * time.Millisecond)

		assert.False(t, hub.IsUserOnline(userID))
	})

	t.Run("JoinAndLeaveChannel", func(t *testing.T) {
		userID := uuid.New()
		orgID := uuid.New()
		channelID := uuid.New()

		client := &Client{
			ID:             uuid.New(),
			UserID:         userID,
			OrganizationID: orgID,
			Send:           make(chan []byte, 256),
			Hub:            hub,
			Channels:       make(map[uuid.UUID]bool),
		}

		hub.Register(client)
		time.Sleep(50 * time.Millisecond)

		// Join channel
		hub.JoinChannel(client, channelID)
		assert.True(t, client.Channels[channelID])

		// Leave channel
		hub.LeaveChannel(client, channelID)
		assert.False(t, client.Channels[channelID])

		hub.Unregister(client)
	})

	t.Run("GetOnlineUsers", func(t *testing.T) {
		orgID := uuid.New()

		clients := make([]*Client, 3)
		for i := 0; i < 3; i++ {
			clients[i] = &Client{
				ID:             uuid.New(),
				UserID:         uuid.New(),
				OrganizationID: orgID,
				Send:           make(chan []byte, 256),
				Hub:            hub,
				Channels:       make(map[uuid.UUID]bool),
			}
			hub.Register(clients[i])
		}
		time.Sleep(50 * time.Millisecond)

		onlineUsers := hub.GetOnlineUsers(orgID)
		assert.Len(t, onlineUsers, 3)

		// Cleanup
		for _, client := range clients {
			hub.Unregister(client)
		}
	})

	t.Run("BroadcastMessage", func(t *testing.T) {
		userID := uuid.New()
		orgID := uuid.New()
		channelID := uuid.New()

		client := &Client{
			ID:             uuid.New(),
			UserID:         userID,
			OrganizationID: orgID,
			Send:           make(chan []byte, 256),
			Hub:            hub,
			Channels:       make(map[uuid.UUID]bool),
		}

		hub.Register(client)
		hub.JoinChannel(client, channelID)
		time.Sleep(50 * time.Millisecond)

		// Broadcast message
		message := &models.Message{
			ID:        uuid.New(),
			ChannelID: channelID,
			Content:   "Test message",
		}
		hub.BroadcastMessage(channelID, message)

		// Check if message received
		select {
		case data := <-client.Send:
			var event Event
			err := json.Unmarshal(data, &event)
			require.NoError(t, err)
			assert.Equal(t, EventMessage, event.Type)
		case <-time.After(time.Second):
			t.Fatal("Did not receive message")
		}

		hub.Unregister(client)
	})

	t.Run("BroadcastTyping", func(t *testing.T) {
		userID := uuid.New()
		orgID := uuid.New()
		channelID := uuid.New()

		client := &Client{
			ID:             uuid.New(),
			UserID:         userID,
			OrganizationID: orgID,
			Send:           make(chan []byte, 256),
			Hub:            hub,
			Channels:       make(map[uuid.UUID]bool),
		}

		hub.Register(client)
		hub.JoinChannel(client, channelID)
		time.Sleep(50 * time.Millisecond)

		// Broadcast typing
		hub.BroadcastTyping(channelID, uuid.New(), true)

		// Check if typing event received
		select {
		case data := <-client.Send:
			var event Event
			err := json.Unmarshal(data, &event)
			require.NoError(t, err)
			assert.Equal(t, EventTyping, event.Type)
		case <-time.After(time.Second):
			t.Fatal("Did not receive typing event")
		}

		hub.Unregister(client)
	})
}

func TestClient(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	hub := NewHub(nil, logger)
	go hub.Run()
	defer hub.Shutdown()

	t.Run("SendEvent", func(t *testing.T) {
		client := &Client{
			ID:       uuid.New(),
			UserID:   uuid.New(),
			Send:     make(chan []byte, 256),
			Hub:      hub,
			Channels: make(map[uuid.UUID]bool),
		}

		event := &Event{
			Type:      EventMessage,
			Timestamp: time.Now(),
			Payload:   "test",
		}

		err := client.SendEvent(event)
		require.NoError(t, err)

		select {
		case data := <-client.Send:
			var received Event
			err := json.Unmarshal(data, &received)
			require.NoError(t, err)
			assert.Equal(t, EventMessage, received.Type)
		case <-time.After(time.Second):
			t.Fatal("Did not receive event")
		}
	})

	t.Run("SendEventBufferFull", func(t *testing.T) {
		client := &Client{
			ID:       uuid.New(),
			UserID:   uuid.New(),
			Send:     make(chan []byte, 1), // Small buffer
			Hub:      hub,
			Channels: make(map[uuid.UUID]bool),
		}

		// Fill buffer
		client.Send <- []byte("dummy")

		// Try to send when buffer is full
		event := &Event{
			Type:      EventMessage,
			Timestamp: time.Now(),
		}

		err := client.SendEvent(event)
		assert.Error(t, err)
		assert.Equal(t, ErrClientBufferFull, err)
	})
}

func TestWebSocketIntegration(t *testing.T) {
	logger, _ := zap.NewDevelopment()
	hub := NewHub(nil, logger)
	go hub.Run()
	defer hub.Shutdown()

	// Create test WebSocket server
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		client := NewClient(hub, conn, uuid.New(), uuid.New())
		hub.Register(client)

		go client.WritePump(logger)
		client.ReadPump(logger)
	}))
	defer server.Close()

	t.Run("ConnectAndPing", func(t *testing.T) {
		// Convert http URL to ws URL
		wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		require.NoError(t, err)
		defer conn.Close()

		// Send ping
		pingMsg := ClientMessage{
			Type: EventPing,
		}
		err = conn.WriteJSON(pingMsg)
		require.NoError(t, err)

		// Expect pong
		conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		_, data, err := conn.ReadMessage()
		require.NoError(t, err)

		var event Event
		err = json.Unmarshal(data, &event)
		require.NoError(t, err)
		assert.Equal(t, EventPong, event.Type)
	})

	t.Run("SubscribeToChannel", func(t *testing.T) {
		wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		require.NoError(t, err)
		defer conn.Close()

		channelID := uuid.New()

		// Subscribe
		subscribeMsg := ClientMessage{
			Type:      "subscribe",
			ChannelID: &channelID,
		}
		err = conn.WriteJSON(subscribeMsg)
		require.NoError(t, err)

		// Give time for subscription
		time.Sleep(100 * time.Millisecond)
	})

	t.Run("SendTypingIndicator", func(t *testing.T) {
		wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		require.NoError(t, err)
		defer conn.Close()

		channelID := uuid.New()

		// Send typing
		payload, _ := json.Marshal(map[string]bool{"is_typing": true})
		typingMsg := ClientMessage{
			Type:      EventTyping,
			ChannelID: &channelID,
			Payload:   payload,
		}
		err = conn.WriteJSON(typingMsg)
		require.NoError(t, err)
	})
}

func TestEventTypes(t *testing.T) {
	t.Run("EventTypeStrings", func(t *testing.T) {
		assert.Equal(t, EventType("message"), EventMessage)
		assert.Equal(t, EventType("message_update"), EventMessageUpdate)
		assert.Equal(t, EventType("message_delete"), EventMessageDelete)
		assert.Equal(t, EventType("typing"), EventTyping)
		assert.Equal(t, EventType("presence"), EventPresence)
		assert.Equal(t, EventType("channel_update"), EventChannelUpdate)
		assert.Equal(t, EventType("channel_join"), EventChannelJoin)
		assert.Equal(t, EventType("channel_leave"), EventChannelLeave)
		assert.Equal(t, EventType("reaction"), EventReaction)
		assert.Equal(t, EventType("notification"), EventNotification)
		assert.Equal(t, EventType("error"), EventError)
		assert.Equal(t, EventType("ping"), EventPing)
		assert.Equal(t, EventType("pong"), EventPong)
	})
}

func BenchmarkHub(b *testing.B) {
	logger, _ := zap.NewDevelopment()
	hub := NewHub(nil, logger)
	go hub.Run()
	defer hub.Shutdown()

	orgID := uuid.New()
	channelID := uuid.New()

	// Create clients
	clients := make([]*Client, 100)
	for i := 0; i < 100; i++ {
		clients[i] = &Client{
			ID:             uuid.New(),
			UserID:         uuid.New(),
			OrganizationID: orgID,
			Send:           make(chan []byte, 256),
			Hub:            hub,
			Channels:       make(map[uuid.UUID]bool),
		}
		hub.Register(clients[i])
		hub.JoinChannel(clients[i], channelID)
	}
	time.Sleep(100 * time.Millisecond)

	// Drain channels in background
	for _, client := range clients {
		go func(c *Client) {
			for range c.Send {
			}
		}(client)
	}

	message := &models.Message{
		ID:        uuid.New(),
		ChannelID: channelID,
		Content:   "Benchmark message",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		hub.BroadcastMessage(channelID, message)
	}
	b.StopTimer()

	// Cleanup
	for _, client := range clients {
		hub.Unregister(client)
	}
}
