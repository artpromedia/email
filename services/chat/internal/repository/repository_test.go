package repository

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"chat/internal/models"
)

func TestChannelOperations(t *testing.T) {
	// Skip in CI without database
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	ctx := context.Background()
	repo := setupTestRepo(t)
	defer repo.Close()

	orgID := uuid.New()
	userID := uuid.New()

	t.Run("CreateChannel", func(t *testing.T) {
		channel := &models.Channel{
			OrganizationID: orgID,
			Name:           "general",
			Slug:           "general",
			Description:    "General discussion",
			Type:           models.ChannelTypePublic,
			CreatedBy:      userID,
		}

		err := repo.CreateChannel(ctx, channel)
		require.NoError(t, err)
		assert.NotEqual(t, uuid.Nil, channel.ID)
		assert.False(t, channel.CreatedAt.IsZero())
	})

	t.Run("GetChannel", func(t *testing.T) {
		channel := &models.Channel{
			OrganizationID: orgID,
			Name:           "test-get",
			Slug:           "test-get",
			Type:           models.ChannelTypePublic,
			CreatedBy:      userID,
		}
		err := repo.CreateChannel(ctx, channel)
		require.NoError(t, err)

		retrieved, err := repo.GetChannel(ctx, channel.ID)
		require.NoError(t, err)
		assert.Equal(t, channel.Name, retrieved.Name)
		assert.Equal(t, channel.Slug, retrieved.Slug)
	})

	t.Run("GetChannelBySlug", func(t *testing.T) {
		channel := &models.Channel{
			OrganizationID: orgID,
			Name:           "by-slug",
			Slug:           "by-slug-test",
			Type:           models.ChannelTypePublic,
			CreatedBy:      userID,
		}
		err := repo.CreateChannel(ctx, channel)
		require.NoError(t, err)

		retrieved, err := repo.GetChannelBySlug(ctx, orgID, "by-slug-test")
		require.NoError(t, err)
		assert.Equal(t, channel.ID, retrieved.ID)
	})

	t.Run("UpdateChannel", func(t *testing.T) {
		channel := &models.Channel{
			OrganizationID: orgID,
			Name:           "to-update",
			Slug:           "to-update",
			Type:           models.ChannelTypePublic,
			CreatedBy:      userID,
		}
		err := repo.CreateChannel(ctx, channel)
		require.NoError(t, err)

		channel.Name = "updated-name"
		channel.Description = "Updated description"
		channel.Topic = "New topic"

		err = repo.UpdateChannel(ctx, channel)
		require.NoError(t, err)

		retrieved, err := repo.GetChannel(ctx, channel.ID)
		require.NoError(t, err)
		assert.Equal(t, "updated-name", retrieved.Name)
		assert.Equal(t, "Updated description", retrieved.Description)
		assert.Equal(t, "New topic", retrieved.Topic)
	})

	t.Run("DeleteChannel", func(t *testing.T) {
		channel := &models.Channel{
			OrganizationID: orgID,
			Name:           "to-delete",
			Slug:           "to-delete",
			Type:           models.ChannelTypePublic,
			CreatedBy:      userID,
		}
		err := repo.CreateChannel(ctx, channel)
		require.NoError(t, err)

		err = repo.DeleteChannel(ctx, channel.ID)
		require.NoError(t, err)

		_, err = repo.GetChannel(ctx, channel.ID)
		assert.Error(t, err)
	})
}

func TestChannelMemberOperations(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	ctx := context.Background()
	repo := setupTestRepo(t)
	defer repo.Close()

	orgID := uuid.New()
	userID := uuid.New()
	memberID := uuid.New()

	// Create a channel first
	channel := &models.Channel{
		OrganizationID: orgID,
		Name:           "member-test",
		Slug:           "member-test",
		Type:           models.ChannelTypePrivate,
		CreatedBy:      userID,
	}
	err := repo.CreateChannel(ctx, channel)
	require.NoError(t, err)

	t.Run("AddChannelMember", func(t *testing.T) {
		member := &models.ChannelMember{
			ChannelID: channel.ID,
			UserID:    memberID,
			Role:      "member",
		}

		err := repo.AddChannelMember(ctx, member)
		require.NoError(t, err)
		assert.NotEqual(t, uuid.Nil, member.ID)
	})

	t.Run("IsMember", func(t *testing.T) {
		isMember, err := repo.IsMember(ctx, channel.ID, memberID)
		require.NoError(t, err)
		assert.True(t, isMember)

		isMember, err = repo.IsMember(ctx, channel.ID, uuid.New())
		require.NoError(t, err)
		assert.False(t, isMember)
	})

	t.Run("GetChannelMembers", func(t *testing.T) {
		members, err := repo.GetChannelMembers(ctx, channel.ID)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(members), 1)
	})

	t.Run("RemoveChannelMember", func(t *testing.T) {
		err := repo.RemoveChannelMember(ctx, channel.ID, memberID)
		require.NoError(t, err)

		isMember, err := repo.IsMember(ctx, channel.ID, memberID)
		require.NoError(t, err)
		assert.False(t, isMember)
	})

	t.Run("UpdateLastRead", func(t *testing.T) {
		member := &models.ChannelMember{
			ChannelID: channel.ID,
			UserID:    userID,
			Role:      "owner",
		}
		err := repo.AddChannelMember(ctx, member)
		require.NoError(t, err)

		messageID := uuid.New()
		err = repo.UpdateLastRead(ctx, channel.ID, userID, &messageID)
		require.NoError(t, err)
	})
}

