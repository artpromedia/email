package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"github.com/oonrumail/imap-server/types"
)

var (
	ErrNotFound     = errors.New("not found")
	ErrUnauthorized = errors.New("unauthorized")
)

// Repository handles all database operations
type Repository struct {
	db     *pgxpool.Pool
	logger *zap.Logger
}

// NewRepository creates a new repository
func NewRepository(db *pgxpool.Pool, logger *zap.Logger) *Repository {
	return &Repository{
		db:     db,
		logger: logger,
	}
}

// GetUserByEmail returns a user by any of their email addresses
func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*types.User, error) {
	// First try primary email
	query := `
		SELECT u.id, u.organization_id, u.email, u.display_name, u.password_hash,
		       (u.status = 'active') as is_active, u.created_at, u.updated_at, u.last_login_at
		FROM users u
		WHERE u.email = $1 AND u.status = 'active'
	`

	var user types.User
	var lastLoginAt *time.Time

	err := r.db.QueryRow(ctx, query, strings.ToLower(email)).Scan(
		&user.ID, &user.OrganizationID, &user.Email, &user.DisplayName, &user.PasswordHash,
		&user.IsActive, &user.CreatedAt, &user.UpdatedAt, &lastLoginAt,
	)

	if err == nil {
		user.LastLoginAt = lastLoginAt
		user.Emails, _ = r.GetUserEmails(ctx, user.ID)
		return &user, nil
	}

	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("query user by email: %w", err)
	}

	// Try mailbox email
	query = `
		SELECT u.id, u.organization_id, u.email, u.display_name, u.password_hash,
		       (u.status = 'active') as is_active, u.created_at, u.updated_at, u.last_login_at
		FROM users u
		JOIN mailboxes m ON m.user_id = u.id
		WHERE m.email = $1 AND u.status = 'active'
	`

	err = r.db.QueryRow(ctx, query, strings.ToLower(email)).Scan(
		&user.ID, &user.OrganizationID, &user.Email, &user.DisplayName, &user.PasswordHash,
		&user.IsActive, &user.CreatedAt, &user.UpdatedAt, &lastLoginAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query user by mailbox email: %w", err)
	}

	user.LastLoginAt = lastLoginAt
	user.Emails, _ = r.GetUserEmails(ctx, user.ID)
	return &user, nil
}

// GetUserEmails returns all email addresses for a user
func (r *Repository) GetUserEmails(ctx context.Context, userID string) ([]string, error) {
	query := `
		SELECT m.email FROM mailboxes m
		WHERE m.user_id = $1
		ORDER BY m.email ASC
	`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("query user emails: %w", err)
	}
	defer rows.Close()

	var emails []string
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			return nil, fmt.Errorf("scan email: %w", err)
		}
		emails = append(emails, email)
	}

	return emails, rows.Err()
}

// GetOrganization returns an organization by ID
func (r *Repository) GetOrganization(ctx context.Context, orgID string) (*types.Organization, error) {
	query := `
		SELECT id, name, slug, is_active, created_at
		FROM organizations
		WHERE id = $1
	`

	var org types.Organization
	err := r.db.QueryRow(ctx, query, orgID).Scan(
		&org.ID, &org.Name, &org.Slug, &org.IsActive, &org.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query organization: %w", err)
	}

	return &org, nil
}

// GetUserMailboxes returns all mailboxes accessible to a user
func (r *Repository) GetUserMailboxes(ctx context.Context, userID string) ([]*types.Mailbox, error) {
	query := `
		SELECT m.id, m.user_id, m.domain_id, m.email, m.display_name,
		       m.quota_bytes, m.used_bytes, 0 as message_count, 0 as unread_count,
		       true as is_primary, false as is_shared, 'unified' as namespace_mode, m.created_at, m.updated_at,
		       d.id as domain_id, d.name as domain_name, d.display_name as domain_display_name,
		       d.is_primary as domain_is_primary, d.organization_id
		FROM mailboxes m
		JOIN domains d ON d.id = m.domain_id
		WHERE m.user_id = $1
		ORDER BY d.name ASC
	`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("query user mailboxes: %w", err)
	}
	defer rows.Close()

	var mailboxes []*types.Mailbox
	for rows.Next() {
		var m types.Mailbox
		var d types.Domain
		var nsMode string

		err := rows.Scan(
			&m.ID, &m.UserID, &m.DomainID, &m.Email, &m.DisplayName,
			&m.QuotaBytes, &m.StorageUsed, &m.MessageCount, &m.UnreadCount,
			&m.IsPrimary, &m.IsShared, &nsMode, &m.CreatedAt, &m.UpdatedAt,
			&d.ID, &d.Name, &d.DisplayName, &d.IsPrimary, &d.OrganizationID,
		)
		if err != nil {
			return nil, fmt.Errorf("scan mailbox: %w", err)
		}

		m.NamespaceMode = types.NamespaceMode(nsMode)
		m.Domain = &d
		mailboxes = append(mailboxes, &m)
	}

	return mailboxes, rows.Err()
}

