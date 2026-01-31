package models

import (
	"time"

	"github.com/google/uuid"
)

// Contact represents a contact entry
type Contact struct {
	ID            uuid.UUID         `json:"id"`
	AddressBookID uuid.UUID         `json:"address_book_id"`
	UID           string            `json:"uid"` // vCard UID

	// Name
	Prefix        string            `json:"prefix,omitempty"`
	FirstName     string            `json:"first_name"`
	MiddleName    string            `json:"middle_name,omitempty"`
	LastName      string            `json:"last_name"`
	Suffix        string            `json:"suffix,omitempty"`
	Nickname      string            `json:"nickname,omitempty"`
	DisplayName   string            `json:"display_name"`

	// Organization
	Company       string            `json:"company,omitempty"`
	Department    string            `json:"department,omitempty"`
	JobTitle      string            `json:"job_title,omitempty"`

	// Contact details
	Emails        []ContactEmail    `json:"emails,omitempty"`
	Phones        []ContactPhone    `json:"phones,omitempty"`
	Addresses     []ContactAddress  `json:"addresses,omitempty"`
	URLs          []ContactURL      `json:"urls,omitempty"`
	IMs           []ContactIM       `json:"ims,omitempty"`

	// Personal
	Birthday      *time.Time        `json:"birthday,omitempty"`
	Anniversary   *time.Time        `json:"anniversary,omitempty"`
	Notes         string            `json:"notes,omitempty"`

	// Photo
	PhotoURL      string            `json:"photo_url,omitempty"`
	PhotoData     []byte            `json:"-"` // Base64 encoded in vCard

	// Categories/Groups
	Categories    []string          `json:"categories,omitempty"`
	Groups        []*ContactGroup   `json:"groups,omitempty"`

	// Custom fields
	CustomFields  map[string]string `json:"custom_fields,omitempty"`

	// Metadata
	Starred       bool              `json:"starred"`
	ETag          string            `json:"etag"`
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     time.Time         `json:"updated_at"`
}

type ContactEmail struct {
	Type    string `json:"type"` // home, work, other
	Email   string `json:"email"`
	Primary bool   `json:"primary"`
}

type ContactPhone struct {
	Type   string `json:"type"` // home, work, mobile, fax, other
	Number string `json:"number"`
	Primary bool   `json:"primary"`
}

type ContactAddress struct {
	Type       string `json:"type"` // home, work, other
	Street     string `json:"street"`
	City       string `json:"city"`
	State      string `json:"state"`
	PostalCode string `json:"postal_code"`
	Country    string `json:"country"`
	Primary    bool   `json:"primary"`
}

type ContactURL struct {
	Type string `json:"type"` // home, work, blog, profile, other
	URL  string `json:"url"`
}

type ContactIM struct {
	Type     string `json:"type"` // skype, jabber, hangouts, etc.
	Username string `json:"username"`
}

// ContactGroup represents a contact group
type ContactGroup struct {
	ID            uuid.UUID   `json:"id"`
	AddressBookID uuid.UUID   `json:"address_book_id"`
	Name          string      `json:"name"`
	Description   string      `json:"description,omitempty"`
	Color         string      `json:"color,omitempty"`
	ContactCount  int         `json:"contact_count"`
	CreatedAt     time.Time   `json:"created_at"`
	UpdatedAt     time.Time   `json:"updated_at"`
}