func TestMessageOperations(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	ctx := context.Background()
	repo := setupTestRepo(t)
	defer repo.Close()

	orgID := uuid.New()
	userID := uuid.New()

	// Create a channel first
	channel := &models.Channel{
		OrganizationID: orgID,
		Name:           "message-test",
		Slug:           "message-test",
		Type:           models.ChannelTypePublic,
		CreatedBy:      userID,
	}
	err := repo.CreateChannel(ctx, channel)
	require.NoError(t, err)

	t.Run("CreateMessage", func(t *testing.T) {
		message := &models.Message{
			ChannelID:   channel.ID,
			UserID:      userID,
			Content:     "Hello, World!",
			ContentType: "text",
		}

		err := repo.CreateMessage(ctx, message)
		require.NoError(t, err)
		assert.NotEqual(t, uuid.Nil, message.ID)
		assert.False(t, message.CreatedAt.IsZero())
	})

	t.Run("GetMessage", func(t *testing.T) {
		message := &models.Message{
			ChannelID:   channel.ID,
			UserID:      userID,
			Content:     "Test message",
			ContentType: "text",
		}
		err := repo.CreateMessage(ctx, message)
		require.NoError(t, err)

		retrieved, err := repo.GetMessage(ctx, message.ID)
		require.NoError(t, err)
		assert.Equal(t, message.Content, retrieved.Content)
	})

	t.Run("ListMessages", func(t *testing.T) {
		// Create multiple messages
		for i := 0; i < 5; i++ {
			message := &models.Message{
				ChannelID:   channel.ID,
				UserID:      userID,
				Content:     "List test message",
				ContentType: "text",
			}
			err := repo.CreateMessage(ctx, message)
			require.NoError(t, err)
		}

		messages, err := repo.ListMessages(ctx, channel.ID, 10, nil)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(messages), 5)
	})

	t.Run("UpdateMessage", func(t *testing.T) {
		message := &models.Message{
			ChannelID:   channel.ID,
			UserID:      userID,
			Content:     "Original content",
			ContentType: "text",
		}
		err := repo.CreateMessage(ctx, message)
		require.NoError(t, err)

		message.Content = "Updated content"
		err = repo.UpdateMessage(ctx, message)
		require.NoError(t, err)

		retrieved, err := repo.GetMessage(ctx, message.ID)
		require.NoError(t, err)
		assert.Equal(t, "Updated content", retrieved.Content)
		assert.True(t, retrieved.IsEdited)
	})

	t.Run("DeleteMessage", func(t *testing.T) {
		message := &models.Message{
			ChannelID:   channel.ID,
			UserID:      userID,
			Content:     "To be deleted",
			ContentType: "text",
		}
		err := repo.CreateMessage(ctx, message)
		require.NoError(t, err)

		err = repo.DeleteMessage(ctx, message.ID)
		require.NoError(t, err)

		retrieved, err := repo.GetMessage(ctx, message.ID)
		require.NoError(t, err)
		assert.True(t, retrieved.IsDeleted)
	})

	t.Run("PinMessage", func(t *testing.T) {
		message := &models.Message{
			ChannelID:   channel.ID,
			UserID:      userID,
			Content:     "Important message",
			ContentType: "text",
		}
		err := repo.CreateMessage(ctx, message)
		require.NoError(t, err)

		err = repo.PinMessage(ctx, message.ID, true)
		require.NoError(t, err)

		pinned, err := repo.GetPinnedMessages(ctx, channel.ID)
		require.NoError(t, err)

		found := false
		for _, m := range pinned {
			if m.ID == message.ID {
				found = true
				break
			}
		}
		assert.True(t, found)
	})

	t.Run("ThreadMessages", func(t *testing.T) {
		// Create parent message
		parent := &models.Message{
			ChannelID:   channel.ID,
			UserID:      userID,
			Content:     "Parent message",
			ContentType: "text",
		}
		err := repo.CreateMessage(ctx, parent)
		require.NoError(t, err)

		// Create replies
		for i := 0; i < 3; i++ {
			reply := &models.Message{
				ChannelID:   channel.ID,
				UserID:      userID,
				ParentID:    &parent.ID,
				Content:     "Reply message",
				ContentType: "text",
			}
			err := repo.CreateMessage(ctx, reply)
			require.NoError(t, err)
		}

		// Get thread
		replies, err := repo.ListThreadMessages(ctx, parent.ID, 10)
		require.NoError(t, err)
		assert.Len(t, replies, 3)
	})
}