// GetSharedMailboxes returns shared mailboxes a user has access to
func (r *Repository) GetSharedMailboxes(ctx context.Context, userID string) ([]*types.Mailbox, error) {
	query := `
		SELECT m.id, m.user_id, m.domain_id, m.email, m.display_name,
		       m.quota_bytes, m.used_bytes, 0 as message_count, 0 as unread_count,
		       false as is_primary, true as is_shared, 'unified' as namespace_mode, m.created_at, m.updated_at,
		       d.id, d.name, d.display_name, d.is_primary, d.organization_id,
		       sma.permissions
		FROM shared_mailbox_access sma
		JOIN mailboxes m ON m.id = sma.mailbox_id
		JOIN domains d ON d.id = m.domain_id
		WHERE sma.user_id = $1
		  AND (sma.expires_at IS NULL OR sma.expires_at > NOW())
		ORDER BY d.name, m.email
	`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("query shared mailboxes: %w", err)
	}
	defer rows.Close()

	var mailboxes []*types.Mailbox
	for rows.Next() {
		var m types.Mailbox
		var d types.Domain
		var nsMode string
		var permissionsJSON []byte

		err := rows.Scan(
			&m.ID, &m.UserID, &m.DomainID, &m.Email, &m.DisplayName,
			&m.QuotaBytes, &m.StorageUsed, &m.MessageCount, &m.UnreadCount,
			&m.IsPrimary, &m.IsShared, &nsMode, &m.CreatedAt, &m.UpdatedAt,
			&d.ID, &d.Name, &d.DisplayName, &d.IsPrimary, &d.OrganizationID,
			&permissionsJSON,
		)
		if err != nil {
			return nil, fmt.Errorf("scan shared mailbox: %w", err)
		}

		m.NamespaceMode = types.NamespaceMode(nsMode)
		m.Domain = &d
		m.IsShared = true
		mailboxes = append(mailboxes, &m)
	}

	return mailboxes, rows.Err()
}

// GetMailboxFolders returns all folders for a mailbox
func (r *Repository) GetMailboxFolders(ctx context.Context, mailboxID string) ([]*types.Folder, error) {
	query := `
		SELECT id, mailbox_id, name, full_path, parent_id, special_use, attributes,
		       delimiter, uid_validity, uid_next, highest_modseq,
		       message_count, recent_count, unseen_count, first_unseen,
		       subscribed, selectable, created_at, updated_at
		FROM folders
		WHERE mailbox_id = $1
		ORDER BY
		    CASE WHEN special_use = '\\Inbox' THEN 0
		         WHEN special_use = '\\Sent' THEN 1
		         WHEN special_use = '\\Drafts' THEN 2
		         WHEN special_use = '\\Trash' THEN 3
		         WHEN special_use = '\\Junk' THEN 4
		         WHEN special_use = '\\Archive' THEN 5
		         ELSE 6 END,
		    name ASC
	`

	rows, err := r.db.Query(ctx, query, mailboxID)
	if err != nil {
		return nil, fmt.Errorf("query folders: %w", err)
	}
	defer rows.Close()

	var folders []*types.Folder
	for rows.Next() {
		var f types.Folder
		var specialUse *string
		var attributesJSON []byte

		err := rows.Scan(
			&f.ID, &f.MailboxID, &f.Name, &f.FullPath, &f.ParentID, &specialUse, &attributesJSON,
			&f.Delimiter, &f.UIDValidity, &f.UIDNext, &f.HighestModSeq,
			&f.MessageCount, &f.RecentCount, &f.UnseenCount, &f.FirstUnseen,
			&f.Subscribed, &f.Selectable, &f.CreatedAt, &f.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan folder: %w", err)
		}

		if specialUse != nil {
			su := types.SpecialUse(*specialUse)
			f.SpecialUse = &su
		}
		json.Unmarshal(attributesJSON, &f.Attributes)
		folders = append(folders, &f)
	}

	return folders, rows.Err()
}

