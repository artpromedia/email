package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/enterprise-email/storage/config"
	"github.com/enterprise-email/storage/models"
)

// DomainAwareStorage implements DomainStorageService
type DomainAwareStorage struct {
	storage    *S3StorageService
	quotaSvc   QuotaService
	dedupSvc   DeduplicationService
	cfg        *config.Config
	logger     zerolog.Logger
}

// NewDomainAwareStorage creates a new domain-aware storage service
func NewDomainAwareStorage(
	storage *S3StorageService,
	quotaSvc QuotaService,
	dedupSvc DeduplicationService,
	cfg *config.Config,
	logger zerolog.Logger,
) *DomainAwareStorage {
	return &DomainAwareStorage{
		storage:  storage,
		quotaSvc: quotaSvc,
		dedupSvc: dedupSvc,
		cfg:      cfg,
		logger:   logger.With().Str("component", "domain_storage").Logger(),
	}
}

// Delegate basic operations to underlying storage
func (d *DomainAwareStorage) Put(ctx context.Context, key string, reader io.Reader, size int64, contentType string, metadata map[string]string) error {
	return d.storage.Put(ctx, key, reader, size, contentType, metadata)
}

func (d *DomainAwareStorage) Get(ctx context.Context, key string) (io.ReadCloser, *models.StorageObject, error) {
	return d.storage.Get(ctx, key)
}

func (d *DomainAwareStorage) Delete(ctx context.Context, key string) error {
	return d.storage.Delete(ctx, key)
}

func (d *DomainAwareStorage) Exists(ctx context.Context, key string) (bool, error) {
	return d.storage.Exists(ctx, key)
}

func (d *DomainAwareStorage) GetMetadata(ctx context.Context, key string) (*models.StorageObject, error) {
	return d.storage.GetMetadata(ctx, key)
}

func (d *DomainAwareStorage) List(ctx context.Context, prefix string, maxKeys int, startAfter string) (*models.ListResponse, error) {
	return d.storage.List(ctx, prefix, maxKeys, startAfter)
}

func (d *DomainAwareStorage) ListAll(ctx context.Context, prefix string) ([]*models.StorageObject, error) {
	return d.storage.ListAll(ctx, prefix)
}

func (d *DomainAwareStorage) GetPresignedUploadURL(ctx context.Context, key string, contentType string, expiry time.Duration) (string, error) {
	return d.storage.GetPresignedUploadURL(ctx, key, contentType, expiry)
}

func (d *DomainAwareStorage) GetPresignedDownloadURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	return d.storage.GetPresignedDownloadURL(ctx, key, expiry)
}

func (d *DomainAwareStorage) Copy(ctx context.Context, sourceKey, destKey string) error {
	return d.storage.Copy(ctx, sourceKey, destKey)
}

func (d *DomainAwareStorage) Move(ctx context.Context, sourceKey, destKey string) error {
	return d.storage.Move(ctx, sourceKey, destKey)
}

func (d *DomainAwareStorage) DeleteMultiple(ctx context.Context, keys []string) (int, []error) {
	return d.storage.DeleteMultiple(ctx, keys)
}

func (d *DomainAwareStorage) DeleteByPrefix(ctx context.Context, prefix string) (int, []error) {
	return d.storage.DeleteByPrefix(ctx, prefix)
}

func (d *DomainAwareStorage) InitiateMultipartUpload(ctx context.Context, key string, contentType string) (string, error) {
	return d.storage.InitiateMultipartUpload(ctx, key, contentType)
}

func (d *DomainAwareStorage) UploadPart(ctx context.Context, key string, uploadID string, partNumber int, reader io.Reader, size int64) (string, error) {
	return d.storage.UploadPart(ctx, key, uploadID, partNumber, reader, size)
}

func (d *DomainAwareStorage) CompleteMultipartUpload(ctx context.Context, key string, uploadID string, parts []CompletedPart) error {
	return d.storage.CompleteMultipartUpload(ctx, key, uploadID, parts)
}

func (d *DomainAwareStorage) AbortMultipartUpload(ctx context.Context, key string, uploadID string) error {
	return d.storage.AbortMultipartUpload(ctx, key, uploadID)
}

func (d *DomainAwareStorage) GetBucketSize(ctx context.Context) (int64, error) {
	return d.storage.GetBucketSize(ctx)
}

