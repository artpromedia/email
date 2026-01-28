package imap

import (
	"fmt"
	"strings"
)

// handleNamespace handles the NAMESPACE command
func (c *Connection) handleNamespace(tag string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	ns := c.buildNamespaceResponse()
	c.sendUntagged("NAMESPACE %s", formatNamespace(ns))
	c.sendTagged(tag, "OK NAMESPACE completed")
	return nil
}

// buildNamespaceResponse builds the NAMESPACE response based on user's mailboxes
func (c *Connection) buildNamespaceResponse() *NamespaceResponse {
	ns := &NamespaceResponse{
		Personal: []Namespace{},
		Other:    []Namespace{},
		Shared:   []Namespace{},
	}

	// Personal namespace based on namespace mode
	if c.ctx.NamespaceMode == NamespaceModeUnified {
		// Unified mode - single personal namespace
		ns.Personal = append(ns.Personal, Namespace{
			Prefix:    "",
			Delimiter: "/",
		})

		// Add domain-specific namespaces as "other"
		for _, mb := range c.ctx.Mailboxes {
			if mb.Domain != nil {
				ns.Other = append(ns.Other, Namespace{
					Prefix:    mb.Domain.Name + "/",
					Delimiter: "/",
				})
			}
		}
	} else {
		// Domain-separated mode - each domain is its own namespace
		for _, mb := range c.ctx.Mailboxes {
			if mb.Domain != nil {
				ns.Personal = append(ns.Personal, Namespace{
					Prefix:    mb.Domain.Name + "/",
					Delimiter: "/",
				})
			}
		}
	}

	// Shared namespace
	if len(c.ctx.SharedMailboxes) > 0 {
		ns.Shared = append(ns.Shared, Namespace{
			Prefix:    "Shared/",
			Delimiter: "/",
		})
	}

	return ns
}

// formatNamespace formats the NAMESPACE response
func formatNamespace(ns *NamespaceResponse) string {
	personal := formatNamespaceList(ns.Personal)
	other := formatNamespaceList(ns.Other)
	shared := formatNamespaceList(ns.Shared)
	return fmt.Sprintf("%s %s %s", personal, other, shared)
}

// formatNamespaceList formats a list of namespaces
func formatNamespaceList(namespaces []Namespace) string {
	if len(namespaces) == 0 {
		return "NIL"
	}

	parts := make([]string, len(namespaces))
	for i, ns := range namespaces {
		parts[i] = fmt.Sprintf(`("%s" "%s")`, ns.Prefix, ns.Delimiter)
	}
	return "(" + strings.Join(parts, "") + ")"
}

// handleList handles the LIST command
func (c *Connection) handleList(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	// Parse arguments: reference mailbox-pattern [RETURN (options)]
	parts := parseListArgs(args)
	if len(parts) < 2 {
		c.sendTagged(tag, "BAD LIST requires reference and mailbox name")
		return nil
	}

	reference := parts[0]
	pattern := parts[1]
	returnOptions := parseReturnOptions(args)

	// Handle empty pattern (list hierarchy delimiter)
	if pattern == "" {
		c.sendUntagged(`LIST (\Noselect) "/" ""`)
		c.sendTagged(tag, "OK LIST completed")
		return nil
	}

	// List folders based on namespace mode
	folders := c.listFolders(reference, pattern, returnOptions)

	for _, folder := range folders {
		attrs := formatAttributes(folder.Attributes)
		if returnOptions.specialUse && folder.SpecialUse != nil {
			attrs = append(attrs, string(*folder.SpecialUse))
		}

		attrStr := ""
		if len(attrs) > 0 {
			attrStr = "(" + strings.Join(attrs, " ") + ")"
		} else {
			attrStr = "()"
		}

		c.sendUntagged(`LIST %s "%s" "%s"`, attrStr, folder.Delimiter, folder.Name)
	}

	c.sendTagged(tag, "OK LIST completed")
	return nil
}

// handleLsub handles the LSUB command
func (c *Connection) handleLsub(tag, args string) error {
	if !c.requireAuth(tag) {
		return nil
	}

	// Parse arguments
	parts := parseListArgs(args)
	if len(parts) < 2 {
		c.sendTagged(tag, "BAD LSUB requires reference and mailbox name")
		return nil
	}

	reference := parts[0]
	pattern := parts[1]

	// List subscribed folders
	folders := c.listFolders(reference, pattern, listReturnOptions{subscribed: true})

	for _, folder := range folders {
		if !folder.Subscribed {
			continue
		}

		attrs := formatAttributes(folder.Attributes)
		attrStr := "()"
		if len(attrs) > 0 {
			attrStr = "(" + strings.Join(attrs, " ") + ")"
		}

		c.sendUntagged(`LSUB %s "%s" "%s"`, attrStr, folder.Delimiter, folder.Name)
	}

	c.sendTagged(tag, "OK LSUB completed")
	return nil
}