// GetFolderByPath returns a folder by its full path
func (r *Repository) GetFolderByPath(ctx context.Context, mailboxID, path string) (*types.Folder, error) {
	query := `
		SELECT id, mailbox_id, name, full_path, parent_id, special_use, attributes,
		       delimiter, uid_validity, uid_next, highest_modseq,
		       message_count, recent_count, unseen_count, first_unseen,
		       subscribed, selectable, created_at, updated_at
		FROM folders
		WHERE mailbox_id = $1 AND full_path = $2
	`

	var f types.Folder
	var specialUse *string
	var attributesJSON []byte

	err := r.db.QueryRow(ctx, query, mailboxID, path).Scan(
		&f.ID, &f.MailboxID, &f.Name, &f.FullPath, &f.ParentID, &specialUse, &attributesJSON,
		&f.Delimiter, &f.UIDValidity, &f.UIDNext, &f.HighestModSeq,
		&f.MessageCount, &f.RecentCount, &f.UnseenCount, &f.FirstUnseen,
		&f.Subscribed, &f.Selectable, &f.CreatedAt, &f.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query folder by path: %w", err)
	}

	if specialUse != nil {
		su := types.SpecialUse(*specialUse)
		f.SpecialUse = &su
	}
	json.Unmarshal(attributesJSON, &f.Attributes)

	return &f, nil
}

// CreateFolder creates a new folder
func (r *Repository) CreateFolder(ctx context.Context, f *types.Folder) error {
	attributesJSON, _ := json.Marshal(f.Attributes)

	var specialUse *string
	if f.SpecialUse != nil {
		s := string(*f.SpecialUse)
		specialUse = &s
	}

	query := `
		INSERT INTO folders (
			id, mailbox_id, name, full_path, parent_id, special_use, attributes,
			delimiter, uid_validity, uid_next, highest_modseq,
			subscribed, selectable, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
		)
	`

	_, err := r.db.Exec(ctx, query,
		f.ID, f.MailboxID, f.Name, f.FullPath, f.ParentID, specialUse, attributesJSON,
		f.Delimiter, f.UIDValidity, f.UIDNext, f.HighestModSeq,
		f.Subscribed, f.Selectable, f.CreatedAt, f.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("create folder: %w", err)
	}

	return nil
}

// DeleteFolder deletes a folder
func (r *Repository) DeleteFolder(ctx context.Context, folderID string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM folders WHERE id = $1", folderID)
	return err
}

// RenameFolder renames a folder
func (r *Repository) RenameFolder(ctx context.Context, folderID, newName, newPath string) error {
	query := `UPDATE folders SET name = $2, full_path = $3, updated_at = NOW() WHERE id = $1`
	_, err := r.db.Exec(ctx, query, folderID, newName, newPath)
	return err
}