func (d *DomainAwareStorage) GetPrefixSize(ctx context.Context, prefix string) (int64, error) {
	return d.storage.GetPrefixSize(ctx, prefix)
}

// StoreMessage stores an email message with domain-partitioned key
func (d *DomainAwareStorage) StoreMessage(ctx context.Context, req *StoreMessageRequest) (*models.StorageObject, error) {
	// Check quota first
	if d.quotaSvc != nil {
		quotaCheck, err := d.quotaSvc.CheckQuota(ctx, req.MailboxID, req.Size)
		if err != nil {
			return nil, fmt.Errorf("failed to check quota: %w", err)
		}
		if !quotaCheck.Allowed {
			return nil, fmt.Errorf("quota exceeded: %s", quotaCheck.Message)
		}
	}

	// Generate storage key
	timestamp := time.Now()
	if req.Metadata != nil && !req.Metadata.Date.IsZero() {
		timestamp = req.Metadata.Date
	}
	
	key := models.NewMessageKey(req.OrgID, req.DomainID, req.UserID, req.MessageID, timestamp)
	storageKey := key.String()

	// Prepare metadata
	metadata := make(map[string]string)
	metadata["org_id"] = req.OrgID
	metadata["domain_id"] = req.DomainID
	metadata["user_id"] = req.UserID
	metadata["mailbox_id"] = req.MailboxID
	metadata["folder_id"] = req.FolderID
	metadata["message_id"] = req.MessageID

	if req.Metadata != nil {
		if metaJSON, err := json.Marshal(req.Metadata); err == nil {
			metadata["message_metadata"] = string(metaJSON)
		}
	}

	// Store the message
	if err := d.storage.Put(ctx, storageKey, req.Content, req.Size, req.ContentType, metadata); err != nil {
		return nil, fmt.Errorf("failed to store message: %w", err)
	}

	// Update quota
	if d.quotaSvc != nil {
		if err := d.quotaSvc.UpdateUsage(ctx, req.MailboxID, req.Size); err != nil {
			d.logger.Error().Err(err).Str("mailbox_id", req.MailboxID).Msg("Failed to update quota")
		}
	}

	d.logger.Info().
		Str("key", storageKey).
		Str("org_id", req.OrgID).
		Str("domain_id", req.DomainID).
		Str("user_id", req.UserID).
		Int64("size", req.Size).
		Msg("Stored message")

	return &models.StorageObject{
		Key:          storageKey,
		Size:         req.Size,
		ContentType:  req.ContentType,
		LastModified: time.Now(),
		Metadata:     metadata,
	}, nil
}

// GetMessage retrieves an email message
func (d *DomainAwareStorage) GetMessage(ctx context.Context, orgID, domainID, userID, messageID string) (io.ReadCloser, *models.MessageMetadata, error) {
	// We need to find the message key - it includes year/month which we may not know
	// Try to find it by listing with prefix
	prefix := fmt.Sprintf("%s/%s/%s/messages/", orgID, domainID, userID)
	
	objects, err := d.storage.ListAll(ctx, prefix)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to list messages: %w", err)
	}

	// Find the message by ID (it's the last part of the key)
	var messageKey string
	for _, obj := range objects {
		if obj.Key[len(obj.Key)-len(messageID):] == messageID {
			messageKey = obj.Key
			break
		}
	}

	if messageKey == "" {
		return nil, nil, fmt.Errorf("message not found: %s", messageID)
	}

	reader, obj, err := d.storage.Get(ctx, messageKey)
	if err != nil {
		return nil, nil, err
	}

	// Parse metadata
	var metadata *models.MessageMetadata
	if metaJSON, ok := obj.Metadata["message_metadata"]; ok {
		metadata = &models.MessageMetadata{}
		if err := json.Unmarshal([]byte(metaJSON), metadata); err != nil {
			d.logger.Warn().Err(err).Str("key", messageKey).Msg("Failed to parse message metadata")
		}
	}

	return reader, metadata, nil
}

