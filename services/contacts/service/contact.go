package service

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"contacts-service/models"
	"contacts-service/repository"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

type ContactService struct {
	contactRepo     *repository.ContactRepository
	groupRepo       *repository.GroupRepository
	addressBookRepo *repository.AddressBookRepository
	logger          *zap.Logger
}

func NewContactService(
	contactRepo *repository.ContactRepository,
	groupRepo *repository.GroupRepository,
	addressBookRepo *repository.AddressBookRepository,
	logger *zap.Logger,
) *ContactService {
	return &ContactService{
		contactRepo:     contactRepo,
		groupRepo:       groupRepo,
		addressBookRepo: addressBookRepo,
		logger:          logger,
	}
}

// Address Book operations

func (s *ContactService) CreateAddressBook(ctx context.Context, userID uuid.UUID, req *models.CreateAddressBookRequest) (*models.AddressBook, error) {
	ab := &models.AddressBook{
		ID:          uuid.New(),
		UserID:      userID,
		Name:        req.Name,
		Description: req.Description,
	}

	if err := s.addressBookRepo.Create(ctx, ab); err != nil {
		return nil, fmt.Errorf("create address book: %w", err)
	}

	s.logger.Info("Address book created",
		zap.String("id", ab.ID.String()),
		zap.String("name", ab.Name))

	return ab, nil
}

func (s *ContactService) GetAddressBook(ctx context.Context, userID, abID uuid.UUID) (*models.AddressBook, error) {
	ab, err := s.addressBookRepo.GetByID(ctx, abID)
	if err != nil {
		return nil, err
	}
	if ab == nil {
		return nil, nil
	}

	hasAccess, err := s.addressBookRepo.HasAccess(ctx, abID, userID, "read")
	if err != nil || !hasAccess {
		return nil, fmt.Errorf("access denied")
	}

	return ab, nil
}

func (s *ContactService) ListAddressBooks(ctx context.Context, userID uuid.UUID) ([]*models.AddressBook, error) {
	return s.addressBookRepo.GetByUserID(ctx, userID)
}

func (s *ContactService) UpdateAddressBook(ctx context.Context, userID, abID uuid.UUID, req *models.UpdateAddressBookRequest) (*models.AddressBook, error) {
	ab, err := s.addressBookRepo.GetByID(ctx, abID)
	if err != nil || ab == nil {
		return nil, fmt.Errorf("address book not found")
	}

	if ab.UserID != userID {
		hasAccess, _ := s.addressBookRepo.HasAccess(ctx, abID, userID, "admin")
		if !hasAccess {
			return nil, fmt.Errorf("access denied")
		}
	}

	if req.Name != "" {
		ab.Name = req.Name
	}
	if req.Description != "" {
		ab.Description = req.Description
	}

	if err := s.addressBookRepo.Update(ctx, ab); err != nil {
		return nil, fmt.Errorf("update address book: %w", err)
	}

	return ab, nil
}

func (s *ContactService) DeleteAddressBook(ctx context.Context, userID, abID uuid.UUID) error {
	ab, err := s.addressBookRepo.GetByID(ctx, abID)
	if err != nil || ab == nil {
		return fmt.Errorf("address book not found")
	}

	if ab.UserID != userID {
		return fmt.Errorf("access denied")
	}

	if ab.IsDefault {
		return fmt.Errorf("cannot delete default address book")
	}

	return s.addressBookRepo.Delete(ctx, abID)
}

func (s *ContactService) ShareAddressBook(ctx context.Context, ownerID, abID, targetUserID uuid.UUID, permission string) error {
	ab, err := s.addressBookRepo.GetByID(ctx, abID)
	if err != nil || ab == nil {
		return fmt.Errorf("address book not found")
	}

	if ab.UserID != ownerID {
		return fmt.Errorf("access denied")
	}

	return s.addressBookRepo.Share(ctx, abID, targetUserID, permission)
}

func (s *ContactService) UnshareAddressBook(ctx context.Context, ownerID, abID, targetUserID uuid.UUID) error {
	ab, err := s.addressBookRepo.GetByID(ctx, abID)
	if err != nil || ab == nil {
		return fmt.Errorf("address book not found")
	}

	if ab.UserID != ownerID {
		return fmt.Errorf("access denied")
	}

	return s.addressBookRepo.Unshare(ctx, abID, targetUserID)
}