// GetMessages returns messages in a folder
func (r *Repository) GetMessages(ctx context.Context, folderID string, start, count int) ([]*types.Message, error) {
	query := `
		SELECT id, folder_id, mailbox_id, uid, sequence_num, message_id, in_reply_to,
		       subject, sender, recipients_to, recipients_cc, recipients_bcc, reply_to,
		       date, size, flags, modseq, body_path, headers_json, body_structure, envelope,
		       created_at
		FROM messages
		WHERE folder_id = $1
		ORDER BY sequence_num ASC
		OFFSET $2 LIMIT $3
	`

	rows, err := r.db.Query(ctx, query, folderID, start, count)
	if err != nil {
		return nil, fmt.Errorf("query messages: %w", err)
	}
	defer rows.Close()

	var messages []*types.Message
	for rows.Next() {
		var m types.Message
		var toJSON, ccJSON, bccJSON, flagsJSON []byte

		err := rows.Scan(
			&m.ID, &m.FolderID, &m.MailboxID, &m.UID, &m.SequenceNum, &m.MessageID, &m.InReplyTo,
			&m.Subject, &m.From, &toJSON, &ccJSON, &bccJSON, &m.ReplyTo,
			&m.Date, &m.Size, &flagsJSON, &m.ModSeq, &m.BodyPath, &m.HeadersJSON, &m.BodyStructure, &m.Envelope,
			&m.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}

		json.Unmarshal(toJSON, &m.To)
		json.Unmarshal(ccJSON, &m.Cc)
		json.Unmarshal(bccJSON, &m.Bcc)
		json.Unmarshal(flagsJSON, &m.Flags)
		messages = append(messages, &m)
	}

	return messages, rows.Err()
}

// GetMessageByUID returns a message by UID
func (r *Repository) GetMessageByUID(ctx context.Context, folderID string, uid uint32) (*types.Message, error) {
	query := `
		SELECT id, folder_id, mailbox_id, uid, sequence_num, message_id, in_reply_to,
		       subject, sender, recipients_to, recipients_cc, recipients_bcc, reply_to,
		       date, size, flags, modseq, body_path, headers_json, body_structure, envelope,
		       created_at
		FROM messages
		WHERE folder_id = $1 AND uid = $2
	`

	var m types.Message
	var toJSON, ccJSON, bccJSON, flagsJSON []byte

	err := r.db.QueryRow(ctx, query, folderID, uid).Scan(
		&m.ID, &m.FolderID, &m.MailboxID, &m.UID, &m.SequenceNum, &m.MessageID, &m.InReplyTo,
		&m.Subject, &m.From, &toJSON, &ccJSON, &bccJSON, &m.ReplyTo,
		&m.Date, &m.Size, &flagsJSON, &m.ModSeq, &m.BodyPath, &m.HeadersJSON, &m.BodyStructure, &m.Envelope,
		&m.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query message by uid: %w", err)
	}

	json.Unmarshal(toJSON, &m.To)
	json.Unmarshal(ccJSON, &m.Cc)
	json.Unmarshal(bccJSON, &m.Bcc)
	json.Unmarshal(flagsJSON, &m.Flags)

	return &m, nil
}

// UpdateMessageFlags updates message flags
func (r *Repository) UpdateMessageFlags(ctx context.Context, messageID string, flags []types.MessageFlag, modseq uint64) error {
	flagsJSON, _ := json.Marshal(flags)
	query := `UPDATE messages SET flags = $2, modseq = $3 WHERE id = $1`
	_, err := r.db.Exec(ctx, query, messageID, flagsJSON, modseq)
	return err
}

