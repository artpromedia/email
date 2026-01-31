package repository

import (
	"context"
	"database/sql"

	"contacts-service/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AddressBookRepository struct {
	db *pgxpool.Pool
}

func NewAddressBookRepository(db *pgxpool.Pool) *AddressBookRepository {
	return &AddressBookRepository{db: db}
}

// Create creates a new address book
func (r *AddressBookRepository) Create(ctx context.Context, ab *models.AddressBook) error {
	query := `
		INSERT INTO address_books (id, user_id, name, description, is_default)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING sync_token, created_at, updated_at`

	return r.db.QueryRow(ctx, query,
		ab.ID,
		ab.UserID,
		ab.Name,
		ab.Description,
		ab.IsDefault,
	).Scan(&ab.SyncToken, &ab.CreatedAt, &ab.UpdatedAt)
}

// GetByID retrieves an address book by ID
func (r *AddressBookRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.AddressBook, error) {
	query := `
		SELECT ab.id, ab.user_id, ab.name, ab.description, ab.is_default,
		       ab.sync_token, ab.created_at, ab.updated_at,
		       (SELECT COUNT(*) FROM contacts WHERE address_book_id = ab.id) as contact_count
		FROM address_books ab
		WHERE ab.id = $1`

	ab := &models.AddressBook{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&ab.ID,
		&ab.UserID,
		&ab.Name,
		&ab.Description,
		&ab.IsDefault,
		&ab.SyncToken,
		&ab.CreatedAt,
		&ab.UpdatedAt,
		&ab.ContactCount,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return ab, err
}

// GetByUserID retrieves all address books for a user (owned + shared)
func (r *AddressBookRepository) GetByUserID(ctx context.Context, userID uuid.UUID) ([]*models.AddressBook, error) {
	query := `
		SELECT ab.id, ab.user_id, ab.name, ab.description, ab.is_default,
		       ab.sync_token, ab.created_at, ab.updated_at,
		       (SELECT COUNT(*) FROM contacts WHERE address_book_id = ab.id) as contact_count,
		       COALESCE(abs.permission, 'owner') as permission
		FROM address_books ab
		LEFT JOIN address_book_shares abs ON ab.id = abs.address_book_id AND abs.user_id = $1
		WHERE ab.user_id = $1 OR abs.user_id = $1
		ORDER BY ab.is_default DESC, ab.name ASC`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var books []*models.AddressBook
	for rows.Next() {
		ab := &models.AddressBook{}
		var permission string
		if err := rows.Scan(
			&ab.ID,
			&ab.UserID,
			&ab.Name,
			&ab.Description,
			&ab.IsDefault,
			&ab.SyncToken,
			&ab.CreatedAt,
			&ab.UpdatedAt,
			&ab.ContactCount,
			&permission,
		); err != nil {
			return nil, err
		}
		books = append(books, ab)
	}

	return books, nil
}

// Update updates an address book
func (r *AddressBookRepository) Update(ctx context.Context, ab *models.AddressBook) error {
	query := `
		UPDATE address_books
		SET name = $2, description = $3, updated_at = NOW()
		WHERE id = $1
		RETURNING sync_token, updated_at`

	return r.db.QueryRow(ctx, query,
		ab.ID,
		ab.Name,
		ab.Description,
	).Scan(&ab.SyncToken, &ab.UpdatedAt)
}

// Delete deletes an address book
func (r *AddressBookRepository) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM address_books WHERE id = $1", id)
	return err
}

// SetDefault sets an address book as default
func (r *AddressBookRepository) SetDefault(ctx context.Context, userID, abID uuid.UUID) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, "UPDATE address_books SET is_default = false WHERE user_id = $1", userID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, "UPDATE address_books SET is_default = true WHERE id = $1 AND user_id = $2",
		abID, userID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// Share shares an address book with another user
func (r *AddressBookRepository) Share(ctx context.Context, abID, userID uuid.UUID, permission string) error {
	query := `
		INSERT INTO address_book_shares (id, address_book_id, user_id, permission)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (address_book_id, user_id) DO UPDATE SET permission = $4`

	_, err := r.db.Exec(ctx, query, uuid.New(), abID, userID, permission)
	return err
}

// Unshare removes address book sharing
func (r *AddressBookRepository) Unshare(ctx context.Context, abID, userID uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM address_book_shares WHERE address_book_id = $1 AND user_id = $2",
		abID, userID)
	return err
}

// GetShares gets all shares for an address book
func (r *AddressBookRepository) GetShares(ctx context.Context, abID uuid.UUID) ([]*models.AddressBookShare, error) {
	query := `
		SELECT abs.id, abs.address_book_id, abs.user_id, abs.permission, abs.created_at,
		       u.email, u.display_name
		FROM address_book_shares abs
		JOIN users u ON abs.user_id = u.id
		WHERE abs.address_book_id = $1`

	rows, err := r.db.Query(ctx, query, abID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shares []*models.AddressBookShare
	for rows.Next() {
		s := &models.AddressBookShare{}
		var email, displayName sql.NullString
		if err := rows.Scan(
			&s.ID,
			&s.AddressBookID,
			&s.UserID,
			&s.Permission,
			&s.CreatedAt,
			&email,
			&displayName,
		); err != nil {
			return nil, err
		}
		s.UserEmail = email.String
		s.UserName = displayName.String
		shares = append(shares, s)
	}

	return shares, nil
}

// HasAccess checks if user has specific access level to address book
func (r *AddressBookRepository) HasAccess(ctx context.Context, abID, userID uuid.UUID, minPermission string) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM address_books WHERE id = $1 AND user_id = $2
			UNION
			SELECT 1 FROM address_book_shares WHERE address_book_id = $1 AND user_id = $2
			AND permission IN (SELECT unnest($3::text[]))
		)`

	var permissions []string
	switch minPermission {
	case "read":
		permissions = []string{"read", "write", "admin"}
	case "write":
		permissions = []string{"write", "admin"}
	case "admin":
		permissions = []string{"admin"}
	}

	var exists bool
	err := r.db.QueryRow(ctx, query, abID, userID, permissions).Scan(&exists)
	return exists, err
}

// GetSyncChanges returns contacts changed since last sync
func (r *AddressBookRepository) GetSyncChanges(ctx context.Context, abID uuid.UUID, sinceSyncToken string) ([]*models.Contact, string, error) {
	// Get current sync token
	var currentToken string
	err := r.db.QueryRow(ctx, "SELECT sync_token FROM address_books WHERE id = $1", abID).Scan(&currentToken)
	if err != nil {
		return nil, "", err
	}

	if sinceSyncToken == currentToken {
		return []*models.Contact{}, currentToken, nil
	}

	// Get all contacts (simplified - in production, track changes)
	query := `
		SELECT id, address_book_id, uid, prefix, first_name, middle_name, last_name, suffix,
		       nickname, display_name, company, department, job_title,
		       emails, phones, addresses, urls, ims,
		       birthday, anniversary, notes, photo_url, categories, custom_fields, starred,
		       etag, created_at, updated_at
		FROM contacts
		WHERE address_book_id = $1
		ORDER BY updated_at DESC`

	rows, err := r.db.Query(ctx, query, abID)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	contactRepo := &ContactRepository{db: r.db}
	var contacts []*models.Contact
	for rows.Next() {
		contact := &models.Contact{}
		if err := contactRepo.scanContactRows(rows, contact); err != nil {
			return nil, "", err
		}
		contacts = append(contacts, contact)
	}

	return contacts, currentToken, nil
}
