package repository

import (
	"context"

	"contacts-service/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type GroupRepository struct {
	db *pgxpool.Pool
}

func NewGroupRepository(db *pgxpool.Pool) *GroupRepository {
	return &GroupRepository{db: db}
}

// Create creates a new group
func (r *GroupRepository) Create(ctx context.Context, group *models.ContactGroup) error {
	query := `
		INSERT INTO contact_groups (id, address_book_id, name, description, color)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING created_at, updated_at`

	return r.db.QueryRow(ctx, query,
		group.ID,
		group.AddressBookID,
		group.Name,
		group.Description,
		group.Color,
	).Scan(&group.CreatedAt, &group.UpdatedAt)
}

// GetByID retrieves a group by ID
func (r *GroupRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.ContactGroup, error) {
	query := `
		SELECT g.id, g.address_book_id, g.name, g.description, g.color,
		       g.created_at, g.updated_at,
		       (SELECT COUNT(*) FROM contact_group_members WHERE group_id = g.id) as contact_count
		FROM contact_groups g
		WHERE g.id = $1`

	group := &models.ContactGroup{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&group.ID,
		&group.AddressBookID,
		&group.Name,
		&group.Description,
		&group.Color,
		&group.CreatedAt,
		&group.UpdatedAt,
		&group.ContactCount,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return group, err
}

// List retrieves groups for an address book
func (r *GroupRepository) List(ctx context.Context, addressBookID uuid.UUID) ([]*models.ContactGroup, error) {
	query := `
		SELECT g.id, g.address_book_id, g.name, g.description, g.color,
		       g.created_at, g.updated_at,
		       (SELECT COUNT(*) FROM contact_group_members WHERE group_id = g.id) as contact_count
		FROM contact_groups g
		WHERE g.address_book_id = $1
		ORDER BY g.name ASC`

	rows, err := r.db.Query(ctx, query, addressBookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*models.ContactGroup
	for rows.Next() {
		g := &models.ContactGroup{}
		if err := rows.Scan(
			&g.ID,
			&g.AddressBookID,
			&g.Name,
			&g.Description,
			&g.Color,
			&g.CreatedAt,
			&g.UpdatedAt,
			&g.ContactCount,
		); err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}

	return groups, nil
}

// ListForUser retrieves all groups across all address books for a user
func (r *GroupRepository) ListForUser(ctx context.Context, userID uuid.UUID) ([]*models.ContactGroup, error) {
	query := `
		SELECT g.id, g.address_book_id, g.name, g.description, g.color,
		       g.created_at, g.updated_at,
		       (SELECT COUNT(*) FROM contact_group_members WHERE group_id = g.id) as contact_count
		FROM contact_groups g
		JOIN address_books ab ON g.address_book_id = ab.id
		LEFT JOIN address_book_shares abs ON ab.id = abs.address_book_id
		WHERE ab.user_id = $1 OR abs.user_id = $1
		ORDER BY g.name ASC`

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*models.ContactGroup
	for rows.Next() {
		g := &models.ContactGroup{}
		if err := rows.Scan(
			&g.ID,
			&g.AddressBookID,
			&g.Name,
			&g.Description,
			&g.Color,
			&g.CreatedAt,
			&g.UpdatedAt,
			&g.ContactCount,
		); err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}

	return groups, nil
}

// Update updates a group
func (r *GroupRepository) Update(ctx context.Context, group *models.ContactGroup) error {
	query := `
		UPDATE contact_groups
		SET name = $2, description = $3, color = $4, updated_at = NOW()
		WHERE id = $1
		RETURNING updated_at`

	return r.db.QueryRow(ctx, query,
		group.ID,
		group.Name,
		group.Description,
		group.Color,
	).Scan(&group.UpdatedAt)
}

// Delete deletes a group
func (r *GroupRepository) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, "DELETE FROM contact_groups WHERE id = $1", id)
	return err
}

// AddContact adds a contact to a group
func (r *GroupRepository) AddContact(ctx context.Context, contactID, groupID uuid.UUID) error {
	query := `
		INSERT INTO contact_group_members (contact_id, group_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING`

	_, err := r.db.Exec(ctx, query, contactID, groupID)
	return err
}

// RemoveContact removes a contact from a group
func (r *GroupRepository) RemoveContact(ctx context.Context, contactID, groupID uuid.UUID) error {
	_, err := r.db.Exec(ctx,
		"DELETE FROM contact_group_members WHERE contact_id = $1 AND group_id = $2",
		contactID, groupID)
	return err
}

// AddContacts adds multiple contacts to a group
func (r *GroupRepository) AddContacts(ctx context.Context, groupID uuid.UUID, contactIDs []uuid.UUID) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	query := `
		INSERT INTO contact_group_members (contact_id, group_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING`

	for _, cid := range contactIDs {
		_, err = tx.Exec(ctx, query, cid, groupID)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// GetContactGroups gets all groups a contact belongs to
func (r *GroupRepository) GetContactGroups(ctx context.Context, contactID uuid.UUID) ([]*models.ContactGroup, error) {
	query := `
		SELECT g.id, g.address_book_id, g.name, g.description, g.color,
		       g.created_at, g.updated_at,
		       (SELECT COUNT(*) FROM contact_group_members WHERE group_id = g.id) as contact_count
		FROM contact_groups g
		JOIN contact_group_members cgm ON g.id = cgm.group_id
		WHERE cgm.contact_id = $1
		ORDER BY g.name ASC`

	rows, err := r.db.Query(ctx, query, contactID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*models.ContactGroup
	for rows.Next() {
		g := &models.ContactGroup{}
		if err := rows.Scan(
			&g.ID,
			&g.AddressBookID,
			&g.Name,
			&g.Description,
			&g.Color,
			&g.CreatedAt,
			&g.UpdatedAt,
			&g.ContactCount,
		); err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}

	return groups, nil
}

// GetGroupContacts gets all contacts in a group
func (r *GroupRepository) GetGroupContacts(ctx context.Context, groupID uuid.UUID) ([]uuid.UUID, error) {
	query := `SELECT contact_id FROM contact_group_members WHERE group_id = $1`

	rows, err := r.db.Query(ctx, query, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var contactIDs []uuid.UUID
	for rows.Next() {
		var cid uuid.UUID
		if err := rows.Scan(&cid); err != nil {
			return nil, err
		}
		contactIDs = append(contactIDs, cid)
	}

	return contactIDs, nil
}

// SetContactGroups replaces all group memberships for a contact
func (r *GroupRepository) SetContactGroups(ctx context.Context, contactID uuid.UUID, groupIDs []uuid.UUID) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Remove existing
	_, err = tx.Exec(ctx, "DELETE FROM contact_group_members WHERE contact_id = $1", contactID)
	if err != nil {
		return err
	}

	// Add new
	query := `INSERT INTO contact_group_members (contact_id, group_id) VALUES ($1, $2)`
	for _, gid := range groupIDs {
		_, err = tx.Exec(ctx, query, contactID, gid)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}