// Contact operations

func (s *ContactService) CreateContact(ctx context.Context, userID uuid.UUID, req *models.CreateContactRequest) (*models.Contact, error) {
	// Verify access
	hasAccess, err := s.addressBookRepo.HasAccess(ctx, req.AddressBookID, userID, "write")
	if err != nil || !hasAccess {
		return nil, fmt.Errorf("access denied to address book")
	}

	// Build display name
	displayName := strings.TrimSpace(req.FirstName + " " + req.LastName)
	if displayName == "" && req.Company != "" {
		displayName = req.Company
	}
	if displayName == "" {
		displayName = "No Name"
	}

	contact := &models.Contact{
		ID:            uuid.New(),
		AddressBookID: req.AddressBookID,
		UID:           fmt.Sprintf("%s@contacts.local", uuid.New().String()),
		Prefix:        req.Prefix,
		FirstName:     req.FirstName,
		MiddleName:    req.MiddleName,
		LastName:      req.LastName,
		Suffix:        req.Suffix,
		Nickname:      req.Nickname,
		DisplayName:   displayName,
		Company:       req.Company,
		Department:    req.Department,
		JobTitle:      req.JobTitle,
		Emails:        req.Emails,
		Phones:        req.Phones,
		Addresses:     req.Addresses,
		URLs:          req.URLs,
		IMs:           req.IMs,
		Birthday:      req.Birthday,
		Anniversary:   req.Anniversary,
		Notes:         req.Notes,
		Categories:    req.Categories,
		CustomFields:  req.CustomFields,
		Starred:       req.Starred,
	}

	if err := s.contactRepo.Create(ctx, contact); err != nil {
		return nil, fmt.Errorf("create contact: %w", err)
	}

	// Add to groups
	if len(req.Groups) > 0 {
		for _, gid := range req.Groups {
			s.groupRepo.AddContact(ctx, contact.ID, gid)
		}
		contact.Groups, _ = s.groupRepo.GetContactGroups(ctx, contact.ID)
	}

	s.logger.Info("Contact created",
		zap.String("id", contact.ID.String()),
		zap.String("name", contact.DisplayName))

	return contact, nil
}

func (s *ContactService) GetContact(ctx context.Context, userID, contactID uuid.UUID) (*models.Contact, error) {
	contact, err := s.contactRepo.GetByID(ctx, contactID)
	if err != nil {
		return nil, err
	}
	if contact == nil {
		return nil, nil
	}

	hasAccess, err := s.addressBookRepo.HasAccess(ctx, contact.AddressBookID, userID, "read")
	if err != nil || !hasAccess {
		return nil, fmt.Errorf("access denied")
	}

	contact.Groups, _ = s.groupRepo.GetContactGroups(ctx, contactID)
	return contact, nil
}

func (s *ContactService) ListContacts(ctx context.Context, userID uuid.UUID, req *models.ListContactsRequest) (*models.ContactListResponse, error) {
	contacts, total, err := s.contactRepo.List(ctx, req, userID)
	if err != nil {
		return nil, err
	}

	// Load groups for each contact
	for _, c := range contacts {
		c.Groups, _ = s.groupRepo.GetContactGroups(ctx, c.ID)
	}

	return &models.ContactListResponse{
		Contacts: contacts,
		Total:    total,
		Limit:    req.Limit,
		Offset:   req.Offset,
	}, nil
}

func (s *ContactService) SearchContacts(ctx context.Context, userID uuid.UUID, query string, limit int) ([]*models.Contact, error) {
	if limit <= 0 {
		limit = 50
	}
	return s.contactRepo.Search(ctx, userID, query, limit)
}

