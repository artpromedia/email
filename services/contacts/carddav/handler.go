package carddav

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"

	"contacts-service/models"
	"contacts-service/service"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

const (
	nsDAV    = "DAV:"
	nsCardAV = "urn:ietf:params:xml:ns:carddav"
)

type CardDAVHandler struct {
	service *service.ContactService
	logger  *zap.Logger
	domain  string
}

func NewCardDAVHandler(service *service.ContactService, logger *zap.Logger, domain string) *CardDAVHandler {
	return &CardDAVHandler{
		service: service,
		logger:  logger,
		domain:  domain,
	}
}

// ServeHTTP routes CardDAV requests
func (h *CardDAVHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.logger.Debug("CardDAV request",
		zap.String("method", r.Method),
		zap.String("path", r.URL.Path))

	switch r.Method {
	case "OPTIONS":
		h.handleOptions(w, r)
	case "PROPFIND":
		h.handlePropfind(w, r)
	case "PROPPATCH":
		h.handleProppatch(w, r)
	case "REPORT":
		h.handleReport(w, r)
	case "MKCOL":
		h.handleMkcol(w, r)
	case "GET":
		h.handleGet(w, r)
	case "PUT":
		h.handlePut(w, r)
	case "DELETE":
		h.handleDelete(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *CardDAVHandler) handleOptions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Allow", "OPTIONS, GET, PUT, DELETE, PROPFIND, PROPPATCH, REPORT, MKCOL")
	w.Header().Set("DAV", "1, 2, 3, addressbook")
	w.WriteHeader(http.StatusOK)
}

func (h *CardDAVHandler) handlePropfind(w http.ResponseWriter, r *http.Request) {
	userID := h.getUserID(r)
	path := r.URL.Path
	depth := r.Header.Get("Depth")
	if depth == "" {
		depth = "1"
	}

	body, _ := io.ReadAll(r.Body)

	var propfind PropfindRequest
	if len(body) > 0 {
		xml.Unmarshal(body, &propfind)
	}

	var response MultiStatus

	// Root discovery
	if path == "/carddav" || path == "/carddav/" {
		response = h.propfindRoot(userID, depth)
	} else if strings.Contains(path, "/addressbooks/") {
		// Address book or contact
		response = h.propfindAddressBook(r.Context(), userID, path, depth)
	} else {
		// User principal
		response = h.propfindPrincipal(userID, path, depth)
	}

	h.writeMultiStatus(w, response)
}

func (h *CardDAVHandler) propfindRoot(userID uuid.UUID, depth string) MultiStatus {
	return MultiStatus{
		Responses: []Response{
			{
				Href: "/carddav/",
				Propstat: []Propstat{
					{
						Status: "HTTP/1.1 200 OK",
						Prop: Prop{
							ResourceType: &ResourceType{
								Collection: &struct{}{},
							},
							CurrentUserPrincipal: &CurrentUserPrincipal{
								Href: fmt.Sprintf("/carddav/%s/", userID.String()),
							},
						},
					},
				},
			},
		},
	}
}

func (h *CardDAVHandler) propfindPrincipal(userID uuid.UUID, path, depth string) MultiStatus {
	return MultiStatus{
		Responses: []Response{
			{
				Href: path,
				Propstat: []Propstat{
					{
						Status: "HTTP/1.1 200 OK",
						Prop: Prop{
							ResourceType: &ResourceType{
								Collection: &struct{}{},
							},
							AddressbookHomeSet: &AddressbookHomeSet{
								Href: fmt.Sprintf("/carddav/%s/addressbooks/", userID.String()),
							},
							DisplayName: "User",
						},
					},
				},
			},
		},
	}
}

func (h *CardDAVHandler) propfindAddressBook(ctx context.Context, userID uuid.UUID, path, depth string) MultiStatus {
	responses := []Response{}

	parts := strings.Split(strings.Trim(path, "/"), "/")

	// /carddav/{user}/addressbooks/
	if len(parts) == 3 || (len(parts) == 4 && parts[3] == "") {
		// List all address books
		addressBooks, _ := h.service.ListAddressBooks(ctx, userID)

		responses = append(responses, Response{
			Href: path,
			Propstat: []Propstat{
				{
					Status: "HTTP/1.1 200 OK",
					Prop: Prop{
						ResourceType: &ResourceType{
							Collection: &struct{}{},
						},
						DisplayName: "Address Books",
					},
				},
			},
		})

		if depth != "0" {
			for _, ab := range addressBooks {
				responses = append(responses, Response{
					Href: fmt.Sprintf("/carddav/%s/addressbooks/%s/", userID.String(), ab.ID.String()),
					Propstat: []Propstat{
						{
							Status: "HTTP/1.1 200 OK",
							Prop: Prop{
								ResourceType: &ResourceType{
									Collection:  &struct{}{},
									Addressbook: &struct{}{},
								},
								DisplayName:        ab.Name,
								SyncToken:          ab.SyncToken,
								SupportedReportSet: h.supportedReports(),
							},
						},
					},
				})
			}
		}
	} else if len(parts) >= 4 {
		// Specific address book
		abID, err := uuid.Parse(parts[3])
		if err != nil {
			return MultiStatus{}
		}

		ab, _ := h.service.GetAddressBook(ctx, userID, abID)
		if ab == nil {
			return MultiStatus{}
		}

		responses = append(responses, Response{
			Href: fmt.Sprintf("/carddav/%s/addressbooks/%s/", userID.String(), ab.ID.String()),
			Propstat: []Propstat{
				{
					Status: "HTTP/1.1 200 OK",
					Prop: Prop{
						ResourceType: &ResourceType{
							Collection:  &struct{}{},
							Addressbook: &struct{}{},
						},
						DisplayName:        ab.Name,
						SyncToken:          ab.SyncToken,
						SupportedReportSet: h.supportedReports(),
					},
				},
			},
		})

		if depth != "0" {
			contacts, _, _ := h.service.ListContacts(ctx, userID, &models.ListContactsRequest{
				AddressBookID: abID,
				Limit:         10000,
			})

			for _, c := range contacts {
				responses = append(responses, Response{
					Href: fmt.Sprintf("/carddav/%s/addressbooks/%s/%s.vcf", userID.String(), ab.ID.String(), c.UID),
					Propstat: []Propstat{
						{
							Status: "HTTP/1.1 200 OK",
							Prop: Prop{
								GetETag:     fmt.Sprintf(`"%d"`, c.UpdatedAt.Unix()),
								ContentType: "text/vcard; charset=utf-8",
							},
						},
					},
				})
			}
		}
	}

	return MultiStatus{Responses: responses}
}

func (h *CardDAVHandler) handleReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := h.getUserID(r)
	path := r.URL.Path

	body, _ := io.ReadAll(r.Body)

	// Parse report type
	if bytes.Contains(body, []byte("addressbook-multiget")) {
		h.handleMultiget(w, r, userID, path, body)
	} else if bytes.Contains(body, []byte("addressbook-query")) {
		h.handleQuery(w, r, userID, path)
	} else if bytes.Contains(body, []byte("sync-collection")) {
		h.handleSyncCollection(w, r, userID, path, body)
	} else {
		w.WriteHeader(http.StatusBadRequest)
	}
}