// DeleteMessage deletes an email message
func (d *DomainAwareStorage) DeleteMessage(ctx context.Context, orgID, domainID, userID, messageID string) error {
	// Find the message first to get its size for quota update
	prefix := fmt.Sprintf("%s/%s/%s/messages/", orgID, domainID, userID)
	objects, err := d.storage.ListAll(ctx, prefix)
	if err != nil {
		return fmt.Errorf("failed to list messages: %w", err)
	}

	var messageKey string
	var messageSize int64
	for _, obj := range objects {
		if obj.Key[len(obj.Key)-len(messageID):] == messageID {
			messageKey = obj.Key
			messageSize = obj.Size
			break
		}
	}

	if messageKey == "" {
		return fmt.Errorf("message not found: %s", messageID)
	}

	// Get metadata for mailbox ID
	objMeta, err := d.storage.GetMetadata(ctx, messageKey)
	if err != nil {
		return fmt.Errorf("failed to get message metadata: %w", err)
	}

	// Delete the message
	if err := d.storage.Delete(ctx, messageKey); err != nil {
		return err
	}

	// Update quota
	if d.quotaSvc != nil && objMeta.Metadata != nil {
		if mailboxID, ok := objMeta.Metadata["mailbox_id"]; ok {
			if err := d.quotaSvc.UpdateUsage(ctx, mailboxID, -messageSize); err != nil {
				d.logger.Error().Err(err).Str("mailbox_id", mailboxID).Msg("Failed to update quota after delete")
			}
		}
	}

	d.logger.Info().
		Str("key", messageKey).
		Str("message_id", messageID).
		Int64("size", messageSize).
		Msg("Deleted message")

	return nil
}

