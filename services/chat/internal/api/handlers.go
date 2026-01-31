package api

import (
	"encoding/json"
	"html"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gosimple/slug"
	"go.uber.org/zap"

	"chat/internal/hub"
	"chat/internal/models"
)

// ============================================================================
// Input Validation and Sanitization
// ============================================================================

const (
	maxChannelNameLength    = 100
	maxDescriptionLength    = 500
	maxStatusTextLength     = 100
	maxSearchQueryLength    = 200
	minChannelNameLength    = 1
)

var (
	// channelNameRegex allows alphanumeric, spaces, hyphens, and underscores
	channelNameRegex = regexp.MustCompile(`^[\p{L}\p{N}\s\-_]+$`)
)

// sanitizeString escapes HTML entities to prevent XSS attacks
func sanitizeString(s string) string {
	return html.EscapeString(strings.TrimSpace(s))
}

// validateChannelName validates and sanitizes a channel name
func validateChannelName(name string) (string, error) {
	name = strings.TrimSpace(name)

	if len(name) < minChannelNameLength {
		return "", &ValidationError{Field: "name", Message: "channel name is required"}
	}

	if utf8.RuneCountInString(name) > maxChannelNameLength {
		return "", &ValidationError{Field: "name", Message: "channel name is too long (max 100 characters)"}
	}

	if !channelNameRegex.MatchString(name) {
		return "", &ValidationError{Field: "name", Message: "channel name contains invalid characters"}
	}

	return sanitizeString(name), nil
}

// validateDescription validates and sanitizes a description
func validateDescription(desc string) string {
	desc = strings.TrimSpace(desc)
	if utf8.RuneCountInString(desc) > maxDescriptionLength {
		// Truncate to max length
		runes := []rune(desc)
		desc = string(runes[:maxDescriptionLength])
	}
	return sanitizeString(desc)
}

// validateMessageContent validates message content
func validateMessageContent(content string, maxLength int) (string, error) {
	content = strings.TrimSpace(content)

	if content == "" {
		return "", &ValidationError{Field: "content", Message: "message content is required"}
	}

	if utf8.RuneCountInString(content) > maxLength {
		return "", &ValidationError{Field: "content", Message: "message is too long"}
	}

	// Sanitize HTML to prevent XSS
	return sanitizeString(content), nil
}

// validateSearchQuery validates search query input
func validateSearchQuery(query string) (string, error) {
	query = strings.TrimSpace(query)

	if query == "" {
		return "", &ValidationError{Field: "query", Message: "search query is required"}
	}

	if utf8.RuneCountInString(query) > maxSearchQueryLength {
		return "", &ValidationError{Field: "query", Message: "search query is too long"}
	}

	return sanitizeString(query), nil
}

// ValidationError represents an input validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e *ValidationError) Error() string {
	return e.Message
}

// ============================================================================
// Channel Handlers
// ============================================================================

type CreateChannelRequest struct {
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Type        models.ChannelType `json:"type"`
	IsPrivate   bool               `json:"is_private"`
}

func (s *Server) createChannel(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)

	var req CreateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate and sanitize channel name
	validatedName, err := validateChannelName(req.Name)
	if err != nil {
		s.respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Sanitize description
	validatedDesc := validateDescription(req.Description)

	channelType := req.Type
	if channelType == "" {
		if req.IsPrivate {
			channelType = models.ChannelTypePrivate
		} else {
			channelType = models.ChannelTypePublic
		}
	}

	channel := &models.Channel{
		OrganizationID: user.OrganizationID,
		Name:           validatedName,
		Slug:           slug.Make(validatedName),
		Description:    validatedDesc,
		Type:           channelType,
		CreatedBy:      user.UserID,
	}

	if err := s.repo.CreateChannel(r.Context(), channel); err != nil {
		s.logger.Error("Failed to create channel", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to create channel")
		return
	}

	// Add creator as owner
	member := &models.ChannelMember{
		ChannelID: channel.ID,
		UserID:    user.UserID,
		Role:      "owner",
	}
	if err := s.repo.AddChannelMember(r.Context(), member); err != nil {
		s.logger.Error("Failed to add channel member", zap.Error(err))
	}

	// Broadcast channel creation
	s.hub.BroadcastMessage(channel.ID, &models.Message{
		ChannelID:   channel.ID,
		Content:     "Channel created",
		ContentType: "system",
	})

	s.respondJSON(w, http.StatusCreated, channel)
}

func (s *Server) listChannels(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)

	channels, err := s.repo.ListChannels(r.Context(), user.OrganizationID, user.UserID, true)
	if err != nil {
		s.logger.Error("Failed to list channels", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to list channels")
		return
	}

	s.respondJSON(w, http.StatusOK, map[string]interface{}{
		"channels": channels,
		"total":    len(channels),
	})
}

func (s *Server) listJoinedChannels(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)

	channels, err := s.repo.ListUserChannels(r.Context(), user.UserID)
	if err != nil {
		s.logger.Error("Failed to list joined channels", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to list channels")
		return
	}

	s.respondJSON(w, http.StatusOK, map[string]interface{}{
		"channels": channels,
		"total":    len(channels),
	})
}

func (s *Server) getChannel(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	channel, err := s.repo.GetChannel(r.Context(), channelID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "channel not found")
		return
	}

	// Check access
	if channel.Type == models.ChannelTypePrivate {
		isMember, _ := s.repo.IsMember(r.Context(), channelID, user.UserID)
		if !isMember {
			s.respondError(w, http.StatusForbidden, "access denied")
			return
		}
	}

	s.respondJSON(w, http.StatusOK, channel)
}

type UpdateChannelRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Topic       string `json:"topic"`
	IsArchived  bool   `json:"is_archived"`
}

func (s *Server) updateChannel(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	// Check if user is admin/owner
	channel, err := s.repo.GetChannel(r.Context(), channelID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "channel not found")
		return
	}

	if channel.CreatedBy != user.UserID {
		s.respondError(w, http.StatusForbidden, "only channel owner can update")
		return
	}

	var req UpdateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	channel.Name = req.Name
	channel.Description = req.Description
	channel.Topic = req.Topic
	channel.IsArchived = req.IsArchived

	if err := s.repo.UpdateChannel(r.Context(), channel); err != nil {
		s.logger.Error("Failed to update channel", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to update channel")
		return
	}

	s.respondJSON(w, http.StatusOK, channel)
}

func (s *Server) deleteChannel(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	channel, err := s.repo.GetChannel(r.Context(), channelID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "channel not found")
		return
	}

	if channel.CreatedBy != user.UserID {
		s.respondError(w, http.StatusForbidden, "only channel owner can delete")
		return
	}

	if err := s.repo.DeleteChannel(r.Context(), channelID); err != nil {
		s.logger.Error("Failed to delete channel", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to delete channel")
		return
	}

	s.respondJSON(w, http.StatusNoContent, nil)
}

func (s *Server) joinChannel(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	channel, err := s.repo.GetChannel(r.Context(), channelID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "channel not found")
		return
	}

	if channel.Type == models.ChannelTypePrivate {
		s.respondError(w, http.StatusForbidden, "cannot join private channel without invitation")
		return
	}

	member := &models.ChannelMember{
		ChannelID: channelID,
		UserID:    user.UserID,
		Role:      "member",
	}

	if err := s.repo.AddChannelMember(r.Context(), member); err != nil {
		s.logger.Error("Failed to join channel", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to join channel")
		return
	}

	// Broadcast join event
	s.hub.BroadcastMessage(channelID, &models.Message{
		ChannelID:   channelID,
		UserID:      user.UserID,
		Content:     "joined the channel",
		ContentType: "system",
	})

	s.respondJSON(w, http.StatusOK, map[string]string{"status": "joined"})
}

