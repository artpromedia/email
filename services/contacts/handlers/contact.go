package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"contacts-service/models"
	"contacts-service/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type ContactHandler struct {
	service *service.ContactService
	logger  *zap.Logger
}

func NewContactHandler(service *service.ContactService, logger *zap.Logger) *ContactHandler {
	return &ContactHandler{
		service: service,
		logger:  logger,
	}
}

// Address Book handlers

func (h *ContactHandler) CreateAddressBook(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req models.CreateAddressBookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	ab, err := h.service.CreateAddressBook(r.Context(), userID, &req)
	if err != nil {
		h.logger.Error("Failed to create address book", zap.Error(err))
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, ab)
}

func (h *ContactHandler) GetAddressBook(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	abID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid address book ID")
		return
	}

	ab, err := h.service.GetAddressBook(r.Context(), userID, abID)
	if err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if ab == nil {
		writeError(w, http.StatusNotFound, "Address book not found")
		return
	}

	writeJSON(w, http.StatusOK, ab)
}

func (h *ContactHandler) ListAddressBooks(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	addressBooks, err := h.service.ListAddressBooks(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, addressBooks)
}

func (h *ContactHandler) UpdateAddressBook(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	abID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid address book ID")
		return
	}

	var req models.UpdateAddressBookRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	ab, err := h.service.UpdateAddressBook(r.Context(), userID, abID, &req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, ab)
}

func (h *ContactHandler) DeleteAddressBook(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	abID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid address book ID")
		return
	}

	if err := h.service.DeleteAddressBook(r.Context(), userID, abID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ContactHandler) ShareAddressBook(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	abID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid address book ID")
		return
	}

	var req struct {
		UserID     uuid.UUID `json:"user_id"`
		Permission string    `json:"permission"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := h.service.ShareAddressBook(r.Context(), userID, abID, req.UserID, req.Permission); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Contact handlers

func (h *ContactHandler) CreateContact(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req models.CreateContactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	contact, err := h.service.CreateContact(r.Context(), userID, &req)
	if err != nil {
		h.logger.Error("Failed to create contact", zap.Error(err))
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, contact)
}

func (h *ContactHandler) GetContact(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	contactID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid contact ID")
		return
	}

	contact, err := h.service.GetContact(r.Context(), userID, contactID)
	if err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}
	if contact == nil {
		writeError(w, http.StatusNotFound, "Contact not found")
		return
	}

	writeJSON(w, http.StatusOK, contact)
}

func (h *ContactHandler) ListContacts(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	req := &models.ListContactsRequest{
		Limit:  100,
		Offset: 0,
	}

	if q := r.URL.Query().Get("q"); q != "" {
		req.Query = q
	}
	if abID := r.URL.Query().Get("address_book_id"); abID != "" {
		if id, err := uuid.Parse(abID); err == nil {
			req.AddressBookID = id
		}
	}
	if starred := r.URL.Query().Get("starred"); starred == "true" {
		s := true
		req.Starred = &s
	}
	if groupID := r.URL.Query().Get("group_id"); groupID != "" {
		if id, err := uuid.Parse(groupID); err == nil {
			req.GroupID = id
		}
	}

	response, err := h.service.ListContacts(r.Context(), userID, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (h *ContactHandler) SearchContacts(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	query := r.URL.Query().Get("q")
	if query == "" {
		writeError(w, http.StatusBadRequest, "Missing search query")
		return
	}

	contacts, err := h.service.SearchContacts(r.Context(), userID, query, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, contacts)
}

func (h *ContactHandler) UpdateContact(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	contactID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid contact ID")
		return
	}

	var req models.UpdateContactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	contact, err := h.service.UpdateContact(r.Context(), userID, contactID, &req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, contact)
}

func (h *ContactHandler) DeleteContact(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	contactID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid contact ID")
		return
	}

	if err := h.service.DeleteContact(r.Context(), userID, contactID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ContactHandler) UploadPhoto(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	contactID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid contact ID")
		return
	}

	r.ParseMultipartForm(10 << 20) // 10 MB max

	file, _, err := r.FormFile("photo")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Failed to read photo")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to read photo data")
		return
	}

	if err := h.service.UpdatePhoto(r.Context(), userID, contactID, "", data); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ContactHandler) ImportContacts(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req models.ImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	result, err := h.service.ImportContacts(r.Context(), userID, &req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (h *ContactHandler) ExportContacts(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "vcard"
	}

	var addressBookID uuid.UUID
	if abID := r.URL.Query().Get("address_book_id"); abID != "" {
		addressBookID, _ = uuid.Parse(abID)
	}

	data, err := h.service.ExportContacts(r.Context(), userID, addressBookID, format)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "text/vcard; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=contacts.vcf")
	w.Write([]byte(data))
}

func (h *ContactHandler) FindDuplicates(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	duplicates, err := h.service.FindDuplicates(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, duplicates)
}

func (h *ContactHandler) MergeContacts(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req models.MergeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	contact, err := h.service.MergeContacts(r.Context(), userID, &req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, contact)
}

// Group handlers

func (h *ContactHandler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var req models.CreateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	group, err := h.service.CreateGroup(r.Context(), userID, &req)
	if err != nil {
		h.logger.Error("Failed to create group", zap.Error(err))
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, group)
}

func (h *ContactHandler) GetGroup(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	group, err := h.service.GetGroup(r.Context(), userID, groupID)
	if err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, group)
}

func (h *ContactHandler) ListGroups(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	var addressBookID uuid.UUID
	if abID := r.URL.Query().Get("address_book_id"); abID != "" {
		addressBookID, _ = uuid.Parse(abID)
	}

	groups, err := h.service.ListGroups(r.Context(), userID, addressBookID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, groups)
}

func (h *ContactHandler) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	var req models.UpdateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	group, err := h.service.UpdateGroup(r.Context(), userID, groupID, &req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, group)
}

func (h *ContactHandler) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	if err := h.service.DeleteGroup(r.Context(), userID, groupID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ContactHandler) AddContactsToGroup(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	var req struct {
		ContactIDs []uuid.UUID `json:"contact_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	for _, cid := range req.ContactIDs {
		h.service.AddContactToGroup(r.Context(), userID, cid, groupID)
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ContactHandler) RemoveContactFromGroup(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	groupID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}
	contactID, err := uuid.Parse(chi.URLParam(r, "contactId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Invalid contact ID")
		return
	}

	if err := h.service.RemoveContactFromGroup(r.Context(), userID, contactID, groupID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Helper functions

func getUserID(r *http.Request) uuid.UUID {
	if id, ok := r.Context().Value("user_id").(uuid.UUID); ok {
		return id
	}
	return uuid.Nil
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
