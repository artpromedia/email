package routing

import (
	"context"
	"regexp"
	"strings"

	"go.uber.org/zap"

	"smtp-server/domain"
)

// Router handles message routing decisions
type Router struct {
	domainCache DomainProvider
	logger      *zap.Logger
}

// DomainProvider provides domain and routing rule information
type DomainProvider interface {
	GetDomain(name string) *domain.Domain
	GetDomainByID(id string) *domain.Domain
	GetRoutingRules(ctx context.Context, domainID string) ([]*domain.RoutingRule, error)
	IsDomainInternal(orgID, domainName string) bool
}

// NewRouter creates a new message router
func NewRouter(domainCache DomainProvider, logger *zap.Logger) *Router {
	return &Router{
		domainCache: domainCache,
		logger:      logger,
	}
}

// RouteResult represents the result of routing a message
type RouteResult struct {
	// Action to take
	Action RouteAction
	// For forward/redirect actions
	Targets []string
	// Modified message properties
	RewriteFrom string
	RewriteTo   string
	AddHeaders  map[string]string
	// For reject/quarantine
	RejectMessage    string
	QuarantineReason string
	// Rule that matched
	MatchedRule *domain.RoutingRule
}

// RouteAction represents the routing action to take
type RouteAction string

const (
	ActionDeliver    RouteAction = "deliver"
	ActionForward    RouteAction = "forward"
	ActionRedirect   RouteAction = "redirect"
	ActionReject     RouteAction = "reject"
	ActionQuarantine RouteAction = "quarantine"
	ActionDiscard    RouteAction = "discard"
)

// MessageContext holds message information for routing decisions
type MessageContext struct {
	From         string
	To           []string
	Subject      string
	Headers      map[string]string
	Size         int64
	HasAttachment bool
	DomainID     string
	OrgID        string
}

// Route determines how to route a message
func (r *Router) Route(ctx context.Context, msg *MessageContext) ([]*RouteResult, error) {
	var results []*RouteResult

	// Get routing rules for the domain
	rules, err := r.domainCache.GetRoutingRules(ctx, msg.DomainID)
	if err != nil {
		r.logger.Error("Failed to get routing rules",
			zap.String("domain_id", msg.DomainID),
			zap.Error(err))
		// Continue with default routing
	}

	// Process each recipient
	for _, recipient := range msg.To {
		result := r.routeRecipient(ctx, msg, recipient, rules)
		results = append(results, result)
	}

	return results, nil
}

func (r *Router) routeRecipient(ctx context.Context, msg *MessageContext, recipient string, rules []*domain.RoutingRule) *RouteResult {
	result := &RouteResult{
		Action:     ActionDeliver,
		AddHeaders: make(map[string]string),
	}

	// Check routing rules in priority order
	for _, rule := range rules {
		if r.ruleMatches(msg, recipient, rule) {
			result = r.applyRule(rule)
			result.MatchedRule = rule
			
			r.logger.Debug("Routing rule matched",
				zap.String("rule", rule.Name),
				zap.String("recipient", recipient),
				zap.String("action", string(result.Action)))
			
			// Stop processing if this is a terminal action
			if result.Action == ActionReject || 
			   result.Action == ActionDiscard ||
			   result.Action == ActionQuarantine {
				return result
			}
		}
	}

	// Check if recipient domain is internal
	recipientDomain := extractDomain(recipient)
	if r.domainCache.IsDomainInternal(msg.OrgID, recipientDomain) {
		result.Action = ActionDeliver
		r.logger.Debug("Internal delivery",
			zap.String("recipient", recipient),
			zap.String("domain", recipientDomain))
	} else {
		// External delivery - could add additional checks here
		result.Action = ActionForward
		result.Targets = []string{recipient}
		r.logger.Debug("External delivery",
			zap.String("recipient", recipient),
			zap.String("domain", recipientDomain))
	}

	return result
}

func (r *Router) ruleMatches(msg *MessageContext, recipient string, rule *domain.RoutingRule) bool {
	cond := rule.Conditions

	// Check sender pattern
	if cond.SenderPattern != "" {
		if !matchPattern(cond.SenderPattern, msg.From) {
			return false
		}
	}

	// Check recipient pattern
	if cond.RecipientPattern != "" {
		if !matchPattern(cond.RecipientPattern, recipient) {
			return false
		}
	}

	// Check subject pattern
	if cond.SubjectPattern != "" {
		if !matchPattern(cond.SubjectPattern, msg.Subject) {
			return false
		}
	}

	// Check header pattern
	if cond.HeaderName != "" && cond.HeaderPattern != "" {
		headerValue := msg.Headers[cond.HeaderName]
		if !matchPattern(cond.HeaderPattern, headerValue) {
			return false
		}
	}

	// Check size constraints
	if cond.SizeMin > 0 && msg.Size < cond.SizeMin {
		return false
	}
	if cond.SizeMax > 0 && msg.Size > cond.SizeMax {
		return false
	}

	// Check attachment
	if cond.HasAttachment != nil {
		if *cond.HasAttachment != msg.HasAttachment {
			return false
		}
	}

	return true
}