func (h *CardDAVHandler) handleMultiget(w http.ResponseWriter, r *http.Request, userID uuid.UUID, path string, body []byte) {
	ctx := r.Context()
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 4 {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	abID, _ := uuid.Parse(parts[3])

	// Parse hrefs from body
	var multiget struct {
		XMLName xml.Name `xml:"addressbook-multiget"`
		Hrefs   []string `xml:"href"`
	}
	xml.Unmarshal(body, &multiget)

	var uids []string
	for _, href := range multiget.Hrefs {
		uid := strings.TrimSuffix(strings.TrimPrefix(href, path), ".vcf")
		if uid != "" {
			uids = append(uids, uid)
		}
	}

	contacts, _ := h.service.GetMultipleContactsByUID(ctx, abID, uids)

	var responses []Response
	for _, c := range contacts {
		responses = append(responses, Response{
			Href: fmt.Sprintf("%s%s.vcf", path, c.UID),
			Propstat: []Propstat{
				{
					Status: "HTTP/1.1 200 OK",
					Prop: Prop{
						GetETag:         fmt.Sprintf(`"%d"`, c.UpdatedAt.Unix()),
						AddressData:     h.contactToVCard(c),
						ContentType:     "text/vcard; charset=utf-8",
					},
				},
			},
		})
	}

	h.writeMultiStatus(w, MultiStatus{Responses: responses})
}

func (h *CardDAVHandler) handleQuery(w http.ResponseWriter, r *http.Request, userID uuid.UUID, path string) {
	ctx := r.Context()
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 4 {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	abID, _ := uuid.Parse(parts[3])

	contacts, _, _ := h.service.ListContacts(ctx, userID, &models.ListContactsRequest{
		AddressBookID: abID,
		Limit:         10000,
	})

	var responses []Response
	for _, c := range contacts {
		responses = append(responses, Response{
			Href: fmt.Sprintf("%s%s.vcf", path, c.UID),
			Propstat: []Propstat{
				{
					Status: "HTTP/1.1 200 OK",
					Prop: Prop{
						GetETag:     fmt.Sprintf(`"%d"`, c.UpdatedAt.Unix()),
						AddressData: h.contactToVCard(c),
					},
				},
			},
		})
	}

	h.writeMultiStatus(w, MultiStatus{Responses: responses})
}

func (h *CardDAVHandler) handleSyncCollection(w http.ResponseWriter, r *http.Request, userID uuid.UUID, path string, body []byte) {
	ctx := r.Context()
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 4 {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	abID, _ := uuid.Parse(parts[3])

	var syncRequest struct {
		XMLName   xml.Name `xml:"sync-collection"`
		SyncToken string   `xml:"sync-token"`
	}
	xml.Unmarshal(body, &syncRequest)

	contacts, newToken, _ := h.service.GetSyncChanges(ctx, abID, syncRequest.SyncToken)

	var responses []Response
	for _, c := range contacts {
		responses = append(responses, Response{
			Href: fmt.Sprintf("%s%s.vcf", path, c.UID),
			Propstat: []Propstat{
				{
					Status: "HTTP/1.1 200 OK",
					Prop: Prop{
						GetETag: fmt.Sprintf(`"%d"`, c.UpdatedAt.Unix()),
					},
				},
			},
		})
	}

	ms := MultiStatus{
		Responses: responses,
		SyncToken: newToken,
	}
	h.writeMultiStatus(w, ms)
}

func (h *CardDAVHandler) handleMkcol(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := h.getUserID(r)

	body, _ := io.ReadAll(r.Body)

	var mkcol struct {
		XMLName     xml.Name `xml:"mkcol"`
		DisplayName string   `xml:"set>prop>displayname"`
	}
	xml.Unmarshal(body, &mkcol)

	name := mkcol.DisplayName
	if name == "" {
		name = "New Address Book"
	}

	_, err := h.service.CreateAddressBook(ctx, userID, &models.CreateAddressBookRequest{
		Name: name,
	})
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func (h *CardDAVHandler) handleProppatch(w http.ResponseWriter, r *http.Request) {
	// Simplified - just return success
	w.WriteHeader(http.StatusOK)
}

func (h *CardDAVHandler) handleGet(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := h.getUserID(r)
	path := r.URL.Path

	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 5 {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	abID, _ := uuid.Parse(parts[3])
	uid := strings.TrimSuffix(parts[4], ".vcf")

	contact, err := h.service.GetContactByUID(ctx, abID, uid)
	if err != nil || contact == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	// Check access
	_, err = h.service.GetAddressBook(ctx, userID, abID)
	if err != nil {
		w.WriteHeader(http.StatusForbidden)
		return
	}

	vcard := h.contactToVCard(contact)

	w.Header().Set("Content-Type", "text/vcard; charset=utf-8")
	w.Header().Set("ETag", fmt.Sprintf(`"%d"`, contact.UpdatedAt.Unix()))
	w.Write([]byte(vcard))
}

func (h *CardDAVHandler) handlePut(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := h.getUserID(r)
	path := r.URL.Path

	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 5 {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	abID, _ := uuid.Parse(parts[3])
	uid := strings.TrimSuffix(parts[4], ".vcf")

	body, _ := io.ReadAll(r.Body)
	contact := h.parseVCard(string(body))
	contact.UID = uid

	err := h.service.CreateOrUpdateContact(ctx, userID, abID, uid, contact)
	if err != nil {
		h.logger.Error("Failed to save contact", zap.Error(err))
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func (h *CardDAVHandler) handleDelete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	path := r.URL.Path

	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 5 {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	abID, _ := uuid.Parse(parts[3])
	uid := strings.TrimSuffix(parts[4], ".vcf")

	err := h.service.DeleteContactByUID(ctx, abID, uid)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *CardDAVHandler) getUserID(r *http.Request) uuid.UUID {
	if id, ok := r.Context().Value("user_id").(uuid.UUID); ok {
		return id
	}
	return uuid.Nil
}

func (h *CardDAVHandler) supportedReports() *SupportedReportSet {
	return &SupportedReportSet{
		Reports: []SupportedReport{
			{Report: Report{AddressbookMultiget: &struct{}{}}},
			{Report: Report{AddressbookQuery: &struct{}{}}},
			{Report: Report{SyncCollection: &struct{}{}}},
		},
	}
}

func (h *CardDAVHandler) writeMultiStatus(w http.ResponseWriter, ms MultiStatus) {
	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.WriteHeader(http.StatusMultiStatus)

	output, _ := xml.MarshalIndent(ms, "", "  ")
	w.Write([]byte(xml.Header))
	w.Write(output)
}

func (h *CardDAVHandler) contactToVCard(c *models.Contact) string {
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

	buf.WriteString(fmt.Sprintf("REV:%s\r\n", c.UpdatedAt.Format("20060102T150405Z")))
	buf.WriteString("END:VCARD\r\n")

	return buf.String()
}

func (h *CardDAVHandler) parseVCard(data string) *models.Contact {
	contact := &models.Contact{}
	lines := strings.Split(data, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.Contains(line, ":") {
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.Split(parts[0], ";")[0]
		value := parts[1]

		switch key {
		case "FN":
			contact.DisplayName = value
		case "N":
			nameParts := strings.Split(value, ";")
			if len(nameParts) >= 1 {
				contact.LastName = nameParts[0]
			}
			if len(nameParts) >= 2 {
				contact.FirstName = nameParts[1]
			}
			if len(nameParts) >= 3 {
				contact.MiddleName = nameParts[2]
			}
			if len(nameParts) >= 4 {
				contact.Prefix = nameParts[3]
			}
			if len(nameParts) >= 5 {
				contact.Suffix = nameParts[4]
			}
		case "ORG":
			contact.Company = strings.Split(value, ";")[0]
		case "TITLE":
			contact.JobTitle = value
		case "EMAIL":
			emailType := "other"
			if strings.Contains(parts[0], "WORK") {
				emailType = "work"
			} else if strings.Contains(parts[0], "HOME") {
				emailType = "home"
			}
			contact.Emails = append(contact.Emails, models.ContactEmail{
				Type:  emailType,
				Email: value,
			})
		case "TEL":
			phoneType := "other"
			if strings.Contains(parts[0], "CELL") || strings.Contains(parts[0], "MOBILE") {
				phoneType = "mobile"
			} else if strings.Contains(parts[0], "WORK") {
				phoneType = "work"
			} else if strings.Contains(parts[0], "HOME") {
				phoneType = "home"
			}
			contact.Phones = append(contact.Phones, models.ContactPhone{
				Type:   phoneType,
				Number: value,
			})
		case "NOTE":
			contact.Notes = value
		case "UID":
			contact.UID = value
		}
	}

	return contact
}

// XML types for CardDAV

type PropfindRequest struct {
	XMLName xml.Name `xml:"propfind"`
	Prop    *Prop    `xml:"prop"`
	Allprop *struct{} `xml:"allprop"`
}

type MultiStatus struct {
	XMLName   xml.Name   `xml:"DAV: multistatus"`
	Responses []Response `xml:"response"`
	SyncToken string     `xml:"sync-token,omitempty"`
}

type Response struct {
	Href     string     `xml:"href"`
	Propstat []Propstat `xml:"propstat"`
	Status   string     `xml:"status,omitempty"`
}

type Propstat struct {
	Prop   Prop   `xml:"prop"`
	Status string `xml:"status"`
}

type Prop struct {
	ResourceType         *ResourceType         `xml:"resourcetype,omitempty"`
	DisplayName          string                `xml:"displayname,omitempty"`
	CurrentUserPrincipal *CurrentUserPrincipal `xml:"current-user-principal,omitempty"`
	AddressbookHomeSet   *AddressbookHomeSet   `xml:"urn:ietf:params:xml:ns:carddav addressbook-home-set,omitempty"`
	SupportedReportSet   *SupportedReportSet   `xml:"supported-report-set,omitempty"`
	GetETag              string                `xml:"getetag,omitempty"`
	ContentType          string                `xml:"getcontenttype,omitempty"`
	SyncToken            string                `xml:"sync-token,omitempty"`
	AddressData          string                `xml:"urn:ietf:params:xml:ns:carddav address-data,omitempty"`
}

type ResourceType struct {
	Collection  *struct{} `xml:"collection,omitempty"`
	Addressbook *struct{} `xml:"urn:ietf:params:xml:ns:carddav addressbook,omitempty"`
}

type CurrentUserPrincipal struct {
	Href string `xml:"href"`
}

type AddressbookHomeSet struct {
	Href string `xml:"href"`
}

type SupportedReportSet struct {
	Reports []SupportedReport `xml:"supported-report"`
}

type SupportedReport struct {
	Report Report `xml:"report"`
}

type Report struct {
	AddressbookMultiget *struct{} `xml:"urn:ietf:params:xml:ns:carddav addressbook-multiget,omitempty"`
	AddressbookQuery    *struct{} `xml:"urn:ietf:params:xml:ns:carddav addressbook-query,omitempty"`
	SyncCollection      *struct{} `xml:"sync-collection,omitempty"`
}