// CopyMessages copies messages to another folder
func (r *Repository) CopyMessages(ctx context.Context, srcFolderID, destFolderID string, uids []uint32) (map[uint32]uint32, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Get next UID for destination folder
	var nextUID uint32
	err = tx.QueryRow(ctx, "SELECT uid_next FROM folders WHERE id = $1 FOR UPDATE", destFolderID).Scan(&nextUID)
	if err != nil {
		return nil, err
	}

	uidMapping := make(map[uint32]uint32)

	for _, uid := range uids {
		// Get source message
		var m types.Message
		var toJSON, ccJSON, bccJSON, flagsJSON []byte

		err := tx.QueryRow(ctx, `
			SELECT id, mailbox_id, message_id, in_reply_to, subject, sender,
			       recipients_to, recipients_cc, recipients_bcc, reply_to,
			       date, size, flags, body_path, headers_json, body_structure, envelope
			FROM messages WHERE folder_id = $1 AND uid = $2
		`, srcFolderID, uid).Scan(
			&m.ID, &m.MailboxID, &m.MessageID, &m.InReplyTo, &m.Subject, &m.From,
			&toJSON, &ccJSON, &bccJSON, &m.ReplyTo,
			&m.Date, &m.Size, &flagsJSON, &m.BodyPath, &m.HeadersJSON, &m.BodyStructure, &m.Envelope,
		)
		if err != nil {
			continue
		}

		// Get destination mailbox ID from folder
		var destMailboxID string
		err = tx.QueryRow(ctx, "SELECT mailbox_id FROM folders WHERE id = $1", destFolderID).Scan(&destMailboxID)
		if err != nil {
			return nil, err
		}

		// Insert copy
		newID := fmt.Sprintf("%s-%d", m.ID, nextUID)
		_, err = tx.Exec(ctx, `
			INSERT INTO messages (
				id, folder_id, mailbox_id, uid, message_id, in_reply_to, subject, sender,
				recipients_to, recipients_cc, recipients_bcc, reply_to,
				date, size, flags, modseq, body_path, headers_json, body_structure, envelope, created_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 1, $16, $17, $18, $19, NOW()
			)
		`, newID, destFolderID, destMailboxID, nextUID, m.MessageID, m.InReplyTo, m.Subject, m.From,
			toJSON, ccJSON, bccJSON, m.ReplyTo, m.Date, m.Size, flagsJSON, m.BodyPath, m.HeadersJSON,
			m.BodyStructure, m.Envelope)
		if err != nil {
			return nil, err
		}

		uidMapping[uid] = nextUID
		nextUID++
	}

	// Update folder UID next
	_, err = tx.Exec(ctx, "UPDATE folders SET uid_next = $2, message_count = message_count + $3, updated_at = NOW() WHERE id = $1",
		destFolderID, nextUID, len(uidMapping))
	if err != nil {
		return nil, err
	}

	return uidMapping, tx.Commit(ctx)
}

// MoveMessages moves messages to another folder
func (r *Repository) MoveMessages(ctx context.Context, srcFolderID, destFolderID string, uids []uint32) (map[uint32]uint32, error) {
	// Copy first
	uidMapping, err := r.CopyMessages(ctx, srcFolderID, destFolderID, uids)
	if err != nil {
		return nil, err
	}

	// Then delete from source
	for _, uid := range uids {
		_, err = r.db.Exec(ctx, "DELETE FROM messages WHERE folder_id = $1 AND uid = $2", srcFolderID, uid)
		if err != nil {
			r.logger.Error("Failed to delete moved message", zap.Uint32("uid", uid), zap.Error(err))
		}
	}

	// Update source folder message count
	_, err = r.db.Exec(ctx, "UPDATE folders SET message_count = message_count - $2, updated_at = NOW() WHERE id = $1",
		srcFolderID, len(uids))

	return uidMapping, err
}

// GetQuota returns quota information for a mailbox
func (r *Repository) GetQuota(ctx context.Context, mailboxID string) (*types.Quota, error) {
	query := `
		SELECT m.id, d.name, m.storage_used_bytes, m.quota_bytes
		FROM mailboxes m
		JOIN domains d ON d.id = m.domain_id
		WHERE m.id = $1
	`

	var quota types.Quota
	quota.ResourceName = "STORAGE"

	err := r.db.QueryRow(ctx, query, mailboxID).Scan(
		&quota.MailboxID, &quota.DomainName, &quota.Usage, &quota.Limit,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query quota: %w", err)
	}

	return &quota, nil
}

// CheckMailboxAccess checks if user has permission to access a mailbox
func (r *Repository) CheckMailboxAccess(ctx context.Context, userID, mailboxID string, permission types.Permission) (bool, error) {
	// Check if it's the user's own mailbox
	var count int
	err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM mailboxes WHERE id = $1 AND user_id = $2", mailboxID, userID).Scan(&count)
	if err != nil {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	// Check shared access
	query := `
		SELECT COUNT(*) FROM shared_mailbox_access
		WHERE mailbox_id = $1 AND user_id = $2
		  AND (expires_at IS NULL OR expires_at > NOW())
		  AND (permissions @> $3::jsonb OR permissions @> '"admin"'::jsonb)
	`

	permJSON := fmt.Sprintf(`["%s"]`, permission)
	err = r.db.QueryRow(ctx, query, mailboxID, userID, permJSON).Scan(&count)
	if err != nil {
		return false, err
	}

	return count > 0, nil
}

// UpdateLastLogin updates user's last login timestamp
func (r *Repository) UpdateLastLogin(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, "UPDATE users SET last_login_at = NOW() WHERE id = $1", userID)
	return err
}