func (s *ContactService) UpdateContact(ctx context.Context, userID, contactID uuid.UUID, req *models.UpdateContactRequest) (*models.Contact, error) {
	contact, err := s.contactRepo.GetByID(ctx, contactID)
	if err != nil || contact == nil {
		return nil, fmt.Errorf("contact not found")
	}

	hasAccess, err := s.addressBookRepo.HasAccess(ctx, contact.AddressBookID, userID, "write")
	if err != nil || !hasAccess {
		return nil, fmt.Errorf("access denied")
	}

	// Apply updates
	if req.FirstName != nil {
		contact.FirstName = *req.FirstName
	}
	if req.LastName != nil {
		contact.LastName = *req.LastName
	}
	if req.MiddleName != nil {
		contact.MiddleName = *req.MiddleName
	}
	if req.Prefix != nil {
		contact.Prefix = *req.Prefix
	}
	if req.Suffix != nil {
		contact.Suffix = *req.Suffix
	}
	if req.Nickname != nil {
		contact.Nickname = *req.Nickname
	}
	if req.Company != nil {
		contact.Company = *req.Company
	}
	if req.Department != nil {
		contact.Department = *req.Department
	}
	if req.JobTitle != nil {
		contact.JobTitle = *req.JobTitle
	}
	if req.Notes != nil {
		contact.Notes = *req.Notes
	}
	if req.Starred != nil {
		contact.Starred = *req.Starred
	}
	if req.Emails != nil {
		contact.Emails = req.Emails
	}
	if req.Phones != nil {
		contact.Phones = req.Phones
	}
	if req.Addresses != nil {
		contact.Addresses = req.Addresses
	}
	if req.URLs != nil {
		contact.URLs = req.URLs
	}
	if req.IMs != nil {
		contact.IMs = req.IMs
	}
	if req.Categories != nil {
		contact.Categories = req.Categories
	}
	if req.CustomFields != nil {
		contact.CustomFields = req.CustomFields
	}
	if req.Birthday != nil {
		contact.Birthday = req.Birthday
	}
	if req.Anniversary != nil {
		contact.Anniversary = req.Anniversary
	}

	// Update display name
	contact.DisplayName = strings.TrimSpace(contact.FirstName + " " + contact.LastName)
	if contact.DisplayName == "" && contact.Company != "" {
		contact.DisplayName = contact.Company
	}
	if contact.DisplayName == "" {
		contact.DisplayName = "No Name"
	}

	if err := s.contactRepo.Update(ctx, contact); err != nil {
		return nil, fmt.Errorf("update contact: %w", err)
	}

	contact.Groups, _ = s.groupRepo.GetContactGroups(ctx, contactID)
	return contact, nil
}

func (s *ContactService) DeleteContact(ctx context.Context, userID, contactID uuid.UUID) error {
	contact, err := s.contactRepo.GetByID(ctx, contactID)
	if err != nil || contact == nil {
		return fmt.Errorf("contact not found")
	}

	hasAccess, err := s.addressBookRepo.HasAccess(ctx, contact.AddressBookID, userID, "write")
	if err != nil || !hasAccess {
		return fmt.Errorf("access denied")
	}

	return s.contactRepo.Delete(ctx, contactID)
}

func (s *ContactService) UpdatePhoto(ctx context.Context, userID, contactID uuid.UUID, photoURL string, photoData []byte) error {
	contact, err := s.contactRepo.GetByID(ctx, contactID)
	if err != nil || contact == nil {
		return fmt.Errorf("contact not found")
	}

	hasAccess, err := s.addressBookRepo.HasAccess(ctx, contact.AddressBookID, userID, "write")
	if err != nil || !hasAccess {
		return fmt.Errorf("access denied")
	}

	return s.contactRepo.UpdatePhoto(ctx, contactID, photoURL, photoData)
}

// Group operations

func (s *ContactService) CreateGroup(ctx context.Context, userID uuid.UUID, req *models.CreateGroupRequest) (*models.ContactGroup, error) {
	hasAccess, err := s.addressBookRepo.HasAccess(ctx, req.AddressBookID, userID, "write")
	if err != nil || !hasAccess {
		return nil, fmt.Errorf("access denied to address book")
	}

	group := &models.ContactGroup{
		ID:            uuid.New(),
		AddressBookID: req.AddressBookID,
		Name:          req.Name,
		Description:   req.Description,
		Color:         req.Color,
	}

	if err := s.groupRepo.Create(ctx, group); err != nil {
		return nil, fmt.Errorf("create group: %w", err)
	}

	return group, nil
}