// listFolders returns folders matching the pattern
func (c *Connection) listFolders(reference, pattern string, options listReturnOptions) []*FolderList {
	ctx, cancel := c.getContext()
	defer cancel()

	var result []*FolderList

	// Build full pattern
	fullPattern := reference + pattern

	// Handle unified mode - add virtual combined INBOX
	if c.ctx.NamespaceMode == NamespaceModeUnified && matchPattern("INBOX", fullPattern) {
		inbox := &FolderList{
			Name:       "INBOX",
			Delimiter:  "/",
			Attributes: []string{"\\HasNoChildren"},
			SpecialUse: ptrSpecialUse(SpecialUseInbox),
		}
		result = append(result, inbox)
	}

	// List folders from all accessible mailboxes
	for _, mb := range c.ctx.Mailboxes {
		folders, err := c.repo.GetMailboxFolders(ctx, mb.ID)
		if err != nil {
			c.logger.Warn("Failed to get folders", err)
			continue
		}

		for _, f := range folders {
			folderName := c.getFolderDisplayName(mb, f)

			if !matchPattern(folderName, fullPattern) {
				continue
			}

			attrs := f.Attributes
			if !f.Selectable {
				attrs = append(attrs, "\\Noselect")
			}
			if f.Subscribed && options.subscribed {
				// Already included
			}

			fl := &FolderList{
				Name:       folderName,
				Delimiter:  f.Delimiter,
				Attributes: attrs,
				SpecialUse: f.SpecialUse,
				Subscribed: f.Subscribed,
			}
			result = append(result, fl)
		}
	}

	// List shared mailboxes
	if strings.HasPrefix(fullPattern, "Shared/") || fullPattern == "*" || fullPattern == "%" {
		for _, mb := range c.ctx.SharedMailboxes {
			// Add shared mailbox root folder
			sharedName := fmt.Sprintf("Shared/%s", mb.Email)
			if matchPattern(sharedName, fullPattern) {
				fl := &FolderList{
					Name:       sharedName,
					Delimiter:  "/",
					Attributes: []string{"\\HasChildren"},
				}
				result = append(result, fl)
			}

			// List folders within shared mailbox
			folders, err := c.repo.GetMailboxFolders(ctx, mb.ID)
			if err != nil {
				continue
			}

			for _, f := range folders {
				folderName := fmt.Sprintf("Shared/%s/%s", mb.Email, f.FullPath)
				if matchPattern(folderName, fullPattern) {
					fl := &FolderList{
						Name:       folderName,
						Delimiter:  "/",
						Attributes: f.Attributes,
						SpecialUse: f.SpecialUse,
					}
					result = append(result, fl)
				}
			}
		}
	}

	return result
}

// getFolderDisplayName returns the display name for a folder based on namespace mode
func (c *Connection) getFolderDisplayName(mb *Mailbox, f *Folder) string {
	if c.ctx.NamespaceMode == NamespaceModeUnified {
		// In unified mode, non-primary domain folders are prefixed
		if !mb.IsPrimary && mb.Domain != nil {
			return fmt.Sprintf("[%s]/%s", mb.Domain.Name, f.FullPath)
		}
		return f.FullPath
	}

	// Domain-separated mode - prefix with domain
	if mb.Domain != nil {
		return fmt.Sprintf("%s/%s", mb.Domain.Name, f.FullPath)
	}
	return f.FullPath
}

// matchPattern matches a folder name against an IMAP pattern
func matchPattern(name, pattern string) bool {
	// Convert IMAP pattern to simple matching
	// * matches everything
	// % matches everything except hierarchy delimiter

	if pattern == "*" {
		return true
	}

	// Simple pattern matching
	pattern = strings.ReplaceAll(pattern, "*", ".*")
	pattern = strings.ReplaceAll(pattern, "%", "[^/]*")

	// Case-insensitive matching for INBOX
	if strings.EqualFold(name, "INBOX") && strings.EqualFold(pattern, "INBOX") {
		return true
	}

	// Basic substring matching for now
	return strings.HasPrefix(strings.ToLower(name), strings.ToLower(strings.TrimSuffix(pattern, ".*")))
}

// listReturnOptions contains LIST RETURN options
type listReturnOptions struct {
	subscribed bool
	children   bool
	specialUse bool
	status     bool
}

// parseReturnOptions parses LIST RETURN options
func parseReturnOptions(args string) listReturnOptions {
	options := listReturnOptions{}

	if strings.Contains(strings.ToUpper(args), "RETURN") {
		if strings.Contains(strings.ToUpper(args), "SUBSCRIBED") {
			options.subscribed = true
		}
		if strings.Contains(strings.ToUpper(args), "CHILDREN") {
			options.children = true
		}
		if strings.Contains(strings.ToUpper(args), "SPECIAL-USE") {
			options.specialUse = true
		}
		if strings.Contains(strings.ToUpper(args), "STATUS") {
			options.status = true
		}
	}

	return options
}

// parseListArgs parses LIST command arguments
func parseListArgs(args string) []string {
	// Handle quoted strings
	return parseQuotedStrings(args)
}

// formatAttributes formats folder attributes
func formatAttributes(attrs []string) []string {
	// Ensure proper formatting
	result := make([]string, 0, len(attrs))
	for _, attr := range attrs {
		if !strings.HasPrefix(attr, "\\") {
			attr = "\\" + attr
		}
		result = append(result, attr)
	}
	return result
}

// ptrSpecialUse returns a pointer to SpecialUse
func ptrSpecialUse(su SpecialUse) *SpecialUse {
	return &su
}