// AddressBook represents a contact address book (collection)
type AddressBook struct {
	ID           uuid.UUID `json:"id"`
	UserID       uuid.UUID `json:"user_id"`
	Name         string    `json:"name"`
	Description  string    `json:"description,omitempty"`
	IsDefault    bool      `json:"is_default"`
	ContactCount int       `json:"contact_count"`
	SyncToken    string    `json:"sync_token"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// AddressBookShare represents sharing of address book
type AddressBookShare struct {
	ID            uuid.UUID `json:"id"`
	AddressBookID uuid.UUID `json:"address_book_id"`
	UserID        uuid.UUID `json:"user_id"`
	Permission    string    `json:"permission"` // read, write, admin
	UserEmail     string    `json:"user_email,omitempty"`
	UserName      string    `json:"user_name,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

// Request/Response types

type CreateContactRequest struct {
	AddressBookID uuid.UUID         `json:"address_book_id" validate:"required"`
	Prefix        string            `json:"prefix"`
	FirstName     string            `json:"first_name"`
	MiddleName    string            `json:"middle_name"`
	LastName      string            `json:"last_name"`
	Suffix        string            `json:"suffix"`
	Nickname      string            `json:"nickname"`
	Company       string            `json:"company"`
	Department    string            `json:"department"`
	JobTitle      string            `json:"job_title"`
	Emails        []ContactEmail    `json:"emails"`
	Phones        []ContactPhone    `json:"phones"`
	Addresses     []ContactAddress  `json:"addresses"`
	URLs          []ContactURL      `json:"urls"`
	IMs           []ContactIM       `json:"ims"`
	Birthday      *time.Time        `json:"birthday"`
	Anniversary   *time.Time        `json:"anniversary"`
	Notes         string            `json:"notes"`
	Categories    []string          `json:"categories"`
	CustomFields  map[string]string `json:"custom_fields"`
	Starred       bool              `json:"starred"`
	Groups        []uuid.UUID       `json:"groups"`
}

type UpdateContactRequest struct {
	Prefix        *string            `json:"prefix"`
	FirstName     *string            `json:"first_name"`
	MiddleName    *string            `json:"middle_name"`
	LastName      *string            `json:"last_name"`
	Suffix        *string            `json:"suffix"`
	Nickname      *string            `json:"nickname"`
	Company       *string            `json:"company"`
	Department    *string            `json:"department"`
	JobTitle      *string            `json:"job_title"`
	Emails        []ContactEmail     `json:"emails"`
	Phones        []ContactPhone     `json:"phones"`
	Addresses     []ContactAddress   `json:"addresses"`
	URLs          []ContactURL       `json:"urls"`
	IMs           []ContactIM        `json:"ims"`
	Birthday      *time.Time         `json:"birthday"`
	Anniversary   *time.Time         `json:"anniversary"`
	Notes         *string            `json:"notes"`
	Categories    []string           `json:"categories"`
	CustomFields  map[string]string  `json:"custom_fields"`
	Starred       *bool              `json:"starred"`
}

type ListContactsRequest struct {
	AddressBookID uuid.UUID `json:"address_book_id"`
	GroupID       uuid.UUID `json:"group_id"`
	Query         string    `json:"query"`
	Starred       *bool     `json:"starred"`
	Limit         int       `json:"limit"`
	Offset        int       `json:"offset"`
	SortBy        string    `json:"sort_by"` // first_name, last_name, company, created_at
	SortOrder     string    `json:"sort_order"` // asc, desc
}

type ContactListResponse struct {
	Contacts []*Contact `json:"contacts"`
	Total    int        `json:"total"`
	Limit    int        `json:"limit"`
	Offset   int        `json:"offset"`
}

type CreateAddressBookRequest struct {
	Name        string `json:"name" validate:"required"`
	Description string `json:"description"`
}

type UpdateAddressBookRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type CreateGroupRequest struct {
	AddressBookID uuid.UUID `json:"address_book_id" validate:"required"`
	Name          string    `json:"name" validate:"required"`
	Description   string    `json:"description"`
	Color         string    `json:"color"`
}

type UpdateGroupRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Color       string `json:"color"`
}

type ShareRequest struct {
	UserID     string `json:"user_id" validate:"required"`
	Permission string `json:"permission" validate:"required,oneof=read write admin"`
}

type ImportRequest struct {
	AddressBookID uuid.UUID `json:"address_book_id"`
	Format        string    `json:"format"` // vcard, csv, google, outlook
	Data          string    `json:"data"`   // File content (base64 for binary)
}

type ImportResult struct {
	Total    int      `json:"total"`
	Imported int      `json:"imported"`
	Skipped  int      `json:"skipped"`
	Errors   []string `json:"errors"`
}

type MergeRequest struct {
	PrimaryID   uuid.UUID   `json:"primary_id" validate:"required"`
	MergeIDs    []uuid.UUID `json:"merge_ids" validate:"required,min=1"`
	KeepFields  []string    `json:"keep_fields"` // Which fields to keep from primary
}

type DuplicateGroup struct {
	Contacts []*Contact `json:"contacts"`
	Reason   string     `json:"reason"` // email, phone, name
}
