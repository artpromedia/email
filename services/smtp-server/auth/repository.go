package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresRepository implements Repository using PostgreSQL
type PostgresRepository struct {
	pool *pgxpool.Pool
}

// NewPostgresRepository creates a new PostgreSQL repository
func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

// GetUserByEmail retrieves a user by any of their email addresses
func (r *PostgresRepository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	query := `
		SELECT
			u.id,
			u.organization_id,
			ea.email_address,
			u.display_name,
			u.password_hash,
			u.status,
			ea.domain_id,
			u.locked_until
		FROM users u
		JOIN user_email_addresses ea ON ea.user_id = u.id
		WHERE LOWER(ea.email_address) = LOWER($1)
		  AND ea.is_verified = true
		LIMIT 1
	`

	var user User
	var passwordHash sql.NullString
	var lockedUntil sql.NullTime

	err := r.pool.QueryRow(ctx, query, email).Scan(
		&user.ID,
		&user.OrganizationID,
		&user.Email,
		&user.DisplayName,
		&passwordHash,
		&user.Status,
		&user.DomainID,
		&lockedUntil,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("user not found: %s", email)
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	if passwordHash.Valid {
		user.PasswordHash = passwordHash.String
	}
	if lockedUntil.Valid {
		user.LockedUntil = &lockedUntil.Time
	}

	return &user, nil
}

// UpdateLoginFailure records a failed login attempt and potentially locks the account
func (r *PostgresRepository) UpdateLoginFailure(ctx context.Context, userID string) error {
	// Increment failed attempts and potentially lock account
	query := `
		UPDATE users
		SET
			failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
			last_failed_login_at = NOW(),
			locked_until = CASE
				WHEN COALESCE(failed_login_attempts, 0) + 1 >= 5
				THEN NOW() + INTERVAL '15 minutes'
				ELSE locked_until
			END,
			updated_at = NOW()
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("failed to update login failure: %w", err)
	}

	return nil
}

// UpdateLoginSuccess records a successful login
func (r *PostgresRepository) UpdateLoginSuccess(ctx context.Context, userID string, ipAddress string) error {
	query := `
		UPDATE users
		SET
			failed_login_attempts = 0,
			locked_until = NULL,
			last_login_at = NOW(),
			last_login_ip = $2,
			updated_at = NOW()
		WHERE id = $1
	`

	_, err := r.pool.Exec(ctx, query, userID, ipAddress)
	if err != nil {
		return fmt.Errorf("failed to update login success: %w", err)
	}

	return nil
}

// RecordLoginAttempt records a login attempt for audit purposes
func (r *PostgresRepository) RecordLoginAttempt(ctx context.Context, params LoginAttemptParams) error {
	query := `
		INSERT INTO login_attempts (
			user_id,
			email_used,
			ip_address,
			success,
			fail_reason,
			auth_method,
			created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`

	_, err := r.pool.Exec(ctx, query,
		params.UserID,
		params.Email,
		params.IPAddress,
		params.Success,
		nullString(params.FailReason),
		params.Method,
		time.Now(),
	)
	if err != nil {
		return fmt.Errorf("failed to record login attempt: %w", err)
	}

	return nil
}

// nullString converts an empty string to a sql.NullString
func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: s, Valid: true}
}