func (s *ContactService) GetGroup(ctx context.Context, userID, groupID uuid.UUID) (*models.ContactGroup, error) {
	group, err := s.groupRepo.GetByID(ctx, groupID)
	if err != nil || group == nil {
		return nil, fmt.Errorf("group not found")
	}

	hasAccess, err := s.addressBookRepo.HasAccess(ctx, group.AddressBookID, userID, "read")
	if err != nil || !hasAccess {
		return nil, fmt.Errorf("access denied")
	}

	return group, nil
}

func (s *ContactService) ListGroups(ctx context.Context, userID uuid.UUID, addressBookID uuid.UUID) ([]*models.ContactGroup, error) {
	if addressBookID != uuid.Nil {
		return s.groupRepo.List(ctx, addressBookID)
	}
	return s.groupRepo.ListForUser(ctx, userID)
}

func (s *ContactService) UpdateGroup(ctx context.Context, userID, groupID uuid.UUID, req *models.UpdateGroupRequest) (*models.ContactGroup, error) {
	group, err := s.groupRepo.GetByID(ctx, groupID)
	if err != nil || group == nil {
		return nil, fmt.Errorf("group not found")
	}

	hasAccess, err := s.addressBookRepo.HasAccess(ctx, group.AddressBookID, userID, "write")
	if err != nil || !hasAccess {
		return nil, fmt.Errorf("access denied")
	}

	if req.Name != "" {
		group.Name = req.Name
	}
	if req.Description != "" {
		group.Description = req.Description
	}
	if req.Color != "" {
		group.Color = req.Color
	}

	if err := s.groupRepo.Update(ctx, group); err != nil {
		return nil, fmt.Errorf("update group: %w", err)
	}

	return group, nil
}

func (s *ContactService) DeleteGroup(ctx context.Context, userID, groupID uuid.UUID) error {
	group, err := s.groupRepo.GetByID(ctx, groupID)
	if err != nil || group == nil {
		return fmt.Errorf("group not found")
	}

	hasAccess, err := s.addressBookRepo.HasAccess(ctx, group.AddressBookID, userID, "write")
	if err != nil || !hasAccess {
		return fmt.Errorf("access denied")
	}

	return s.groupRepo.Delete(ctx, groupID)
}

func (s *ContactService) AddContactToGroup(ctx context.Context, userID, contactID, groupID uuid.UUID) error {
	return s.groupRepo.AddContact(ctx, contactID, groupID)
}

func (s *ContactService) RemoveContactFromGroup(ctx context.Context, userID, contactID, groupID uuid.UUID) error {
	return s.groupRepo.RemoveContact(ctx, contactID, groupID)
}

func (s *ContactService) SetContactGroups(ctx context.Context, contactID uuid.UUID, groupIDs []uuid.UUID) error {
	return s.groupRepo.SetContactGroups(ctx, contactID, groupIDs)
}

// Import/Export

func (s *ContactService) ImportContacts(ctx context.Context, userID uuid.UUID, req *models.ImportRequest) (*models.ImportResult, error) {
	switch req.Format {
	case "vcard":
		return s.importVCard(ctx, userID, req)
	case "csv":
		return s.importCSV(ctx, userID, req)
	default:
		return nil, fmt.Errorf("unsupported format: %s", req.Format)
	}
}

func (s *ContactService) importVCard(ctx context.Context, userID uuid.UUID, req *models.ImportRequest) (*models.ImportResult, error) {
	result := &models.ImportResult{}

	// Parse vCard data
	vcards := parseVCards(req.Data)
	result.Total = len(vcards)

	for _, vcard := range vcards {
		contact := vCardToContact(vcard)
		contact.AddressBookID = req.AddressBookID
		contact.ID = uuid.New()
		contact.UID = fmt.Sprintf("%s@contacts.local", uuid.New().String())

		if err := s.contactRepo.Create(ctx, contact); err != nil {
			result.Skipped++
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to import: %s - %v", contact.DisplayName, err))
		} else {
			result.Imported++
		}
	}

	return result, nil
}

func (s *ContactService) importCSV(ctx context.Context, userID uuid.UUID, req *models.ImportRequest) (*models.ImportResult, error) {
	result := &models.ImportResult{}
	// CSV import implementation would go here
	return result, fmt.Errorf("CSV import not yet implemented")
}

