package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"contacts-service/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ContactRepository struct {
	db *pgxpool.Pool
}

func NewContactRepository(db *pgxpool.Pool) *ContactRepository {
	return &ContactRepository{db: db}
}

// Create creates a new contact
func (r *ContactRepository) Create(ctx context.Context, contact *models.Contact) error {
	emailsJSON, _ := json.Marshal(contact.Emails)
	phonesJSON, _ := json.Marshal(contact.Phones)
	addressesJSON, _ := json.Marshal(contact.Addresses)
	urlsJSON, _ := json.Marshal(contact.URLs)
	imsJSON, _ := json.Marshal(contact.IMs)
	customFieldsJSON, _ := json.Marshal(contact.CustomFields)

	query := `
		INSERT INTO contacts (
			id, address_book_id, uid, prefix, first_name, middle_name, last_name, suffix,
			nickname, display_name, company, department, job_title,
			emails, phones, addresses, urls, ims,
			birthday, anniversary, notes, categories, custom_fields, starred
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
			$14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
		)
		RETURNING etag, created_at, updated_at`

	return r.db.QueryRow(ctx, query,
		contact.ID,
		contact.AddressBookID,
		contact.UID,
		contact.Prefix,
		contact.FirstName,
		contact.MiddleName,
		contact.LastName,
		contact.Suffix,
		contact.Nickname,
		contact.DisplayName,
		contact.Company,
		contact.Department,
		contact.JobTitle,
		emailsJSON,
		phonesJSON,
		addressesJSON,
		urlsJSON,
		imsJSON,
		contact.Birthday,
		contact.Anniversary,
		contact.Notes,
		contact.Categories,
		customFieldsJSON,
		contact.Starred,
	).Scan(&contact.ETag, &contact.CreatedAt, &contact.UpdatedAt)
}

// GetByID retrieves a contact by ID
func (r *ContactRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.Contact, error) {
	query := `
		SELECT id, address_book_id, uid, prefix, first_name, middle_name, last_name, suffix,
		       nickname, display_name, company, department, job_title,
		       emails, phones, addresses, urls, ims,
		       birthday, anniversary, notes, photo_url, categories, custom_fields, starred,
		       etag, created_at, updated_at
		FROM contacts
		WHERE id = $1`

	contact := &models.Contact{}
	err := r.scanContact(r.db.QueryRow(ctx, query, id), contact)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return contact, err
}

// GetByUID retrieves a contact by vCard UID
func (r *ContactRepository) GetByUID(ctx context.Context, addressBookID uuid.UUID, uid string) (*models.Contact, error) {
	query := `
		SELECT id, address_book_id, uid, prefix, first_name, middle_name, last_name, suffix,
		       nickname, display_name, company, department, job_title,
		       emails, phones, addresses, urls, ims,
		       birthday, anniversary, notes, photo_url, categories, custom_fields, starred,
		       etag, created_at, updated_at
		FROM contacts
		WHERE address_book_id = $1 AND uid = $2`

	contact := &models.Contact{}
	err := r.scanContact(r.db.QueryRow(ctx, query, addressBookID, uid), contact)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return contact, err
}

