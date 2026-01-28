package domain

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"
)

// Cache provides efficient domain configuration caching
type Cache struct {
	domains      map[string]*Domain     // by domain name
	domainsByID  map[string]*Domain     // by domain ID
	orgDomains   map[string][]*Domain   // by organization ID
	dkimKeys     map[string][]*DKIMKey  // by domain name
	mailboxes    map[string]*Mailbox    // by email address
	aliases      map[string][]*Alias    // by source email
	distLists    map[string]*DistributionList // by email
	routingRules map[string][]*RoutingRule    // by domain ID
	permissions  map[string]map[string]*UserDomainPermission // user_id -> domain_id -> permission

	mu           sync.RWMutex
	refreshChan  chan string
	stopChan     chan struct{}
	logger       *zap.Logger
	repository   Repository
	ttl          time.Duration
	lastRefresh  time.Time
}

// Repository interface for loading domain data
type Repository interface {
	GetAllDomains(ctx context.Context) ([]*Domain, error)
	GetDomainByName(ctx context.Context, name string) (*Domain, error)
	GetDomainsByOrganization(ctx context.Context, orgID string) ([]*Domain, error)
	GetDKIMKeys(ctx context.Context, domainID string) ([]*DKIMKey, error)
	GetActiveDKIMKey(ctx context.Context, domainName string) (*DKIMKey, error)
	GetMailboxByEmail(ctx context.Context, email string) (*Mailbox, error)
	GetAliasesBySource(ctx context.Context, email string) ([]*Alias, error)
	GetDistributionListByEmail(ctx context.Context, email string) (*DistributionList, error)
	GetRoutingRules(ctx context.Context, domainID string) ([]*RoutingRule, error)
	GetUserDomainPermission(ctx context.Context, userID, domainID string) (*UserDomainPermission, error)
	ListenForChanges(ctx context.Context, callback func(table, action, id string)) error
}

// NewCache creates a new domain cache
func NewCache(repository Repository, logger *zap.Logger, ttl time.Duration) *Cache {
	return &Cache{
		domains:      make(map[string]*Domain),
		domainsByID:  make(map[string]*Domain),
		orgDomains:   make(map[string][]*Domain),
		dkimKeys:     make(map[string][]*DKIMKey),
		mailboxes:    make(map[string]*Mailbox),
		aliases:      make(map[string][]*Alias),
		distLists:    make(map[string]*DistributionList),
		routingRules: make(map[string][]*RoutingRule),
		permissions:  make(map[string]map[string]*UserDomainPermission),
		refreshChan:  make(chan string, 100),
		stopChan:     make(chan struct{}),
		logger:       logger,
		repository:   repository,
		ttl:          ttl,
	}
}

// Start initializes the cache and starts background refresh
func (c *Cache) Start(ctx context.Context) error {
	// Initial load
	if err := c.RefreshAll(ctx); err != nil {
		return err
	}

	// Start background refresh goroutine
	go c.backgroundRefresh(ctx)

	// Start PostgreSQL LISTEN/NOTIFY listener
	go c.listenForChanges(ctx)

	return nil
}

// Stop stops the cache refresh goroutine
func (c *Cache) Stop() {
	close(c.stopChan)
}

// RefreshAll reloads all domain data from the database
func (c *Cache) RefreshAll(ctx context.Context) error {
	c.logger.Info("Refreshing all domain data")

	domains, err := c.repository.GetAllDomains(ctx)
	if err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// Clear existing data
	c.domains = make(map[string]*Domain)
	c.domainsByID = make(map[string]*Domain)
	c.orgDomains = make(map[string][]*Domain)
	c.dkimKeys = make(map[string][]*DKIMKey)

	for _, domain := range domains {
		c.domains[domain.Name] = domain
		c.domainsByID[domain.ID] = domain
		c.orgDomains[domain.OrganizationID] = append(c.orgDomains[domain.OrganizationID], domain)

		// Load DKIM keys for each domain
		keys, err := c.repository.GetDKIMKeys(ctx, domain.ID)
		if err != nil {
			c.logger.Warn("Failed to load DKIM keys for domain",
				zap.String("domain", domain.Name),
				zap.Error(err))
			continue
		}
		c.dkimKeys[domain.Name] = keys
	}

	c.lastRefresh = time.Now()
	c.logger.Info("Domain cache refreshed",
		zap.Int("domains", len(domains)),
		zap.Int("organizations", len(c.orgDomains)))

	return nil
}