// IncrementModSeq increments the highest modseq for a folder
func (r *Repository) IncrementModSeq(ctx context.Context, folderID string) (uint64, error) {
	var modseq uint64
	err := r.db.QueryRow(ctx, `
		UPDATE folders SET highest_modseq = highest_modseq + 1, updated_at = NOW()
		WHERE id = $1 RETURNING highest_modseq
	`, folderID).Scan(&modseq)
	return modseq, err
}

// CreateAuditLog creates an audit log entry
func (r *Repository) CreateAuditLog(ctx context.Context, log *types.AuditLog) error {
	uidsJSON, _ := json.Marshal(log.MessageUIDs)
	query := `
		INSERT INTO imap_audit_logs (id, user_id, mailbox_id, action, folder_path, message_uids, details, client_addr, timestamp)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := r.db.Exec(ctx, query, log.ID, log.UserID, log.MailboxID, log.Action, log.FolderPath, uidsJSON, log.Details, log.ClientAddr, log.Timestamp)
	return err
}

// UpdateFolderCounts updates message/unseen counts for a folder
func (r *Repository) UpdateFolderCounts(ctx context.Context, folderID string) error {
	query := `
		UPDATE folders SET
			message_count = (SELECT COUNT(*) FROM messages WHERE folder_id = $1),
			unseen_count = (SELECT COUNT(*) FROM messages WHERE folder_id = $1 AND NOT flags @> '["\\Seen"]'::jsonb),
			updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, folderID)
	return err
}

// GetMessagesBySequence returns messages by sequence set (for IMAP FETCH/STORE commands)
// seqSet is an IMAP sequence set like "1:5" or "1,3,5:7"
// If isUID is true, seqSet contains UIDs instead of sequence numbers
func (r *Repository) GetMessagesBySequence(ctx context.Context, folderID, seqSet string, isUID bool) ([]*types.Message, error) {
	// For simplicity, fetch all messages and filter by sequence set
	// A production implementation would parse seqSet and build efficient SQL
	allMessages, err := r.GetMessages(ctx, folderID, 0, 100000)
	if err != nil {
		return nil, err
	}

	// Parse sequence set
	set := parseSequenceSet(seqSet, uint32(len(allMessages)))
	setMap := make(map[uint32]bool)
	for _, num := range set {
		setMap[num] = true
	}

	var result []*types.Message
	for i, msg := range allMessages {
		var num uint32
		if isUID {
			num = msg.UID
		} else {
			num = uint32(i + 1) // 1-based sequence numbers
			msg.SequenceNum = num
		}
		if setMap[num] {
			result = append(result, msg)
		}
	}

	return result, nil
}

// parseSequenceSet parses an IMAP sequence set (e.g., "1:5,7,10:*")
func parseSequenceSet(seqSet string, maxSeq uint32) []uint32 {
	var result []uint32

	parts := strings.Split(seqSet, ",")
	for _, part := range parts {
		if strings.Contains(part, ":") {
			// Range
			rangeParts := strings.Split(part, ":")
			if len(rangeParts) != 2 {
				continue
			}

			start := parseSeqNum(rangeParts[0], maxSeq)
			end := parseSeqNum(rangeParts[1], maxSeq)

			if start > end {
				start, end = end, start
			}

			for i := start; i <= end; i++ {
				result = append(result, i)
			}
		} else {
			// Single number
			num := parseSeqNum(part, maxSeq)
			if num > 0 {
				result = append(result, num)
			}
		}
	}

	return result
}

// parseSeqNum parses a single sequence number (handles *)
func parseSeqNum(s string, maxSeq uint32) uint32 {
	if s == "*" {
		return maxSeq
	}

	n, err := strconv.ParseUint(s, 10, 32)
	if err != nil {
		return 0
	}
	return uint32(n)
}

// UpdateMessageFlagsWithMode updates message flags with add/remove/set mode
func (r *Repository) UpdateMessageFlagsWithMode(ctx context.Context, messageID string, flags []types.MessageFlag, mode string, modseq uint64) error {
	// For now, just set the flags directly
	return r.UpdateMessageFlags(ctx, messageID, flags, modseq)
}