func (s *ContactService) ExportContacts(ctx context.Context, userID uuid.UUID, addressBookID uuid.UUID, format string) (string, error) {
	contacts, _, err := s.contactRepo.List(ctx, &models.ListContactsRequest{
		AddressBookID: addressBookID,
		Limit:         10000,
	}, userID)
	if err != nil {
		return "", err
	}

	switch format {
	case "vcard":
		return s.exportVCard(contacts), nil
	default:
		return "", fmt.Errorf("unsupported format: %s", format)
	}
}

func (s *ContactService) exportVCard(contacts []*models.Contact) string {
	var buf bytes.Buffer
	for _, c := range contacts {
		buf.WriteString(contactToVCard(c))
		buf.WriteString("\r\n")
	}
	return buf.String()
}

// Merge duplicates

func (s *ContactService) MergeContacts(ctx context.Context, userID uuid.UUID, req *models.MergeRequest) (*models.Contact, error) {
	// Get primary contact
	primary, err := s.contactRepo.GetByID(ctx, req.PrimaryID)
	if err != nil || primary == nil {
		return nil, fmt.Errorf("primary contact not found")
	}

	// Merge data from other contacts
	for _, mergeID := range req.MergeIDs {
		if mergeID == req.PrimaryID {
			continue
		}

		mergeContact, err := s.contactRepo.GetByID(ctx, mergeID)
		if err != nil || mergeContact == nil {
			continue
		}

		// Merge emails
		for _, e := range mergeContact.Emails {
			if !containsEmail(primary.Emails, e.Email) {
				primary.Emails = append(primary.Emails, e)
			}
		}

		// Merge phones
		for _, p := range mergeContact.Phones {
			if !containsPhone(primary.Phones, p.Number) {
				primary.Phones = append(primary.Phones, p)
			}
		}

		// Delete merged contact
		s.contactRepo.Delete(ctx, mergeID)
	}

	// Update primary
	if err := s.contactRepo.Update(ctx, primary); err != nil {
		return nil, err
	}

	return primary, nil
}

func (s *ContactService) FindDuplicates(ctx context.Context, userID uuid.UUID) ([]*models.DuplicateGroup, error) {
	return s.contactRepo.FindDuplicates(ctx, userID)
}

// CardDAV support

func (s *ContactService) GetContactByUID(ctx context.Context, addressBookID uuid.UUID, uid string) (*models.Contact, error) {
	return s.contactRepo.GetByUID(ctx, addressBookID, uid)
}

func (s *ContactService) GetMultipleContactsByUID(ctx context.Context, addressBookID uuid.UUID, uids []string) ([]*models.Contact, error) {
	return s.contactRepo.GetMultipleByUIDs(ctx, addressBookID, uids)
}

func (s *ContactService) GetSyncChanges(ctx context.Context, addressBookID uuid.UUID, syncToken string) ([]*models.Contact, string, error) {
	return s.addressBookRepo.GetSyncChanges(ctx, addressBookID, syncToken)
}

func (s *ContactService) CreateOrUpdateContact(ctx context.Context, userID, addressBookID uuid.UUID, uid string, contact *models.Contact) error {
	existing, err := s.contactRepo.GetByUID(ctx, addressBookID, uid)
	if err != nil {
		return err
	}

	if existing != nil {
		contact.ID = existing.ID
		contact.AddressBookID = addressBookID
		contact.UID = uid
		return s.contactRepo.Update(ctx, contact)
	}

	contact.ID = uuid.New()
	contact.AddressBookID = addressBookID
	contact.UID = uid
	return s.contactRepo.Create(ctx, contact)
}

func (s *ContactService) DeleteContactByUID(ctx context.Context, addressBookID uuid.UUID, uid string) error {
	return s.contactRepo.DeleteByUID(ctx, addressBookID, uid)
}

// Helper functions

func parseVCards(data string) []map[string]string {
	var vcards []map[string]string
	var current map[string]string

	scanner := bufio.NewScanner(strings.NewReader(data))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		if strings.HasPrefix(line, "BEGIN:VCARD") {
			current = make(map[string]string)
		} else if strings.HasPrefix(line, "END:VCARD") {
			if current != nil {
				vcards = append(vcards, current)
			}
			current = nil
		} else if current != nil && strings.Contains(line, ":") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				key := strings.Split(parts[0], ";")[0]
				current[key] = parts[1]
			}
		}
	}

	return vcards
}