// List retrieves contacts with filtering and pagination
func (r *ContactRepository) List(ctx context.Context, req *models.ListContactsRequest, userID uuid.UUID) ([]*models.Contact, int, error) {
	// Build where clause
	where := "WHERE (ab.user_id = $1 OR abs.user_id = $1)"
	args := []interface{}{userID}
	argCount := 1

	if req.AddressBookID != uuid.Nil {
		argCount++
		where += fmt.Sprintf(" AND c.address_book_id = $%d", argCount)
		args = append(args, req.AddressBookID)
	}

	if req.GroupID != uuid.Nil {
		argCount++
		where += fmt.Sprintf(" AND EXISTS (SELECT 1 FROM contact_group_members cgm WHERE cgm.contact_id = c.id AND cgm.group_id = $%d)", argCount)
		args = append(args, req.GroupID)
	}

	if req.Query != "" {
		argCount++
		where += fmt.Sprintf(` AND (
			c.display_name ILIKE $%d OR
			c.company ILIKE $%d OR
			c.emails::text ILIKE $%d OR
			c.phones::text ILIKE $%d
		)`, argCount, argCount, argCount, argCount)
		args = append(args, "%"+req.Query+"%")
	}

	if req.Starred != nil && *req.Starred {
		where += " AND c.starred = true"
	}

	// Count total
	countQuery := fmt.Sprintf(`
		SELECT COUNT(DISTINCT c.id)
		FROM contacts c
		JOIN address_books ab ON c.address_book_id = ab.id
		LEFT JOIN address_book_shares abs ON ab.id = abs.address_book_id
		%s`, where)

	var total int
	if err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Sort
	sortColumn := "c.display_name"
	switch req.SortBy {
	case "first_name":
		sortColumn = "c.first_name"
	case "last_name":
		sortColumn = "c.last_name"
	case "company":
		sortColumn = "c.company"
	case "created_at":
		sortColumn = "c.created_at"
	}

	sortOrder := "ASC"
	if req.SortOrder == "desc" {
		sortOrder = "DESC"
	}

	// Pagination
	limit := req.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	offset := req.Offset
	if offset < 0 {
		offset = 0
	}

	// Get contacts
	query := fmt.Sprintf(`
		SELECT DISTINCT c.id, c.address_book_id, c.uid, c.prefix, c.first_name, c.middle_name, c.last_name, c.suffix,
		       c.nickname, c.display_name, c.company, c.department, c.job_title,
		       c.emails, c.phones, c.addresses, c.urls, c.ims,
		       c.birthday, c.anniversary, c.notes, c.photo_url, c.categories, c.custom_fields, c.starred,
		       c.etag, c.created_at, c.updated_at
		FROM contacts c
		JOIN address_books ab ON c.address_book_id = ab.id
		LEFT JOIN address_book_shares abs ON ab.id = abs.address_book_id
		%s
		ORDER BY %s %s
		LIMIT $%d OFFSET $%d`,
		where, sortColumn, sortOrder, argCount+1, argCount+2)

	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var contacts []*models.Contact
	for rows.Next() {
		contact := &models.Contact{}
		if err := r.scanContactRows(rows, contact); err != nil {
			return nil, 0, err
		}
		contacts = append(contacts, contact)
	}

	return contacts, total, nil
}

// Update updates a contact
func (r *ContactRepository) Update(ctx context.Context, contact *models.Contact) error {
	emailsJSON, _ := json.Marshal(contact.Emails)
	phonesJSON, _ := json.Marshal(contact.Phones)
	addressesJSON, _ := json.Marshal(contact.Addresses)
	urlsJSON, _ := json.Marshal(contact.URLs)
	imsJSON, _ := json.Marshal(contact.IMs)
	customFieldsJSON, _ := json.Marshal(contact.CustomFields)

	query := `
		UPDATE contacts SET
			prefix = $2, first_name = $3, middle_name = $4, last_name = $5, suffix = $6,
			nickname = $7, display_name = $8, company = $9, department = $10, job_title = $11,
			emails = $12, phones = $13, addresses = $14, urls = $15, ims = $16,
			birthday = $17, anniversary = $18, notes = $19, categories = $20, custom_fields = $21, starred = $22
		WHERE id = $1
		RETURNING etag, updated_at`

	return r.db.QueryRow(ctx, query,
		contact.ID,
		contact.Prefix,
		contact.FirstName,
		contact.MiddleName,
		contact.LastName,
		contact.Suffix,
		contact.Nickname,
		contact.DisplayName,
		contact.Company,
		contact.Department,
		contact.JobTitle,
		emailsJSON,
		phonesJSON,
		addressesJSON,
		urlsJSON,
		imsJSON,
		contact.Birthday,
		contact.Anniversary,
		contact.Notes,
		contact.Categories,
		customFieldsJSON,
		contact.Starred,
	).Scan(&contact.ETag, &contact.UpdatedAt)
}