func (r *Router) applyRule(rule *domain.RoutingRule) *RouteResult {
	result := &RouteResult{
		AddHeaders: make(map[string]string),
	}

	switch rule.Actions.Type {
	case "deliver":
		result.Action = ActionDeliver

	case "forward":
		result.Action = ActionForward
		if rule.Actions.Target != "" {
			result.Targets = []string{rule.Actions.Target}
		}

	case "redirect":
		result.Action = ActionRedirect
		if rule.Actions.Target != "" {
			result.Targets = []string{rule.Actions.Target}
		}

	case "reject":
		result.Action = ActionReject
		result.RejectMessage = rule.Actions.RejectMessage

	case "quarantine":
		result.Action = ActionQuarantine
		result.QuarantineReason = rule.Actions.QuarantineReason

	case "discard":
		result.Action = ActionDiscard
	}

	// Apply rewrites
	if rule.Actions.RewriteFrom != "" {
		result.RewriteFrom = rule.Actions.RewriteFrom
	}
	if rule.Actions.RewriteTo != "" {
		result.RewriteTo = rule.Actions.RewriteTo
	}

	// Add headers
	if rule.Actions.AddHeaderName != "" && rule.Actions.AddHeaderValue != "" {
		result.AddHeaders[rule.Actions.AddHeaderName] = rule.Actions.AddHeaderValue
	}

	return result
}

func matchPattern(pattern, value string) bool {
	// Support wildcards (* for any characters, ? for single character)
	pattern = strings.ToLower(pattern)
	value = strings.ToLower(value)

	// Convert glob pattern to regex
	regexPattern := "^"
	for _, ch := range pattern {
		switch ch {
		case '*':
			regexPattern += ".*"
		case '?':
			regexPattern += "."
		case '.', '+', '^', '$', '[', ']', '(', ')', '{', '}', '|', '\\':
			regexPattern += "\\" + string(ch)
		default:
			regexPattern += string(ch)
		}
	}
	regexPattern += "$"

	re, err := regexp.Compile(regexPattern)
	if err != nil {
		return false
	}

	return re.MatchString(value)
}

func extractDomain(email string) string {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return ""
	}
	return strings.ToLower(parts[1])
}

// InternalRouter handles routing for internal (intra-organization) messages
type InternalRouter struct {
	domainCache DomainProvider
	logger      *zap.Logger
}

// NewInternalRouter creates a new internal router
func NewInternalRouter(domainCache DomainProvider, logger *zap.Logger) *InternalRouter {
	return &InternalRouter{
		domainCache: domainCache,
		logger:      logger,
	}
}

// ResolveRecipients resolves recipients to their final delivery addresses
func (r *InternalRouter) ResolveRecipients(ctx context.Context, recipients []string) (map[string][]string, error) {
	// Map from original recipient to resolved addresses
	resolved := make(map[string][]string)

	for _, rcpt := range recipients {
		addresses, err := r.resolveRecipient(ctx, rcpt)
		if err != nil {
			r.logger.Warn("Failed to resolve recipient",
				zap.String("recipient", rcpt),
				zap.Error(err))
			// Keep original recipient
			resolved[rcpt] = []string{rcpt}
		} else {
			resolved[rcpt] = addresses
		}
	}

	return resolved, nil
}

func (r *InternalRouter) resolveRecipient(ctx context.Context, recipient string) ([]string, error) {
	// This would integrate with the domain cache to resolve:
	// 1. Mailboxes -> direct delivery
	// 2. Aliases -> resolve to target(s)
	// 3. Distribution lists -> expand to members
	// 4. Catch-all -> route to catch-all address

	// Placeholder - actual implementation would use domain cache
	return []string{recipient}, nil
}

// ExternalRouter handles routing for external messages
type ExternalRouter struct {
	logger *zap.Logger
}

// NewExternalRouter creates a new external router
func NewExternalRouter(logger *zap.Logger) *ExternalRouter {
	return &ExternalRouter{
		logger: logger,
	}
}

// RouteExternal determines routing for external delivery
func (r *ExternalRouter) RouteExternal(ctx context.Context, msg *MessageContext) (*ExternalRouteResult, error) {
	result := &ExternalRouteResult{
		ByDomain: make(map[string][]string),
	}

	// Group recipients by domain
	for _, rcpt := range msg.To {
		domain := extractDomain(rcpt)
		result.ByDomain[domain] = append(result.ByDomain[domain], rcpt)
	}

	return result, nil
}

// ExternalRouteResult holds external routing decisions
type ExternalRouteResult struct {
	ByDomain map[string][]string
}