// RefreshDomain reloads a specific domain
func (c *Cache) RefreshDomain(ctx context.Context, domainName string) error {
	domain, err := c.repository.GetDomainByName(ctx, domainName)
	if err != nil {
		return err
	}

	keys, err := c.repository.GetDKIMKeys(ctx, domain.ID)
	if err != nil {
		c.logger.Warn("Failed to load DKIM keys for domain",
			zap.String("domain", domainName),
			zap.Error(err))
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// Update or add domain
	oldDomain := c.domains[domainName]
	c.domains[domainName] = domain
	c.domainsByID[domain.ID] = domain

	// Update organization domains list
	if oldDomain != nil && oldDomain.OrganizationID != domain.OrganizationID {
		// Remove from old org
		c.removeFromOrgDomains(oldDomain.OrganizationID, oldDomain.ID)
	}
	c.addToOrgDomains(domain)

	// Update DKIM keys
	c.dkimKeys[domainName] = keys

	return nil
}

// InvalidateDomain removes a domain from the cache
func (c *Cache) InvalidateDomain(domainName string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if domain, exists := c.domains[domainName]; exists {
		delete(c.domains, domainName)
		delete(c.domainsByID, domain.ID)
		delete(c.dkimKeys, domainName)
		c.removeFromOrgDomains(domain.OrganizationID, domain.ID)
	}
}

// GetDomain returns a domain by name
func (c *Cache) GetDomain(name string) *Domain {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.domains[name]
}

// GetDomainByID returns a domain by ID
func (c *Cache) GetDomainByID(id string) *Domain {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.domainsByID[id]
}

// GetOrganizationDomains returns all domains for an organization
func (c *Cache) GetOrganizationDomains(orgID string) []*Domain {
	c.mu.RLock()
	defer c.mu.RUnlock()
	
	domains := c.orgDomains[orgID]
	result := make([]*Domain, len(domains))
	copy(result, domains)
	return result
}

// GetActiveDKIMKey returns the active DKIM key for a domain
func (c *Cache) GetActiveDKIMKey(domainName string) *DKIMKey {
	c.mu.RLock()
	defer c.mu.RUnlock()

	keys := c.dkimKeys[domainName]
	for _, key := range keys {
		if key.IsActive && (key.ExpiresAt == nil || key.ExpiresAt.After(time.Now())) {
			return key
		}
	}
	return nil
}

// GetDKIMKeys returns all DKIM keys for a domain
func (c *Cache) GetDKIMKeys(domainName string) []*DKIMKey {
	c.mu.RLock()
	defer c.mu.RUnlock()

	keys := c.dkimKeys[domainName]
	result := make([]*DKIMKey, len(keys))
	copy(result, keys)
	return result
}

// LookupMailbox looks up a mailbox by email (with caching)
func (c *Cache) LookupMailbox(ctx context.Context, email string) (*Mailbox, error) {
	c.mu.RLock()
	mailbox, exists := c.mailboxes[email]
	c.mu.RUnlock()

	if exists {
		return mailbox, nil
	}

	// Load from database
	mailbox, err := c.repository.GetMailboxByEmail(ctx, email)
	if err != nil {
		return nil, err
	}

	if mailbox != nil {
		c.mu.Lock()
		c.mailboxes[email] = mailbox
		c.mu.Unlock()
	}

	return mailbox, nil
}

// LookupAliases looks up aliases for an email address
func (c *Cache) LookupAliases(ctx context.Context, email string) ([]*Alias, error) {
	c.mu.RLock()
	aliases, exists := c.aliases[email]
	c.mu.RUnlock()

	if exists {
		return aliases, nil
	}

	// Load from database
	aliases, err := c.repository.GetAliasesBySource(ctx, email)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.aliases[email] = aliases
	c.mu.Unlock()

	return aliases, nil
}

// LookupDistributionList looks up a distribution list by email
func (c *Cache) LookupDistributionList(ctx context.Context, email string) (*DistributionList, error) {
	c.mu.RLock()
	list, exists := c.distLists[email]
	c.mu.RUnlock()

	if exists {
		return list, nil
	}

	// Load from database
	list, err := c.repository.GetDistributionListByEmail(ctx, email)
	if err != nil {
		return nil, err
	}

	if list != nil {
		c.mu.Lock()
		c.distLists[email] = list
		c.mu.Unlock()
	}

	return list, nil
}

// GetRoutingRules returns routing rules for a domain
func (c *Cache) GetRoutingRules(ctx context.Context, domainID string) ([]*RoutingRule, error) {
	c.mu.RLock()
	rules, exists := c.routingRules[domainID]
	c.mu.RUnlock()

	if exists {
		return rules, nil
	}

	// Load from database
	rules, err := c.repository.GetRoutingRules(ctx, domainID)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.routingRules[domainID] = rules
	c.mu.Unlock()

	return rules, nil
}

// CheckUserDomainPermission checks if a user can send from a domain
func (c *Cache) CheckUserDomainPermission(ctx context.Context, userID, domainID string) (*UserDomainPermission, error) {
	c.mu.RLock()
	if userPerms, exists := c.permissions[userID]; exists {
		if perm, ok := userPerms[domainID]; ok {
			c.mu.RUnlock()
			return perm, nil
		}
	}
	c.mu.RUnlock()

	// Load from database
	perm, err := c.repository.GetUserDomainPermission(ctx, userID, domainID)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	if c.permissions[userID] == nil {
		c.permissions[userID] = make(map[string]*UserDomainPermission)
	}
	c.permissions[userID][domainID] = perm
	c.mu.Unlock()

	return perm, nil
}

// InvalidateMailbox removes a mailbox from cache
func (c *Cache) InvalidateMailbox(email string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.mailboxes, email)
}

