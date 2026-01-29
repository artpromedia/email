# Multi-Domain Compose API Implementation Guide

This document provides implementation guidance for backend services supporting the multi-domain
email compose feature.

## Table of Contents

1. [Sendable Addresses API](#sendable-addresses-api)
2. [Signature Management API](#signature-management-api)
3. [Domain Branding API](#domain-branding-api)
4. [Permission Validation API](#permission-validation-api)
5. [Recipient Hints API](#recipient-hints-api)
6. [Send Email API](#send-email-api)
7. [Database Schema](#database-schema)
8. [Go Implementation Examples](#go-implementation-examples)

---

## Sendable Addresses API

### Endpoint

```
GET /api/v1/mail/compose/addresses
Authorization: Bearer <token>
```

### Implementation Logic

```go
func GetSendableAddresses(userId string, orgId string) (*SendableAddressesResponse, error) {
    addresses := []SendableAddress{}

    // 1. Get user's personal email addresses
    personalAddresses, err := db.GetUserEmailAddresses(userId)
    if err != nil {
        return nil, err
    }

    for _, addr := range personalAddresses {
        domain, _ := db.GetDomain(addr.DomainId)
        addresses = append(addresses, SendableAddress{
            Id:           addr.Id,
            Email:        addr.Email,
            DisplayName:  addr.DisplayName,
            Formatted:    formatAddress(addr.DisplayName, addr.Email),
            DomainId:     addr.DomainId,
            DomainName:   domain.Name,
            DomainColor:  domain.Color,
            Type:         "personal",
            IsPrimary:    addr.IsPrimary,
            SendAs:       "send-as",
            IsVerified:   domain.IsVerified,
            DailyLimit:   domain.DailyLimit,
            SentToday:    countSentToday(addr.Id),
        })
    }

    // 2. Get user's aliases
    aliases, err := db.GetUserAliases(userId)
    if err != nil {
        return nil, err
    }

    for _, alias := range aliases {
        domain, _ := db.GetDomain(alias.DomainId)
        addresses = append(addresses, SendableAddress{
            Id:           alias.Id,
            Email:        alias.Email,
            DisplayName:  alias.DisplayName,
            Formatted:    formatAddress(alias.DisplayName, alias.Email),
            DomainId:     alias.DomainId,
            DomainName:   domain.Name,
            DomainColor:  domain.Color,
            Type:         "alias",
            IsPrimary:    false,
            SendAs:       "send-as",
            IsVerified:   domain.IsVerified,
            DailyLimit:   domain.DailyLimit,
            SentToday:    countSentToday(alias.Id),
        })
    }

    // 3. Get shared mailboxes user has access to
    sharedMailboxes, err := db.GetUserSharedMailboxes(userId)
    if err != nil {
        return nil, err
    }

    for _, mailbox := range sharedMailboxes {
        domain, _ := db.GetDomain(mailbox.DomainId)

        // Determine send permission type
        sendAs := determineSendAs(mailbox.Permissions)

        addresses = append(addresses, SendableAddress{
            Id:           mailbox.Id,
            Email:        mailbox.Email,
            DisplayName:  mailbox.DisplayName,
            Formatted:    formatAddress(mailbox.DisplayName, mailbox.Email),
            DomainId:     mailbox.DomainId,
            DomainName:   domain.Name,
            DomainColor:  domain.Color,
            Type:         "shared",
            IsPrimary:    false,
            SendAs:       sendAs,
            IsVerified:   domain.IsVerified,
            DailyLimit:   domain.DailyLimit,
            SentToday:    countSentToday(mailbox.Id),
        })
    }

    // 4. Get primary address ID
    primaryAddressId := ""
    for _, addr := range addresses {
        if addr.IsPrimary {
            primaryAddressId = addr.Id
            break
        }
    }

    return &SendableAddressesResponse{
        Addresses:        addresses,
        PrimaryAddressId: primaryAddressId,
    }, nil
}

func determineSendAs(permissions SharedMailboxPermissions) string {
    if permissions.CanSendAs && permissions.CanSendOnBehalf {
        return "both"
    } else if permissions.CanSendAs {
        return "send-as"
    } else if permissions.CanSendOnBehalf {
        return "send-on-behalf"
    }
    return ""
}

func formatAddress(displayName, email string) string {
    if displayName != "" {
        return fmt.Sprintf("%s <%s>", displayName, email)
    }
    return email
}
```

### SQL Queries

```sql
-- Get user's email addresses
SELECT
    ea.id,
    ea.email,
    ea.display_name,
    ea.domain_id,
    ea.is_primary,
    d.name as domain_name,
    d.color as domain_color,
    d.is_verified as domain_verified,
    d.daily_send_limit
FROM email_addresses ea
JOIN domains d ON ea.domain_id = d.id
WHERE ea.user_id = $1
  AND ea.is_active = true
  AND d.organization_id = $2;

-- Get user's shared mailbox memberships
SELECT
    sm.id,
    sm.email,
    sm.display_name,
    sm.domain_id,
    smm.can_send_as,
    smm.can_send_on_behalf,
    d.name as domain_name,
    d.color as domain_color,
    d.is_verified as domain_verified,
    d.daily_send_limit
FROM shared_mailboxes sm
JOIN shared_mailbox_members smm ON sm.id = smm.mailbox_id
JOIN domains d ON sm.domain_id = d.id
WHERE smm.user_id = $1
  AND sm.is_active = true
  AND d.organization_id = $2
  AND (smm.can_send_as = true OR smm.can_send_on_behalf = true);

-- Count emails sent today
SELECT COUNT(*)
FROM emails
WHERE from_address_id = $1
  AND sent_at >= CURRENT_DATE;
```

---

## Signature Management API

### Endpoint

```
GET /api/v1/mail/compose/signatures
Authorization: Bearer <token>
```

### Implementation Logic

```go
func GetUserSignatures(userId string, orgId string) (*SignaturesResponse, error) {
    signatures := []EmailSignature{}

    // 1. Get address-level signatures
    addressSigs, err := db.Query(`
        SELECT id, name, content, content_html, level, address_id, is_default
        FROM email_signatures
        WHERE user_id = $1
          AND organization_id = $2
          AND level = 'address'
          AND is_active = true
        ORDER BY is_default DESC, name ASC
    `, userId, orgId)

    signatures = append(signatures, addressSigs...)

    // 2. Get domain-level signatures
    domainSigs, err := db.Query(`
        SELECT id, name, content, content_html, level, domain_id, is_default
        FROM email_signatures
        WHERE user_id = $1
          AND organization_id = $2
          AND level = 'domain'
          AND is_active = true
        ORDER BY is_default DESC, name ASC
    `, userId, orgId)

    signatures = append(signatures, domainSigs...)

    // 3. Get global-level signatures
    globalSigs, err := db.Query(`
        SELECT id, name, content, content_html, level, is_default
        FROM email_signatures
        WHERE user_id = $1
          AND organization_id = $2
          AND level = 'global'
          AND is_active = true
        ORDER BY is_default DESC, name ASC
    `, userId, orgId)

    signatures = append(signatures, globalSigs...)

    return &SignaturesResponse{
        Signatures: signatures,
    }, nil
}
```

### Create/Update Signature

```go
func CreateSignature(userId, orgId string, req CreateSignatureRequest) (*EmailSignature, error) {
    // Validate HTML
    sanitizedHtml := sanitizeHTML(req.ContentHtml)

    // If setting as default, unset other defaults at same level
    if req.IsDefault {
        switch req.Level {
        case "address":
            db.Exec(`
                UPDATE email_signatures
                SET is_default = false
                WHERE user_id = $1
                  AND level = 'address'
                  AND address_id = $2
            `, userId, req.AddressId)
        case "domain":
            db.Exec(`
                UPDATE email_signatures
                SET is_default = false
                WHERE user_id = $1
                  AND level = 'domain'
                  AND domain_id = $2
            `, userId, req.DomainId)
        case "global":
            db.Exec(`
                UPDATE email_signatures
                SET is_default = false
                WHERE user_id = $1
                  AND level = 'global'
            `, userId)
        }
    }

    // Insert new signature
    sig := &EmailSignature{}
    err := db.QueryRow(`
        INSERT INTO email_signatures
        (id, user_id, organization_id, name, content, content_html, level, address_id, domain_id, is_default, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
        RETURNING id, name, content, content_html, level, address_id, domain_id, is_default
    `, uuid.New(), userId, orgId, req.Name, req.Content, sanitizedHtml, req.Level, req.AddressId, req.DomainId, req.IsDefault).Scan(sig)

    return sig, err
}
```

---

## Domain Branding API

### Endpoint

```
GET /api/v1/mail/compose/branding/:domainId
Authorization: Bearer <token>
```

### Implementation Logic

```go
func GetDomainBranding(domainId, orgId string) (*EmailBranding, error) {
    branding := &EmailBranding{}

    err := db.QueryRow(`
        SELECT
            domain_id,
            domain_name,
            header_html,
            footer_html,
            logo_url,
            brand_color,
            enabled
        FROM domain_email_branding
        WHERE domain_id = $1
          AND organization_id = $2
    `, domainId, orgId).Scan(
        &branding.DomainId,
        &branding.DomainName,
        &branding.HeaderHtml,
        &branding.FooterHtml,
        &branding.LogoUrl,
        &branding.BrandColor,
        &branding.Enabled,
    )

    if err == sql.ErrNoRows {
        // Return empty branding with enabled = false
        return &EmailBranding{
            DomainId:   domainId,
            DomainName: getDomainName(domainId),
            Enabled:    false,
        }, nil
    }

    if err != nil {
        return nil, err
    }

    // Sanitize HTML
    branding.HeaderHtml = sanitizeHTML(branding.HeaderHtml)
    branding.FooterHtml = sanitizeHTML(branding.FooterHtml)

    return branding, nil
}
```

### Update Branding

```go
func UpdateDomainBranding(domainId, orgId string, req UpdateBrandingRequest) error {
    // Sanitize HTML
    headerHtml := sanitizeHTML(req.HeaderHtml)
    footerHtml := sanitizeHTML(req.FooterHtml)

    _, err := db.Exec(`
        INSERT INTO domain_email_branding
        (domain_id, organization_id, domain_name, header_html, footer_html, logo_url, brand_color, enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (domain_id)
        DO UPDATE SET
            header_html = EXCLUDED.header_html,
            footer_html = EXCLUDED.footer_html,
            logo_url = EXCLUDED.logo_url,
            brand_color = EXCLUDED.brand_color,
            enabled = EXCLUDED.enabled,
            updated_at = NOW()
    `, domainId, orgId, req.DomainName, headerHtml, footerHtml, req.LogoUrl, req.BrandColor, req.Enabled)

    return err
}
```

---

## Permission Validation API

### Endpoint

```
GET /api/v1/mail/compose/validate/:addressId
Authorization: Bearer <token>
```

### Implementation Logic

```go
func ValidateSendPermission(userId, addressId, orgId string) (*SendPermissionResult, error) {
    result := &SendPermissionResult{
        Allowed: false,
    }

    // 1. Check if user has permission to send from this address
    hasPermission, err := checkSendPermission(userId, addressId, orgId)
    if err != nil {
        return nil, err
    }
    if !hasPermission {
        result.Error = "You don't have permission to send from this address"
        result.ErrorCode = "no_permission"
        return result, nil
    }

    // 2. Check if domain is verified
    isVerified, err := checkDomainVerified(addressId)
    if err != nil {
        return nil, err
    }
    if !isVerified {
        result.Error = "Domain is not verified. Please verify the domain before sending."
        result.ErrorCode = "domain_unverified"
        return result, nil
    }

    // 3. Check if address is active
    isActive, err := checkAddressActive(addressId)
    if err != nil {
        return nil, err
    }
    if !isActive {
        result.Error = "This email address has been disabled"
        result.ErrorCode = "address_disabled"
        return result, nil
    }

    // 4. Check daily sending limit
    quota, err := checkDailySendingQuota(addressId)
    if err != nil {
        return nil, err
    }

    if quota.Used >= quota.Limit {
        result.Error = fmt.Sprintf(
            "Daily sending limit exceeded (%d/%d). Resets at %s",
            quota.Used,
            quota.Limit,
            quota.ResetAt.Format("3:04 PM MST"),
        )
        result.ErrorCode = "limit_exceeded"
        result.RemainingQuota = 0
        result.QuotaResetAt = quota.ResetAt
        return result, nil
    }

    // All checks passed
    result.Allowed = true
    result.RemainingQuota = quota.Limit - quota.Used
    result.QuotaResetAt = quota.ResetAt

    return result, nil
}

func checkSendPermission(userId, addressId, orgId string) (bool, error) {
    var count int

    // Check personal addresses
    err := db.QueryRow(`
        SELECT COUNT(*)
        FROM email_addresses
        WHERE id = $1
          AND user_id = $2
          AND is_active = true
          AND domain_id IN (
              SELECT id FROM domains WHERE organization_id = $3
          )
    `, addressId, userId, orgId).Scan(&count)

    if err != nil {
        return false, err
    }
    if count > 0 {
        return true, nil
    }

    // Check shared mailbox permissions
    err = db.QueryRow(`
        SELECT COUNT(*)
        FROM shared_mailbox_members smm
        JOIN shared_mailboxes sm ON smm.mailbox_id = sm.id
        WHERE sm.id = $1
          AND smm.user_id = $2
          AND (smm.can_send_as = true OR smm.can_send_on_behalf = true)
          AND sm.is_active = true
          AND sm.domain_id IN (
              SELECT id FROM domains WHERE organization_id = $3
          )
    `, addressId, userId, orgId).Scan(&count)

    return count > 0, err
}

func checkDomainVerified(addressId string) (bool, error) {
    var isVerified bool

    err := db.QueryRow(`
        SELECT d.is_verified
        FROM domains d
        JOIN email_addresses ea ON ea.domain_id = d.id
        WHERE ea.id = $1
        UNION
        SELECT d.is_verified
        FROM domains d
        JOIN shared_mailboxes sm ON sm.domain_id = d.id
        WHERE sm.id = $1
    `, addressId).Scan(&isVerified)

    return isVerified, err
}

func checkAddressActive(addressId string) (bool, error) {
    var isActive bool

    err := db.QueryRow(`
        SELECT is_active FROM email_addresses WHERE id = $1
        UNION
        SELECT is_active FROM shared_mailboxes WHERE id = $1
    `, addressId).Scan(&isActive)

    return isActive, err
}

type DailySendQuota struct {
    Used    int
    Limit   int
    ResetAt time.Time
}

func checkDailySendingQuota(addressId string) (*DailySendQuota, error) {
    quota := &DailySendQuota{}

    // Get domain limit
    err := db.QueryRow(`
        SELECT d.daily_send_limit
        FROM domains d
        JOIN email_addresses ea ON ea.domain_id = d.id
        WHERE ea.id = $1
        UNION
        SELECT d.daily_send_limit
        FROM domains d
        JOIN shared_mailboxes sm ON sm.domain_id = d.id
        WHERE sm.id = $1
    `, addressId).Scan(&quota.Limit)

    if err != nil {
        return nil, err
    }

    // Count sent today
    err = db.QueryRow(`
        SELECT COUNT(*)
        FROM emails
        WHERE from_address_id = $1
          AND sent_at >= CURRENT_DATE
    `, addressId).Scan(&quota.Used)

    if err != nil {
        return nil, err
    }

    // Calculate reset time (midnight)
    now := time.Now()
    quota.ResetAt = time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())

    return quota, nil
}
```

---

## Recipient Hints API

### Endpoint

```
GET /api/v1/mail/compose/recipients?q=jane&fromDomain=dom_456
Authorization: Bearer <token>
```

### Implementation Logic

```go
func GetRecipientHints(userId, orgId, query, fromDomainId string) (*RecipientHintsResponse, error) {
    response := &RecipientHintsResponse{
        Hints:    []RecipientHint{},
        Contacts: []Contact{},
    }

    query = strings.ToLower(strings.TrimSpace(query))
    if len(query) < 2 {
        return response, nil
    }

    // 1. Search internal users (same organization)
    internalUsers, err := db.Query(`
        SELECT
            ea.email,
            u.display_name as name,
            d.id as domain_id,
            d.name as domain_name,
            d.color as domain_color
        FROM email_addresses ea
        JOIN users u ON ea.user_id = u.id
        JOIN domains d ON ea.domain_id = d.id
        WHERE d.organization_id = $1
          AND ea.is_active = true
          AND (
              LOWER(ea.email) LIKE $2 OR
              LOWER(u.display_name) LIKE $2
          )
        LIMIT 10
    `, orgId, "%"+query+"%")

    for _, user := range internalUsers {
        hint := RecipientHint{
            Email: user.Email,
            Type:  "internal",
            Message: "Internal - Same Organization",
            DomainInfo: &DomainInfo{
                Id:    user.DomainId,
                Name:  user.DomainName,
                Color: user.DomainColor,
            },
        }

        if user.DomainId == fromDomainId {
            hint.Type = "same-domain"
            hint.Message = "Internal - Same Domain"
        }

        response.Hints = append(response.Hints, hint)
        response.Contacts = append(response.Contacts, Contact{
            Email:      user.Email,
            Name:       user.Name,
            IsInternal: true,
            DomainId:   user.DomainId,
        })
    }

    // 2. Search contacts
    contacts, err := db.Query(`
        SELECT email, name
        FROM contacts
        WHERE user_id = $1
          AND (
              LOWER(email) LIKE $2 OR
              LOWER(name) LIKE $2
          )
        LIMIT 10
    `, userId, "%"+query+"%")

    for _, contact := range contacts {
        // Check if already in hints (internal user)
        exists := false
        for _, hint := range response.Hints {
            if hint.Email == contact.Email {
                exists = true
                break
            }
        }

        if !exists {
            response.Hints = append(response.Hints, RecipientHint{
                Email:   contact.Email,
                Type:    "contact",
                Message: "From your contacts",
            })
            response.Contacts = append(response.Contacts, Contact{
                Email:      contact.Email,
                Name:       contact.Name,
                IsInternal: false,
            })
        }
    }

    // 3. Search recent recipients
    recentRecipients, err := db.Query(`
        SELECT DISTINCT
            r.email,
            r.name
        FROM email_recipients r
        JOIN emails e ON r.email_id = e.id
        WHERE e.from_user_id = $1
          AND e.sent_at >= NOW() - INTERVAL '30 days'
          AND LOWER(r.email) LIKE $2
        ORDER BY MAX(e.sent_at) DESC
        LIMIT 10
    `, userId, "%"+query+"%")

    for _, recipient := range recentRecipients {
        // Check if already in hints
        exists := false
        for _, hint := range response.Hints {
            if hint.Email == recipient.Email {
                exists = true
                break
            }
        }

        if !exists {
            response.Hints = append(response.Hints, RecipientHint{
                Email:   recipient.Email,
                Type:    "recent",
                Message: "Recently emailed",
            })
            response.Contacts = append(response.Contacts, Contact{
                Email:      recipient.Email,
                Name:       recipient.Name,
                IsInternal: false,
            })
        }
    }

    return response, nil
}
```

### Check Recipient (Internal Detection)

```
POST /api/v1/mail/compose/check-recipient
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "jane@subsidiary.com"
}
```

```go
func CheckRecipientInternal(orgId, email string) (*RecipientHint, error) {
    hint := &RecipientHint{
        Email: email,
        Type:  "external",
        Message: "External recipient",
    }

    // Extract domain from email
    parts := strings.Split(email, "@")
    if len(parts) != 2 {
        return hint, nil
    }
    domain := parts[1]

    // Check if domain belongs to organization
    var domainId, domainName, domainColor string
    err := db.QueryRow(`
        SELECT id, name, color
        FROM domains
        WHERE organization_id = $1
          AND name = $2
          AND is_verified = true
    `, orgId, domain).Scan(&domainId, &domainName, &domainColor)

    if err == sql.ErrNoRows {
        // External domain
        return hint, nil
    }

    if err != nil {
        return nil, err
    }

    // Check if specific email exists
    var exists bool
    err = db.QueryRow(`
        SELECT EXISTS(
            SELECT 1 FROM email_addresses
            WHERE email = $1 AND is_active = true
            UNION
            SELECT 1 FROM shared_mailboxes
            WHERE email = $1 AND is_active = true
        )
    `, email).Scan(&exists)

    if err != nil {
        return nil, err
    }

    if exists {
        hint.Type = "internal"
        hint.Message = fmt.Sprintf("Internal - %s", domainName)
        hint.DomainInfo = &DomainInfo{
            Id:    domainId,
            Name:  domainName,
            Color: domainColor,
        }
    }

    return hint, nil
}
```

---

## Send Email API

### Endpoint

```
POST /api/v1/mail/send
Authorization: Bearer <token>
Content-Type: application/json
```

### Implementation Logic

```go
func SendEmail(userId, orgId string, req SendEmailRequest) (*SendEmailResponse, error) {
    // 1. Validate send permission
    permission, err := ValidateSendPermission(userId, req.FromAddressId, orgId)
    if err != nil {
        return nil, err
    }
    if !permission.Allowed {
        return nil, fmt.Errorf(permission.Error)
    }

    // 2. Get from address details
    fromAddress, err := getAddressDetails(req.FromAddressId)
    if err != nil {
        return nil, err
    }

    // 3. Build email message
    emailId := uuid.New().String()
    messageId := generateMessageId(fromAddress.Domain)

    // 4. Get signature and branding
    var bodyWithSignature string
    var htmlBodyWithBranding string

    if req.BodyHtml != "" {
        // Get domain branding
        branding, _ := GetDomainBranding(fromAddress.DomainId, orgId)

        // Build HTML with branding
        htmlBodyWithBranding = buildEmailHtml(
            branding.HeaderHtml,
            req.BodyHtml,
            branding.FooterHtml,
        )
    }

    // 5. Determine From header based on send mode
    var fromHeader string
    if req.SendMode == "send-on-behalf" && fromAddress.Type == "shared" {
        // Get user's email for "on behalf"
        userEmail, _ := getUserPrimaryEmail(userId)
        fromHeader = fmt.Sprintf("%s on behalf of %s",
            userEmail.Formatted,
            fromAddress.Formatted,
        )
    } else {
        fromHeader = fromAddress.Formatted
    }

    // 6. Insert email record
    err = db.Exec(`
        INSERT INTO emails (
            id, message_id, organization_id, from_address_id, from_user_id,
            from_header, reply_to, subject, body, body_html,
            status, priority, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'queued', $11, NOW())
    `, emailId, messageId, orgId, req.FromAddressId, userId,
       fromHeader, fromAddress.Email, req.Subject, req.Body,
       htmlBodyWithBranding, req.Priority)

    // 7. Insert recipients
    for _, to := range req.To {
        insertRecipient(emailId, to, "to")
    }
    for _, cc := range req.Cc {
        insertRecipient(emailId, cc, "cc")
    }
    for _, bcc := range req.Bcc {
        insertRecipient(emailId, bcc, "bcc")
    }

    // 8. Attach files
    for _, attachmentId := range req.AttachmentIds {
        linkAttachment(emailId, attachmentId)
    }

    // 9. Queue for sending
    err = queueEmail(emailId)
    if err != nil {
        return nil, err
    }

    // 10. Increment sent count
    incrementSentCount(req.FromAddressId)

    return &SendEmailResponse{
        Success:   true,
        EmailId:   emailId,
        MessageId: messageId,
    }, nil
}

func buildEmailHtml(header, body, footer string) string {
    var html strings.Builder

    html.WriteString(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>`)

    if header != "" {
        html.WriteString(header)
    }

    html.WriteString(`<div style="padding: 20px;">`)
    html.WriteString(body)
    html.WriteString(`</div>`)

    if footer != "" {
        html.WriteString(footer)
    }

    html.WriteString(`</body>
</html>`)

    return html.String()
}

func generateMessageId(domain string) string {
    timestamp := time.Now().UnixNano()
    random := uuid.New().String()[:8]
    return fmt.Sprintf("<%d.%s@%s>", timestamp, random, domain)
}
```

---

## Database Schema

### Core Tables

```sql
-- Domains
CREATE TABLE domains (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    color VARCHAR(7) NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    daily_send_limit INT DEFAULT 1000,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

-- Email Addresses (Personal)
CREATE TABLE email_addresses (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    domain_id UUID NOT NULL REFERENCES domains(id),
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Shared Mailboxes
CREATE TABLE shared_mailboxes (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    domain_id UUID NOT NULL REFERENCES domains(id),
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Shared Mailbox Members
CREATE TABLE shared_mailbox_members (
    id UUID PRIMARY KEY,
    mailbox_id UUID NOT NULL REFERENCES shared_mailboxes(id),
    user_id UUID NOT NULL REFERENCES users(id),
    can_send_as BOOLEAN DEFAULT false,
    can_send_on_behalf BOOLEAN DEFAULT false,
    can_read BOOLEAN DEFAULT false,
    can_manage BOOLEAN DEFAULT false,
    added_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(mailbox_id, user_id)
);

-- Email Signatures
CREATE TABLE email_signatures (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    content TEXT,
    content_html TEXT,
    level VARCHAR(20) NOT NULL CHECK (level IN ('address', 'domain', 'global')),
    address_id UUID REFERENCES email_addresses(id),
    domain_id UUID REFERENCES domains(id),
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Domain Email Branding
CREATE TABLE domain_email_branding (
    id UUID PRIMARY KEY,
    domain_id UUID NOT NULL REFERENCES domains(id) UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    domain_name VARCHAR(255),
    header_html TEXT,
    footer_html TEXT,
    logo_url VARCHAR(512),
    brand_color VARCHAR(7),
    enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Emails
CREATE TABLE emails (
    id UUID PRIMARY KEY,
    message_id VARCHAR(255) UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    from_address_id UUID NOT NULL,
    from_user_id UUID NOT NULL REFERENCES users(id),
    from_header TEXT,
    reply_to VARCHAR(255),
    subject TEXT,
    body TEXT,
    body_html TEXT,
    status VARCHAR(20) DEFAULT 'queued',
    priority VARCHAR(20) DEFAULT 'normal',
    in_reply_to UUID REFERENCES emails(id),
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Email Recipients
CREATE TABLE email_recipients (
    id UUID PRIMARY KEY,
    email_id UUID NOT NULL REFERENCES emails(id),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    type VARCHAR(10) CHECK (type IN ('to', 'cc', 'bcc')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Contacts
CREATE TABLE contacts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, email)
);
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_email_addresses_user ON email_addresses(user_id);
CREATE INDEX idx_email_addresses_domain ON email_addresses(domain_id);
CREATE INDEX idx_shared_mailbox_members_user ON shared_mailbox_members(user_id);
CREATE INDEX idx_shared_mailbox_members_mailbox ON shared_mailbox_members(mailbox_id);
CREATE INDEX idx_email_signatures_user ON email_signatures(user_id);
CREATE INDEX idx_emails_from_address ON emails(from_address_id);
CREATE INDEX idx_emails_sent_at ON emails(sent_at);
CREATE INDEX idx_email_recipients_email_id ON email_recipients(email_id);
CREATE INDEX idx_contacts_user ON contacts(user_id);
```

---

## Go Implementation Examples

### Complete Handler Example

```go
package handler

import (
    "encoding/json"
    "net/http"

    "github.com/gorilla/mux"
)

type ComposeHandler struct {
    service *ComposeService
}

func NewComposeHandler(service *ComposeService) *ComposeHandler {
    return &ComposeHandler{service: service}
}

func (h *ComposeHandler) GetSendableAddresses(w http.ResponseWriter, r *http.Request) {
    userId := r.Context().Value("userId").(string)
    orgId := r.Context().Value("orgId").(string)

    addresses, err := h.service.GetSendableAddresses(userId, orgId)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(addresses)
}

func (h *ComposeHandler) GetSignatures(w http.ResponseWriter, r *http.Request) {
    userId := r.Context().Value("userId").(string)
    orgId := r.Context().Value("orgId").(string)

    signatures, err := h.service.GetUserSignatures(userId, orgId)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(signatures)
}

func (h *ComposeHandler) GetDomainBranding(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    domainId := vars["domainId"]
    orgId := r.Context().Value("orgId").(string)

    branding, err := h.service.GetDomainBranding(domainId, orgId)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(branding)
}

func (h *ComposeHandler) ValidateSendPermission(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    addressId := vars["addressId"]
    userId := r.Context().Value("userId").(string)
    orgId := r.Context().Value("orgId").(string)

    result, err := h.service.ValidateSendPermission(userId, addressId, orgId)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(result)
}

func (h *ComposeHandler) SendEmail(w http.ResponseWriter, r *http.Request) {
    var req SendEmailRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request body", http.StatusBadRequest)
        return
    }

    userId := r.Context().Value("userId").(string)
    orgId := r.Context().Value("orgId").(string)

    response, err := h.service.SendEmail(userId, orgId, req)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    w.WriteStatus(http.StatusCreated)
    json.NewEncoder(w).Encode(response)
}

// Register routes
func (h *ComposeHandler) RegisterRoutes(r *mux.Router) {
    r.HandleFunc("/compose/addresses", h.GetSendableAddresses).Methods("GET")
    r.HandleFunc("/compose/signatures", h.GetSignatures).Methods("GET")
    r.HandleFunc("/compose/branding/{domainId}", h.GetDomainBranding).Methods("GET")
    r.HandleFunc("/compose/validate/{addressId}", h.ValidateSendPermission).Methods("GET")
    r.HandleFunc("/compose/recipients", h.GetRecipientHints).Methods("GET")
    r.HandleFunc("/compose/check-recipient", h.CheckRecipientInternal).Methods("POST")
    r.HandleFunc("/send", h.SendEmail).Methods("POST")
}
```

---

## Testing

### Unit Test Example

```go
func TestValidateSendPermission(t *testing.T) {
    // Test case: User has permission, domain verified, under limit
    result, err := ValidateSendPermission("user_123", "addr_456", "org_789")
    assert.NoError(t, err)
    assert.True(t, result.Allowed)
    assert.Greater(t, result.RemainingQuota, 0)

    // Test case: Domain not verified
    // ... mock domain as unverified
    result, err = ValidateSendPermission("user_123", "addr_unverified", "org_789")
    assert.NoError(t, err)
    assert.False(t, result.Allowed)
    assert.Equal(t, "domain_unverified", result.ErrorCode)

    // Test case: Limit exceeded
    // ... mock sent count >= limit
    result, err = ValidateSendPermission("user_123", "addr_overlimit", "org_789")
    assert.NoError(t, err)
    assert.False(t, result.Allowed)
    assert.Equal(t, "limit_exceeded", result.ErrorCode)
    assert.Equal(t, 0, result.RemainingQuota)
}
```

---

This implementation guide provides a comprehensive reference for building the backend APIs to
support the multi-domain compose feature.