func vCardToContact(vcard map[string]string) *models.Contact {
	contact := &models.Contact{}

	if fn := vcard["FN"]; fn != "" {
		contact.DisplayName = fn
	}

	if n := vcard["N"]; n != "" {
		parts := strings.Split(n, ";")
		if len(parts) >= 1 {
			contact.LastName = parts[0]
		}
		if len(parts) >= 2 {
			contact.FirstName = parts[1]
		}
		if len(parts) >= 3 {
			contact.MiddleName = parts[2]
		}
		if len(parts) >= 4 {
			contact.Prefix = parts[3]
		}
		if len(parts) >= 5 {
			contact.Suffix = parts[4]
		}
	}

	if org := vcard["ORG"]; org != "" {
		contact.Company = strings.Split(org, ";")[0]
	}

	if title := vcard["TITLE"]; title != "" {
		contact.JobTitle = title
	}

	if email := vcard["EMAIL"]; email != "" {
		contact.Emails = append(contact.Emails, models.ContactEmail{
			Type:    "work",
			Email:   email,
			Primary: true,
		})
	}

	if tel := vcard["TEL"]; tel != "" {
		contact.Phones = append(contact.Phones, models.ContactPhone{
			Type:    "work",
			Number:  tel,
			Primary: true,
		})
	}

	if note := vcard["NOTE"]; note != "" {
		contact.Notes = note
	}

	if bday := vcard["BDAY"]; bday != "" {
		if t, err := time.Parse("20060102", bday); err == nil {
			contact.Birthday = &t
		}
	}

	return contact
}

func contactToVCard(c *models.Contact) string {
	var buf bytes.Buffer
	buf.WriteString("BEGIN:VCARD\r\n")
	buf.WriteString("VERSION:3.0\r\n")
	buf.WriteString(fmt.Sprintf("UID:%s\r\n", c.UID))
	buf.WriteString(fmt.Sprintf("FN:%s\r\n", c.DisplayName))
	buf.WriteString(fmt.Sprintf("N:%s;%s;%s;%s;%s\r\n",
		c.LastName, c.FirstName, c.MiddleName, c.Prefix, c.Suffix))

	if c.Company != "" {
		buf.WriteString(fmt.Sprintf("ORG:%s\r\n", c.Company))
	}
	if c.JobTitle != "" {
		buf.WriteString(fmt.Sprintf("TITLE:%s\r\n", c.JobTitle))
	}

	for _, e := range c.Emails {
		buf.WriteString(fmt.Sprintf("EMAIL;TYPE=%s:%s\r\n", strings.ToUpper(e.Type), e.Email))
	}

	for _, p := range c.Phones {
		buf.WriteString(fmt.Sprintf("TEL;TYPE=%s:%s\r\n", strings.ToUpper(p.Type), p.Number))
	}

	for _, a := range c.Addresses {
		buf.WriteString(fmt.Sprintf("ADR;TYPE=%s:;;%s;%s;%s;%s;%s\r\n",
			strings.ToUpper(a.Type), a.Street, a.City, a.State, a.PostalCode, a.Country))
	}

	if c.Birthday != nil {
		buf.WriteString(fmt.Sprintf("BDAY:%s\r\n", c.Birthday.Format("20060102")))
	}

	if c.Notes != "" {
		buf.WriteString(fmt.Sprintf("NOTE:%s\r\n", c.Notes))
	}

	if len(c.PhotoData) > 0 {
		encoded := base64.StdEncoding.EncodeToString(c.PhotoData)
		buf.WriteString(fmt.Sprintf("PHOTO;ENCODING=b;TYPE=JPEG:%s\r\n", encoded))
	}

	buf.WriteString(fmt.Sprintf("REV:%s\r\n", c.UpdatedAt.Format("20060102T150405Z")))
	buf.WriteString("END:VCARD\r\n")

	return buf.String()
}

func containsEmail(emails []models.ContactEmail, email string) bool {
	for _, e := range emails {
		if strings.EqualFold(e.Email, email) {
			return true
		}
	}
	return false
}

func containsPhone(phones []models.ContactPhone, number string) bool {
	for _, p := range phones {
		if p.Number == number {
			return true
		}
	}
	return false
}