// InvalidateAlias removes aliases from cache
func (c *Cache) InvalidateAlias(email string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.aliases, email)
}

// InvalidateDistributionList removes a distribution list from cache
func (c *Cache) InvalidateDistributionList(email string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.distLists, email)
}

// InvalidateRoutingRules removes routing rules from cache
func (c *Cache) InvalidateRoutingRules(domainID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.routingRules, domainID)
}

// InvalidateUserPermissions removes user permissions from cache
func (c *Cache) InvalidateUserPermissions(userID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.permissions, userID)
}

// IsDomainInternal checks if a domain belongs to the same organization
func (c *Cache) IsDomainInternal(orgID, domainName string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	domain := c.domains[domainName]
	if domain == nil {
		return false
	}
	return domain.OrganizationID == orgID
}

// AllDomainNames returns all cached domain names
func (c *Cache) AllDomainNames() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	names := make([]string, 0, len(c.domains))
	for name := range c.domains {
		names = append(names, name)
	}
	return names
}

// backgroundRefresh periodically refreshes the cache
func (c *Cache) backgroundRefresh(ctx context.Context) {
	ticker := time.NewTicker(c.ttl / 2)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-c.stopChan:
			return
		case <-ticker.C:
			if time.Since(c.lastRefresh) > c.ttl {
				if err := c.RefreshAll(ctx); err != nil {
					c.logger.Error("Failed to refresh domain cache", zap.Error(err))
				}
			}
		case domainName := <-c.refreshChan:
			if err := c.RefreshDomain(ctx, domainName); err != nil {
				c.logger.Error("Failed to refresh domain",
					zap.String("domain", domainName),
					zap.Error(err))
			}
		}
	}
}

// listenForChanges listens for PostgreSQL LISTEN/NOTIFY events
func (c *Cache) listenForChanges(ctx context.Context) {
	err := c.repository.ListenForChanges(ctx, func(table, action, id string) {
		c.logger.Debug("Database change notification",
			zap.String("table", table),
			zap.String("action", action),
			zap.String("id", id))

		switch table {
		case "domains":
			// Queue domain refresh
			select {
			case c.refreshChan <- id:
			default:
				// Channel full, skip
			}
		case "mailboxes", "users":
			// Invalidate mailbox cache - we'd need the email
			// For simplicity, we'll refresh on next lookup
		case "aliases":
			// Invalidate alias cache
		case "distribution_lists":
			// Invalidate distribution list cache
		case "routing_rules":
			c.InvalidateRoutingRules(id)
		case "user_domain_permissions":
			// Invalidate user permissions
		case "dkim_keys":
			// Queue domain refresh for DKIM
			if domain := c.GetDomainByID(id); domain != nil {
				select {
				case c.refreshChan <- domain.Name:
				default:
				}
			}
		}
	})

	if err != nil {
		c.logger.Error("Failed to listen for database changes", zap.Error(err))
	}
}

// Helper methods

func (c *Cache) removeFromOrgDomains(orgID, domainID string) {
	domains := c.orgDomains[orgID]
	for i, d := range domains {
		if d.ID == domainID {
			c.orgDomains[orgID] = append(domains[:i], domains[i+1:]...)
			break
		}
	}
}

func (c *Cache) addToOrgDomains(domain *Domain) {
	domains := c.orgDomains[domain.OrganizationID]
	for _, d := range domains {
		if d.ID == domain.ID {
			return // Already exists
		}
	}
	c.orgDomains[domain.OrganizationID] = append(domains, domain)
}