func (s *Server) leaveChannel(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	if err := s.repo.RemoveChannelMember(r.Context(), channelID, user.UserID); err != nil {
		s.logger.Error("Failed to leave channel", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to leave channel")
		return
	}

	// Broadcast leave event
	s.hub.BroadcastMessage(channelID, &models.Message{
		ChannelID:   channelID,
		UserID:      user.UserID,
		Content:     "left the channel",
		ContentType: "system",
	})

	s.respondJSON(w, http.StatusOK, map[string]string{"status": "left"})
}

func (s *Server) listMembers(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	members, err := s.repo.GetChannelMembers(r.Context(), channelID)
	if err != nil {
		s.logger.Error("Failed to list members", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to list members")
		return
	}

	// Add online status
	for i := range members {
		members[i].User = &models.User{
			ID:     members[i].UserID,
			Status: "offline",
		}
		if s.hub.IsUserOnline(members[i].UserID) {
			members[i].User.Status = "online"
		}
	}

	s.respondJSON(w, http.StatusOK, map[string]interface{}{
		"members": members,
		"total":   len(members),
	})
}

type AddMemberRequest struct {
	UserID uuid.UUID `json:"user_id"`
	Role   string    `json:"role"`
}

func (s *Server) addMember(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	var req AddMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Verify requester has permission
	isMember, _ := s.repo.IsMember(r.Context(), channelID, user.UserID)
	if !isMember {
		s.respondError(w, http.StatusForbidden, "access denied")
		return
	}

	role := req.Role
	if role == "" {
		role = "member"
	}

	member := &models.ChannelMember{
		ChannelID: channelID,
		UserID:    req.UserID,
		Role:      role,
	}

	if err := s.repo.AddChannelMember(r.Context(), member); err != nil {
		s.logger.Error("Failed to add member", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to add member")
		return
	}

	s.respondJSON(w, http.StatusOK, member)
}

func (s *Server) removeMember(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	if err := s.repo.RemoveChannelMember(r.Context(), channelID, userID); err != nil {
		s.logger.Error("Failed to remove member", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to remove member")
		return
	}

	s.respondJSON(w, http.StatusNoContent, nil)
}

func (s *Server) markAsRead(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	var req struct {
		MessageID *uuid.UUID `json:"message_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	if err := s.repo.UpdateLastRead(r.Context(), channelID, user.UserID, req.MessageID); err != nil {
		s.logger.Error("Failed to mark as read", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to mark as read")
		return
	}

	s.respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ============================================================================
// Message Handlers
// ============================================================================

type CreateMessageRequest struct {
	Content     string                 `json:"content"`
	ContentType string                 `json:"content_type"`
	ParentID    *uuid.UUID             `json:"parent_id"`
	Metadata    map[string]interface{} `json:"metadata"`
}

func (s *Server) createMessage(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	// Verify membership
	isMember, _ := s.repo.IsMember(r.Context(), channelID, user.UserID)
	if !isMember {
		// Check if public channel
		channel, err := s.repo.GetChannel(r.Context(), channelID)
		if err != nil || channel.Type != models.ChannelTypePublic {
			s.respondError(w, http.StatusForbidden, "access denied")
			return
		}
	}

	var req CreateMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate and sanitize message content
	validatedContent, err := validateMessageContent(req.Content, s.cfg.Limits.MaxMessageLength)
	if err != nil {
		s.respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	contentType := req.ContentType
	if contentType == "" {
		contentType = "text"
	}

	// Validate content type
	validContentTypes := map[string]bool{"text": true, "markdown": true, "code": true, "system": true}
	if !validContentTypes[contentType] {
		s.respondError(w, http.StatusBadRequest, "invalid content type")
		return
	}

	message := &models.Message{
		ChannelID:   channelID,
		UserID:      user.UserID,
		ParentID:    req.ParentID,
		Content:     validatedContent,
		ContentType: contentType,
		Metadata:    models.JSONMap(req.Metadata),
	}

	if err := s.repo.CreateMessage(r.Context(), message); err != nil {
		s.logger.Error("Failed to create message", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to create message")
		return
	}

	// Get user info for response
	userInfo, _ := s.repo.GetUser(r.Context(), user.UserID)
	message.User = userInfo

	// Broadcast message to channel
	s.hub.BroadcastMessage(channelID, message)

	s.respondJSON(w, http.StatusCreated, message)
}

func (s *Server) listMessages(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	// Verify access
	channel, err := s.repo.GetChannel(r.Context(), channelID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "channel not found")
		return
	}

	if channel.Type == models.ChannelTypePrivate {
		isMember, _ := s.repo.IsMember(r.Context(), channelID, user.UserID)
		if !isMember {
			s.respondError(w, http.StatusForbidden, "access denied")
			return
		}
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	var before *uuid.UUID
	if b := r.URL.Query().Get("before"); b != "" {
		if parsed, err := uuid.Parse(b); err == nil {
			before = &parsed
		}
	}

	messages, err := s.repo.ListMessages(r.Context(), channelID, limit, before)
	if err != nil {
		s.logger.Error("Failed to list messages", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to list messages")
		return
	}

	// Load attachments and reactions
	for i := range messages {
		messages[i].Attachments, _ = s.repo.GetMessageAttachments(r.Context(), messages[i].ID)
		messages[i].Reactions, _ = s.repo.GetMessageReactions(r.Context(), messages[i].ID)
	}

	s.respondJSON(w, http.StatusOK, map[string]interface{}{
		"messages": messages,
		"has_more": len(messages) == limit,
	})
}

func (s *Server) getMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	message, err := s.repo.GetMessage(r.Context(), messageID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "message not found")
		return
	}

	message.Attachments, _ = s.repo.GetMessageAttachments(r.Context(), messageID)
	message.Reactions, _ = s.repo.GetMessageReactions(r.Context(), messageID)

	s.respondJSON(w, http.StatusOK, message)
}

func (s *Server) updateMessage(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	message, err := s.repo.GetMessage(r.Context(), messageID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "message not found")
		return
	}

	if message.UserID != user.UserID {
		s.respondError(w, http.StatusForbidden, "can only edit your own messages")
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	message.Content = req.Content
	message.IsEdited = true

	if err := s.repo.UpdateMessage(r.Context(), message); err != nil {
		s.logger.Error("Failed to update message", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to update message")
		return
	}

	// Broadcast update
	s.hub.BroadcastMessage(message.ChannelID, message)

	s.respondJSON(w, http.StatusOK, message)
}

func (s *Server) deleteMessage(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	message, err := s.repo.GetMessage(r.Context(), messageID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "message not found")
		return
	}

	if message.UserID != user.UserID {
		s.respondError(w, http.StatusForbidden, "can only delete your own messages")
		return
	}

	if err := s.repo.DeleteMessage(r.Context(), messageID); err != nil {
		s.logger.Error("Failed to delete message", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to delete message")
		return
	}

	// Broadcast deletion
	s.hub.BroadcastMessage(message.ChannelID, &models.Message{
		ID:          messageID,
		ChannelID:   message.ChannelID,
		IsDeleted:   true,
		ContentType: "system",
	})

	s.respondJSON(w, http.StatusNoContent, nil)
}

func (s *Server) pinMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	if err := s.repo.PinMessage(r.Context(), messageID, true); err != nil {
		s.logger.Error("Failed to pin message", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to pin message")
		return
	}

	s.respondJSON(w, http.StatusOK, map[string]string{"status": "pinned"})
}

func (s *Server) unpinMessage(w http.ResponseWriter, r *http.Request) {
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	if err := s.repo.PinMessage(r.Context(), messageID, false); err != nil {
		s.logger.Error("Failed to unpin message", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to unpin message")
		return
	}

	s.respondJSON(w, http.StatusOK, map[string]string{"status": "unpinned"})
}

func (s *Server) getPinnedMessages(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid channel id")
		return
	}

	messages, err := s.repo.GetPinnedMessages(r.Context(), channelID)
	if err != nil {
		s.logger.Error("Failed to get pinned messages", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to get pinned messages")
		return
	}

	s.respondJSON(w, http.StatusOK, map[string]interface{}{
		"messages": messages,
		"total":    len(messages),
	})
}

// ============================================================================
// Thread Handlers
// ============================================================================

func (s *Server) getThread(w http.ResponseWriter, r *http.Request) {
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	// Get parent message
	parent, err := s.repo.GetMessage(r.Context(), messageID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "message not found")
		return
	}

	// Get replies
	replies, err := s.repo.ListThreadMessages(r.Context(), messageID, 100)
	if err != nil {
		s.logger.Error("Failed to get thread", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to get thread")
		return
	}

	s.respondJSON(w, http.StatusOK, models.Thread{
		ParentMessage: parent,
		Messages:      replies,
		ReplyCount:    len(replies),
	})
}

func (s *Server) replyToThread(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	parentID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	// Get parent to find channel
	parent, err := s.repo.GetMessage(r.Context(), parentID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "parent message not found")
		return
	}

	var req CreateMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	message := &models.Message{
		ChannelID:   parent.ChannelID,
		UserID:      user.UserID,
		ParentID:    &parentID,
		Content:     req.Content,
		ContentType: "text",
	}

	if err := s.repo.CreateMessage(r.Context(), message); err != nil {
		s.logger.Error("Failed to create reply", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to create reply")
		return
	}

	// Get user info
	userInfo, _ := s.repo.GetUser(r.Context(), user.UserID)
	message.User = userInfo

	// Broadcast to channel
	s.hub.BroadcastMessage(parent.ChannelID, message)

	s.respondJSON(w, http.StatusCreated, message)
}

// ============================================================================
// Reaction Handlers
// ============================================================================

func (s *Server) addReaction(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	var req struct {
		Emoji string `json:"emoji"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	reaction := &models.Reaction{
		MessageID: messageID,
		UserID:    user.UserID,
		Emoji:     req.Emoji,
	}

	if err := s.repo.AddReaction(r.Context(), reaction); err != nil {
		s.logger.Error("Failed to add reaction", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to add reaction")
		return
	}

	// Get message for broadcast
	message, _ := s.repo.GetMessage(r.Context(), messageID)
	if message != nil {
		s.hub.BroadcastMessage(message.ChannelID, &models.Message{
			ID:        messageID,
			ChannelID: message.ChannelID,
			Metadata: models.JSONMap{
				"reaction": map[string]interface{}{
					"emoji":   req.Emoji,
					"user_id": user.UserID,
					"action":  "add",
				},
			},
		})
	}

	s.respondJSON(w, http.StatusOK, reaction)
}

func (s *Server) removeReaction(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid message id")
		return
	}

	emoji := chi.URLParam(r, "emoji")

	if err := s.repo.RemoveReaction(r.Context(), messageID, user.UserID, emoji); err != nil {
		s.logger.Error("Failed to remove reaction", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to remove reaction")
		return
	}

	s.respondJSON(w, http.StatusNoContent, nil)
}

// ============================================================================
// Direct Message Handlers
// ============================================================================

func (s *Server) createDirectMessage(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)

	var req struct {
		UserID uuid.UUID `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	channel, err := s.repo.GetOrCreateDirectChannel(r.Context(), user.OrganizationID, []uuid.UUID{user.UserID, req.UserID})
	if err != nil {
		s.logger.Error("Failed to create DM channel", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to create direct message")
		return
	}

	s.respondJSON(w, http.StatusOK, channel)
}

func (s *Server) getDirectMessages(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	otherUserID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	channel, err := s.repo.GetOrCreateDirectChannel(r.Context(), user.OrganizationID, []uuid.UUID{user.UserID, otherUserID})
	if err != nil {
		s.respondError(w, http.StatusNotFound, "conversation not found")
		return
	}

	messages, err := s.repo.ListMessages(r.Context(), channel.ID, 50, nil)
	if err != nil {
		s.logger.Error("Failed to get DM messages", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to get messages")
		return
	}

	s.respondJSON(w, http.StatusOK, map[string]interface{}{
		"channel":  channel,
		"messages": messages,
	})
}

// ============================================================================
// User Handlers
// ============================================================================

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)

	users, err := s.repo.GetOrganizationUsers(r.Context(), user.OrganizationID)
	if err != nil {
		s.logger.Error("Failed to list users", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to list users")
		return
	}

	// Add online status
	for i := range users {
		if s.hub.IsUserOnline(users[i].ID) {
			users[i].Status = "online"
		}
	}

	s.respondJSON(w, http.StatusOK, map[string]interface{}{
		"users": users,
		"total": len(users),
	})
}

func (s *Server) getUser(w http.ResponseWriter, r *http.Request) {
	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	userInfo, err := s.repo.GetUser(r.Context(), userID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, "user not found")
		return
	}

	if s.hub.IsUserOnline(userID) {
		userInfo.Status = "online"
	}

	s.respondJSON(w, http.StatusOK, userInfo)
}

func (s *Server) getPresence(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)

	onlineUsers := s.hub.GetOnlineUsers(user.OrganizationID)

	presences := make([]models.Presence, len(onlineUsers))
	for i, uid := range onlineUsers {
		presences[i] = models.Presence{
			UserID: uid,
			Status: "online",
		}
	}

	s.respondJSON(w, http.StatusOK, map[string]interface{}{
		"presences": presences,
		"total":     len(presences),
	})
}

func (s *Server) updateStatus(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)

	var req struct {
		Status     string `json:"status"`
		StatusText string `json:"status_text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	validStatuses := map[string]bool{"online": true, "away": true, "dnd": true, "offline": true}
	if !validStatuses[req.Status] {
		s.respondError(w, http.StatusBadRequest, "invalid status")
		return
	}

	if err := s.repo.UpdateUserStatus(r.Context(), user.UserID, req.Status, req.StatusText); err != nil {
		s.logger.Error("Failed to update status", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "failed to update status")
		return
	}

	// Broadcast presence update
	s.hub.BroadcastMessage(uuid.Nil, &models.Message{
		ContentType: "presence",
		Metadata: models.JSONMap{
			"user_id":     user.UserID,
			"status":      req.Status,
			"status_text": req.StatusText,
		},
	})

	s.respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ============================================================================
// Search Handler
// ============================================================================

func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)
	query := r.URL.Query().Get("q")

	// Validate and sanitize search query
	validatedQuery, err := validateSearchQuery(query)
	if err != nil {
		s.respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	messages, err := s.repo.SearchMessages(r.Context(), user.OrganizationID, user.UserID, validatedQuery, 50)
	if err != nil {
		s.logger.Error("Failed to search", zap.Error(err))
		s.respondError(w, http.StatusInternalServerError, "search failed")
		return
	}

	s.respondJSON(w, http.StatusOK, models.SearchResult{
		Messages: messages,
		Total:    len(messages),
	})
}

// ============================================================================
// File Upload Handler
// ============================================================================

// Allowed file types for upload (prevent dangerous file types)
var allowedContentTypes = map[string]bool{
	"image/jpeg":      true,
	"image/png":       true,
	"image/gif":       true,
	"image/webp":      true,
	"application/pdf": true,
	"text/plain":      true,
	"text/csv":        true,
	"application/json": true,
	"application/msword": true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
	"application/vnd.ms-excel": true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true,
}

func (s *Server) uploadFile(w http.ResponseWriter, r *http.Request) {
	user := s.getUserFromContext(r)

	// Parse multipart form
	if err := r.ParseMultipartForm(s.cfg.Limits.MaxFileSize); err != nil {
		s.respondError(w, http.StatusBadRequest, "file too large")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		s.respondError(w, http.StatusBadRequest, "missing file")
		return
	}
	defer file.Close()

	// Validate content type
	contentType := header.Header.Get("Content-Type")
	if !allowedContentTypes[contentType] {
		s.respondError(w, http.StatusBadRequest, "file type not allowed")
		return
	}

	// Sanitize filename
	sanitizedFilename := sanitizeString(header.Filename)
	if sanitizedFilename == "" {
		s.respondError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	// Validate file size
	if header.Size > s.cfg.Limits.MaxFileSize {
		s.respondError(w, http.StatusBadRequest, "file too large")
		return
	}

	// Generate unique file ID
	fileID := uuid.New()

	// Note: Storage upload is configured via storage service
	// When storage is configured, files are uploaded to S3/MinIO
	// For now, return the file metadata for client-side handling
	attachment := &models.Attachment{
		ID:          fileID,
		FileName:    sanitizedFilename,
		FileSize:    header.Size,
		ContentType: contentType,
		URL:         "/api/v1/files/" + fileID.String() + "/" + sanitizedFilename,
	}

	s.logger.Info("File upload processed",
		zap.String("user_id", user.UserID.String()),
		zap.String("file_id", fileID.String()),
		zap.String("filename", sanitizedFilename),
		zap.Int64("size", header.Size),
		zap.String("content_type", contentType),
	)

	s.respondJSON(w, http.StatusOK, attachment)
}

// ============================================================================
// WebSocket Handler
// ============================================================================

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Get token from query parameter for WebSocket
	token := r.URL.Query().Get("token")
	if token == "" {
		s.respondError(w, http.StatusUnauthorized, "missing token")
		return
	}

	// Validate token
	claims, err := s.validateToken(token)
	if err != nil {
		s.respondError(w, http.StatusUnauthorized, "invalid token")
		return
	}

	// Create upgrader with proper origin checking
	upgrader := s.createUpgrader()

	// Upgrade connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.logger.Error("WebSocket upgrade failed", zap.Error(err))
		return
	}

	// Create client
	client := hub.NewClient(s.hub, conn, claims.UserID, claims.OrganizationID)

	// Register with hub
	s.hub.Register(client)

	// Start read/write pumps
	go client.WritePump(s.logger)
	go client.ReadPump(s.logger)
}

func (s *Server) validateToken(tokenString string) (*UserClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return []byte(s.cfg.Auth.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return nil, err
	}

	claims := token.Claims.(jwt.MapClaims)
	userID, _ := uuid.Parse(claims["user_id"].(string))
	orgID, _ := uuid.Parse(claims["organization_id"].(string))

	return &UserClaims{
		UserID:         userID,
		OrganizationID: orgID,
		Email:          claims["email"].(string),
	}, nil
}