func TestReactionOperations(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	ctx := context.Background()
	repo := setupTestRepo(t)
	defer repo.Close()

	orgID := uuid.New()
	userID := uuid.New()

	// Create channel and message
	channel := &models.Channel{
		OrganizationID: orgID,
		Name:           "reaction-test",
		Slug:           "reaction-test",
		Type:           models.ChannelTypePublic,
		CreatedBy:      userID,
	}
	err := repo.CreateChannel(ctx, channel)
	require.NoError(t, err)

	message := &models.Message{
		ChannelID:   channel.ID,
		UserID:      userID,
		Content:     "React to me!",
		ContentType: "text",
	}
	err = repo.CreateMessage(ctx, message)
	require.NoError(t, err)

	t.Run("AddReaction", func(t *testing.T) {
		reaction := &models.Reaction{
			MessageID: message.ID,
			UserID:    userID,
			Emoji:     "👍",
		}

		err := repo.AddReaction(ctx, reaction)
		require.NoError(t, err)
		assert.NotEqual(t, uuid.Nil, reaction.ID)
	})

	t.Run("GetMessageReactions", func(t *testing.T) {
		reactions, err := repo.GetMessageReactions(ctx, message.ID)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(reactions), 1)
	})

	t.Run("RemoveReaction", func(t *testing.T) {
		err := repo.RemoveReaction(ctx, message.ID, userID, "👍")
		require.NoError(t, err)
	})
}

func TestDirectMessageOperations(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	ctx := context.Background()
	repo := setupTestRepo(t)
	defer repo.Close()

	orgID := uuid.New()
	user1ID := uuid.New()
	user2ID := uuid.New()

	t.Run("GetOrCreateDirectChannel", func(t *testing.T) {
		// Create new DM channel
		channel, err := repo.GetOrCreateDirectChannel(ctx, orgID, []uuid.UUID{user1ID, user2ID})
		require.NoError(t, err)
		assert.NotNil(t, channel)
		assert.Equal(t, models.ChannelTypeDirect, channel.Type)

		// Get existing DM channel
		channel2, err := repo.GetOrCreateDirectChannel(ctx, orgID, []uuid.UUID{user2ID, user1ID})
		require.NoError(t, err)
		assert.Equal(t, channel.ID, channel2.ID)
	})

	t.Run("InvalidDirectMessage", func(t *testing.T) {
		// Should fail with only one user
		_, err := repo.GetOrCreateDirectChannel(ctx, orgID, []uuid.UUID{user1ID})
		assert.Error(t, err)
	})
}

func TestSearchOperations(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	ctx := context.Background()
	repo := setupTestRepo(t)
	defer repo.Close()

	orgID := uuid.New()
	userID := uuid.New()

	// Create channel and messages
	channel := &models.Channel{
		OrganizationID: orgID,
		Name:           "search-test",
		Slug:           "search-test",
		Type:           models.ChannelTypePublic,
		CreatedBy:      userID,
	}
	err := repo.CreateChannel(ctx, channel)
	require.NoError(t, err)

	messages := []string{
		"Hello world",
		"Testing search functionality",
		"This message contains the word test",
		"Random content here",
	}

	for _, content := range messages {
		msg := &models.Message{
			ChannelID:   channel.ID,
			UserID:      userID,
			Content:     content,
			ContentType: "text",
		}
		err := repo.CreateMessage(ctx, msg)
		require.NoError(t, err)
	}

	t.Run("SearchMessages", func(t *testing.T) {
		results, err := repo.SearchMessages(ctx, orgID, userID, "test", 10)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(results), 2) // "Testing" and "test"
	})
}

func TestPresenceOperations(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	ctx := context.Background()
	repo := setupTestRepo(t)
	defer repo.Close()

	userID := uuid.New()

	t.Run("SetAndGetUserPresence", func(t *testing.T) {
		err := repo.SetUserPresence(ctx, userID, "online", 5*time.Minute)
		require.NoError(t, err)

		status, err := repo.GetUserPresence(ctx, userID)
		require.NoError(t, err)
		assert.Equal(t, "online", status)
	})
}

// Helper function to setup test repository
func setupTestRepo(t *testing.T) *Repository {
	// In real tests, use a test database or mock
	// This is a placeholder
	t.Helper()

	// For now, return nil - in production tests, connect to test DB
	return nil
}