// StoreAttachment stores an attachment with deduplication
func (d *DomainAwareStorage) StoreAttachment(ctx context.Context, req *StoreAttachmentRequest) (*models.AttachmentMetadata, error) {
	attachmentID := uuid.New().String()

	// Check for deduplication if enabled
	if d.dedupSvc != nil && d.cfg.DeduplicationEnabled && req.ContentHash != "" {
		dedupResult, err := d.dedupSvc.CheckDuplicate(ctx, req.OrgID, req.ContentHash)
		if err != nil {
			d.logger.Warn().Err(err).Msg("Deduplication check failed, proceeding with storage")
		} else if dedupResult.IsDuplicate {
			// Create reference to existing attachment
			ref := &models.AttachmentReference{
				ID:          attachmentID,
				DedupID:     dedupResult.Existing.ID,
				OrgID:       req.OrgID,
				DomainID:    req.DomainID,
				UserID:      req.UserID,
				MessageID:   req.MessageID,
				Filename:    req.Filename,
				ContentType: req.ContentType,
				Size:        req.Size,
				CreatedAt:   time.Now(),
			}

			if err := d.dedupSvc.AddReference(ctx, dedupResult.Existing.ID, ref); err != nil {
				d.logger.Warn().Err(err).Msg("Failed to add dedup reference, storing new copy")
			} else {
				d.logger.Info().
					Str("attachment_id", attachmentID).
					Str("dedup_id", dedupResult.Existing.ID).
					Int64("space_saved", dedupResult.SpaceSaved).
					Msg("Deduplicated attachment")

				return &models.AttachmentMetadata{
					AttachmentID: attachmentID,
					MessageID:    req.MessageID,
					OrgID:        req.OrgID,
					DomainID:     req.DomainID,
					UserID:       req.UserID,
					Filename:     req.Filename,
					ContentType:  req.ContentType,
					Size:         req.Size,
					ContentHash:  req.ContentHash,
					RefCount:     dedupResult.Existing.RefCount + 1,
					CreatedAt:    time.Now(),
				}, nil
			}
		}
	}

	// Generate storage key
	key := models.NewAttachmentKey(req.OrgID, req.DomainID, req.UserID, attachmentID)
	storageKey := key.String()

	// Prepare metadata
	metadata := make(map[string]string)
	metadata["org_id"] = req.OrgID
	metadata["domain_id"] = req.DomainID
	metadata["user_id"] = req.UserID
	metadata["message_id"] = req.MessageID
	metadata["attachment_id"] = attachmentID
	metadata["filename"] = req.Filename
	if req.ContentHash != "" {
		metadata["content_hash"] = req.ContentHash
	}

	// Store the attachment
	if err := d.storage.Put(ctx, storageKey, req.Content, req.Size, req.ContentType, metadata); err != nil {
		return nil, fmt.Errorf("failed to store attachment: %w", err)
	}

	// Register with deduplication service if enabled
	if d.dedupSvc != nil && d.cfg.DeduplicationEnabled && req.ContentHash != "" {
		dedup := &models.DeduplicatedAttachment{
			ID:          uuid.New().String(),
			OrgID:       req.OrgID,
			ContentHash: req.ContentHash,
			StorageKey:  storageKey,
			Size:        req.Size,
			ContentType: req.ContentType,
			RefCount:    1,
			FirstSeenAt: time.Now(),
			LastSeenAt:  time.Now(),
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		ref := &models.AttachmentReference{
			ID:          attachmentID,
			DedupID:     dedup.ID,
			OrgID:       req.OrgID,
			DomainID:    req.DomainID,
			UserID:      req.UserID,
			MessageID:   req.MessageID,
			Filename:    req.Filename,
			ContentType: req.ContentType,
			Size:        req.Size,
			CreatedAt:   time.Now(),
		}

		if err := d.dedupSvc.RegisterAttachment(ctx, dedup, ref); err != nil {
			d.logger.Warn().Err(err).Msg("Failed to register attachment for deduplication")
		}
	}

	d.logger.Info().
		Str("key", storageKey).
		Str("attachment_id", attachmentID).
		Str("filename", req.Filename).
		Int64("size", req.Size).
		Msg("Stored attachment")

	return &models.AttachmentMetadata{
		AttachmentID: attachmentID,
		MessageID:    req.MessageID,
		OrgID:        req.OrgID,
		DomainID:     req.DomainID,
		UserID:       req.UserID,
		Filename:     req.Filename,
		ContentType:  req.ContentType,
		Size:         req.Size,
		ContentHash:  req.ContentHash,
		RefCount:     1,
		CreatedAt:    time.Now(),
	}, nil
}

// GetAttachment retrieves an attachment
func (d *DomainAwareStorage) GetAttachment(ctx context.Context, orgID, domainID, userID, attachmentID string) (io.ReadCloser, *models.AttachmentMetadata, error) {
	// First check if it's a deduplicated attachment
	if d.dedupSvc != nil {
		dedup, ref, err := d.dedupSvc.GetByReference(ctx, attachmentID)
		if err == nil && dedup != nil {
			reader, _, err := d.storage.Get(ctx, dedup.StorageKey)
			if err != nil {
				return nil, nil, err
			}

			return reader, &models.AttachmentMetadata{
				AttachmentID: attachmentID,
				MessageID:    ref.MessageID,
				OrgID:        ref.OrgID,
				DomainID:     ref.DomainID,
				UserID:       ref.UserID,
				Filename:     ref.Filename,
				ContentType:  dedup.ContentType,
				Size:         dedup.Size,
				ContentHash:  dedup.ContentHash,
				RefCount:     dedup.RefCount,
				CreatedAt:    ref.CreatedAt,
			}, nil
		}
	}

	// Direct storage lookup
	key := models.NewAttachmentKey(orgID, domainID, userID, attachmentID)
	storageKey := key.String()

	reader, obj, err := d.storage.Get(ctx, storageKey)
	if err != nil {
		return nil, nil, err
	}

	metadata := &models.AttachmentMetadata{
		AttachmentID: attachmentID,
		OrgID:        orgID,
		DomainID:     domainID,
		UserID:       userID,
		ContentType:  obj.ContentType,
		Size:         obj.Size,
		CreatedAt:    obj.LastModified,
	}

	if obj.Metadata != nil {
		metadata.MessageID = obj.Metadata["message_id"]
		metadata.Filename = obj.Metadata["filename"]
		metadata.ContentHash = obj.Metadata["content_hash"]
	}

	return reader, metadata, nil
}

// DeleteAttachment deletes an attachment
func (d *DomainAwareStorage) DeleteAttachment(ctx context.Context, orgID, domainID, userID, attachmentID string) error {
	// Check deduplication first
	if d.dedupSvc != nil {
		if err := d.dedupSvc.RemoveReference(ctx, attachmentID); err == nil {
			d.logger.Info().
				Str("attachment_id", attachmentID).
				Msg("Removed deduplicated attachment reference")
			return nil
		}
	}

	// Direct delete
	key := models.NewAttachmentKey(orgID, domainID, userID, attachmentID)
	return d.storage.Delete(ctx, key.String())
}

// GetDomainSize returns the total size and count of objects in a domain
func (d *DomainAwareStorage) GetDomainSize(ctx context.Context, orgID, domainID string) (int64, int64, error) {
	prefix := fmt.Sprintf("%s/%s/", orgID, domainID)
	objects, err := d.storage.ListAll(ctx, prefix)
	if err != nil {
		return 0, 0, err
	}

	var totalSize int64
	for _, obj := range objects {
		totalSize += obj.Size
	}

	return totalSize, int64(len(objects)), nil
}

// GetUserSize returns the total size and count of objects for a user
func (d *DomainAwareStorage) GetUserSize(ctx context.Context, orgID, domainID, userID string) (int64, int64, error) {
	prefix := fmt.Sprintf("%s/%s/%s/", orgID, domainID, userID)
	objects, err := d.storage.ListAll(ctx, prefix)
	if err != nil {
		return 0, 0, err
	}

	var totalSize int64
	for _, obj := range objects {
		totalSize += obj.Size
	}

	return totalSize, int64(len(objects)), nil
}

// CopyBetweenDomains copies objects between domains
func (d *DomainAwareStorage) CopyBetweenDomains(ctx context.Context, req *models.CopyRequest) error {
	// Check destination quota
	if d.quotaSvc != nil {
		// Get source object size
		obj, err := d.storage.GetMetadata(ctx, req.SourceKey)
		if err != nil {
			return fmt.Errorf("failed to get source object: %w", err)
		}

		quotaCheck, err := d.quotaSvc.CheckQuota(ctx, req.DestMailboxID, obj.Size)
		if err != nil {
			return fmt.Errorf("failed to check destination quota: %w", err)
		}
		if !quotaCheck.Allowed {
			return fmt.Errorf("destination quota exceeded: %s", quotaCheck.Message)
		}
	}

	// Generate destination key
	destKey := models.NewMessageKey(req.DestOrgID, req.DestDomainID, req.DestUserID, uuid.New().String(), time.Now())

	// Copy the object
	if err := d.storage.Copy(ctx, req.SourceKey, destKey.String()); err != nil {
		return err
	}

	// Update destination quota
	if d.quotaSvc != nil {
		obj, _ := d.storage.GetMetadata(ctx, req.SourceKey)
		if obj != nil {
			if err := d.quotaSvc.UpdateUsage(ctx, req.DestMailboxID, obj.Size); err != nil {
				d.logger.Error().Err(err).Msg("Failed to update destination quota")
			}
		}
	}

	d.logger.Info().
		Str("source", req.SourceKey).
		Str("dest", destKey.String()).
		Str("source_domain", req.SourceDomainID).
		Str("dest_domain", req.DestDomainID).
		Msg("Copied between domains")

	return nil
}

// MoveBetweenDomains moves objects between domains
func (d *DomainAwareStorage) MoveBetweenDomains(ctx context.Context, req *models.MoveRequest) error {
	// Get source object size for quota updates
	obj, err := d.storage.GetMetadata(ctx, req.SourceKey)
	if err != nil {
		return fmt.Errorf("failed to get source object: %w", err)
	}

	// Check destination quota
	if d.quotaSvc != nil {
		quotaCheck, err := d.quotaSvc.CheckQuota(ctx, req.DestMailboxID, obj.Size)
		if err != nil {
			return fmt.Errorf("failed to check destination quota: %w", err)
		}
		if !quotaCheck.Allowed {
			return fmt.Errorf("destination quota exceeded: %s", quotaCheck.Message)
		}
	}

	// Copy first
	if err := d.CopyBetweenDomains(ctx, &req.CopyRequest); err != nil {
		return err
	}

	// Delete source if requested
	if req.DeleteSource {
		if err := d.storage.Delete(ctx, req.SourceKey); err != nil {
			d.logger.Error().Err(err).Str("key", req.SourceKey).Msg("Failed to delete source after move")
			return err
		}

		// Update source quota
		if d.quotaSvc != nil && obj.Metadata != nil {
			if mailboxID, ok := obj.Metadata["mailbox_id"]; ok {
				if err := d.quotaSvc.UpdateUsage(ctx, mailboxID, -obj.Size); err != nil {
					d.logger.Error().Err(err).Msg("Failed to update source quota after move")
				}
			}
		}
	}

	return nil
}