// Delete deletes a contact
func (r *ContactRepository) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM contacts WHERE id = $1", id)
	return err
}

// DeleteByUID deletes a contact by UID
func (r *ContactRepository) DeleteByUID(ctx context.Context, addressBookID uuid.UUID, uid string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM contacts WHERE address_book_id = $1 AND uid = $2",
		addressBookID, uid)
	return err
}

// UpdatePhoto updates contact photo
func (r *ContactRepository) UpdatePhoto(ctx context.Context, contactID uuid.UUID, photoURL string, photoData []byte) error {
	_, err := r.db.Exec(ctx,
		"UPDATE contacts SET photo_url = $2, photo_data = $3 WHERE id = $1",
		contactID, photoURL, photoData)
	return err
}

// Search performs full-text search on contacts
func (r *ContactRepository) Search(ctx context.Context, userID uuid.UUID, query string, limit int) ([]*models.Contact, error) {
	sqlQuery := `
		SELECT DISTINCT c.id, c.address_book_id, c.uid, c.prefix, c.first_name, c.middle_name, c.last_name, c.suffix,
		       c.nickname, c.display_name, c.company, c.department, c.job_title,
		       c.emails, c.phones, c.addresses, c.urls, c.ims,
		       c.birthday, c.anniversary, c.notes, c.photo_url, c.categories, c.custom_fields, c.starred,
		       c.etag, c.created_at, c.updated_at
		FROM contacts c
		JOIN address_books ab ON c.address_book_id = ab.id
		LEFT JOIN address_book_shares abs ON ab.id = abs.address_book_id
		WHERE (ab.user_id = $1 OR abs.user_id = $1)
		  AND (
		    c.display_name ILIKE $2 OR
		    c.company ILIKE $2 OR
		    c.emails::text ILIKE $2 OR
		    c.phones::text ILIKE $2 OR
		    c.notes ILIKE $2
		  )
		ORDER BY c.display_name ASC
		LIMIT $3`

	rows, err := r.db.Query(ctx, sqlQuery, userID, "%"+query+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var contacts []*models.Contact
	for rows.Next() {
		contact := &models.Contact{}
		if err := r.scanContactRows(rows, contact); err != nil {
			return nil, err
		}
		contacts = append(contacts, contact)
	}

	return contacts, nil
}

// FindDuplicates finds potential duplicate contacts
func (r *ContactRepository) FindDuplicates(ctx context.Context, userID uuid.UUID) ([]*models.DuplicateGroup, error) {
	// Find by email
	emailQuery := `
		SELECT c1.id, c1.display_name, c1.emails
		FROM contacts c1
		JOIN address_books ab ON c1.address_book_id = ab.id
		WHERE ab.user_id = $1
		  AND EXISTS (
		    SELECT 1 FROM contacts c2
		    JOIN address_books ab2 ON c2.address_book_id = ab2.id
		    WHERE ab2.user_id = $1 AND c1.id != c2.id
		      AND c1.emails::text != '[]'
		      AND c1.emails @> c2.emails
		  )
		ORDER BY c1.display_name`

	// This is a simplified implementation
	// In production, you'd use more sophisticated matching
	rows, err := r.db.Query(ctx, emailQuery, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// For now, return empty - full implementation would group duplicates
	return []*models.DuplicateGroup{}, nil
}

// GetMultipleByUIDs retrieves multiple contacts by UIDs (for CardDAV multiget)
func (r *ContactRepository) GetMultipleByUIDs(ctx context.Context, addressBookID uuid.UUID, uids []string) ([]*models.Contact, error) {
	query := `
		SELECT id, address_book_id, uid, prefix, first_name, middle_name, last_name, suffix,
		       nickname, display_name, company, department, job_title,
		       emails, phones, addresses, urls, ims,
		       birthday, anniversary, notes, photo_url, categories, custom_fields, starred,
		       etag, created_at, updated_at
		FROM contacts
		WHERE address_book_id = $1 AND uid = ANY($2)`

	rows, err := r.db.Query(ctx, query, addressBookID, uids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var contacts []*models.Contact
	for rows.Next() {
		contact := &models.Contact{}
		if err := r.scanContactRows(rows, contact); err != nil {
			return nil, err
		}
		contacts = append(contacts, contact)
	}

	return contacts, nil
}

func (r *ContactRepository) scanContact(row pgx.Row, contact *models.Contact) error {
	var emailsJSON, phonesJSON, addressesJSON, urlsJSON, imsJSON, customFieldsJSON []byte
	var birthday, anniversary sql.NullTime
	var photoURL sql.NullString

	err := row.Scan(
		&contact.ID,
		&contact.AddressBookID,
		&contact.UID,
		&contact.Prefix,
		&contact.FirstName,
		&contact.MiddleName,
		&contact.LastName,
		&contact.Suffix,
		&contact.Nickname,
		&contact.DisplayName,
		&contact.Company,
		&contact.Department,
		&contact.JobTitle,
		&emailsJSON,
		&phonesJSON,
		&addressesJSON,
		&urlsJSON,
		&imsJSON,
		&birthday,
		&anniversary,
		&contact.Notes,
		&photoURL,
		&contact.Categories,
		&customFieldsJSON,
		&contact.Starred,
		&contact.ETag,
		&contact.CreatedAt,
		&contact.UpdatedAt,
	)
	if err != nil {
		return err
	}

	json.Unmarshal(emailsJSON, &contact.Emails)
	json.Unmarshal(phonesJSON, &contact.Phones)
	json.Unmarshal(addressesJSON, &contact.Addresses)
	json.Unmarshal(urlsJSON, &contact.URLs)
	json.Unmarshal(imsJSON, &contact.IMs)
	json.Unmarshal(customFieldsJSON, &contact.CustomFields)

	if birthday.Valid {
		contact.Birthday = &birthday.Time
	}
	if anniversary.Valid {
		contact.Anniversary = &anniversary.Time
	}
	if photoURL.Valid {
		contact.PhotoURL = photoURL.String
	}

	return nil
}

func (r *ContactRepository) scanContactRows(rows pgx.Rows, contact *models.Contact) error {
	var emailsJSON, phonesJSON, addressesJSON, urlsJSON, imsJSON, customFieldsJSON []byte
	var birthday, anniversary sql.NullTime
	var photoURL sql.NullString

	err := rows.Scan(
		&contact.ID,
		&contact.AddressBookID,
		&contact.UID,
		&contact.Prefix,
		&contact.FirstName,
		&contact.MiddleName,
		&contact.LastName,
		&contact.Suffix,
		&contact.Nickname,
		&contact.DisplayName,
		&contact.Company,
		&contact.Department,
		&contact.JobTitle,
		&emailsJSON,
		&phonesJSON,
		&addressesJSON,
		&urlsJSON,
		&imsJSON,
		&birthday,
		&anniversary,
		&contact.Notes,
		&photoURL,
		&contact.Categories,
		&customFieldsJSON,
		&contact.Starred,
		&contact.ETag,
		&contact.CreatedAt,
		&contact.UpdatedAt,
	)
	if err != nil {
		return err
	}

	json.Unmarshal(emailsJSON, &contact.Emails)
	json.Unmarshal(phonesJSON, &contact.Phones)
	json.Unmarshal(addressesJSON, &contact.Addresses)
	json.Unmarshal(urlsJSON, &contact.URLs)
	json.Unmarshal(imsJSON, &contact.IMs)
	json.Unmarshal(customFieldsJSON, &contact.CustomFields)

	if birthday.Valid {
		contact.Birthday = &birthday.Time
	}
	if anniversary.Valid {
		contact.Anniversary = &anniversary.Time
	}
	if photoURL.Valid {
		contact.PhotoURL = photoURL.String
	}

	return nil
}
