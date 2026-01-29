package dns

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
)

// Monitor watches for DNS changes and triggers verification
type Monitor struct {
	logger   *zap.Logger
	verifier *Verifier
	interval time.Duration
}

// NewMonitor creates a new DNS monitor
func NewMonitor(logger *zap.Logger, verifier *Verifier, checkInterval time.Duration) *Monitor {
	return &Monitor{
		logger:   logger,
		verifier: verifier,
		interval: checkInterval,
	}
}

// DomainStatus represents the status of a domain
type DomainStatus struct {
	DomainID       string
	DomainName     string
	LastChecked    time.Time
	IsVerified     bool
	DNSHealthy     bool
	MXRecords      []string
	SPFValid       bool
	DKIMValid      bool
	DMARCValid     bool
	Errors         []string
	NextCheckAt    time.Time
}

// CheckDomain performs a single check on a domain
func (m *Monitor) CheckDomain(ctx context.Context, domain, dkimSelector string) (*DomainStatus, error) {
	m.logger.Info("Checking domain", zap.String("domain", domain))

	result := m.verifier.VerifyAll(ctx, domain, dkimSelector)

	status := &DomainStatus{
		DomainName:  domain,
		LastChecked: time.Now(),
		IsVerified:  result.Verified,
		MXRecords:   result.MXRecords,
		SPFValid:    result.SPFRecord != "",
		DKIMValid:   result.DKIMRecord != "",
		DMARCValid:  result.DMARCRecord != "",
		Errors:      result.Errors,
		NextCheckAt: time.Now().Add(m.interval),
	}

	// Domain is healthy if all required records are present
	status.DNSHealthy = status.IsVerified && status.SPFValid

	return status, nil
}

// MonitorDomains continuously monitors a list of domains
func (m *Monitor) MonitorDomains(ctx context.Context, domains []string, dkimSelector string, callback func(*DomainStatus)) {
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()

	// Initial check
	for _, domain := range domains {
		status, err := m.CheckDomain(ctx, domain, dkimSelector)
		if err != nil {
			m.logger.Error("Failed to check domain",
				zap.String("domain", domain),
				zap.Error(err),
			)
			continue
		}
		callback(status)
	}

	// Periodic checks
	for {
		select {
		case <-ctx.Done():
			m.logger.Info("DNS monitor stopped")
			return
		case <-ticker.C:
			for _, domain := range domains {
				status, err := m.CheckDomain(ctx, domain, dkimSelector)
				if err != nil {
					m.logger.Error("Failed to check domain",
						zap.String("domain", domain),
						zap.Error(err),
					)
					continue
				}
				callback(status)
			}
		}
	}
}

// DetectChanges compares current DNS state with previous state
func (m *Monitor) DetectChanges(previous, current *DomainStatus) []string {
	changes := make([]string, 0)

	if previous.IsVerified != current.IsVerified {
		changes = append(changes, fmt.Sprintf("Verification status changed: %v -> %v", previous.IsVerified, current.IsVerified))
	}

	if previous.DNSHealthy != current.DNSHealthy {
		changes = append(changes, fmt.Sprintf("DNS health changed: %v -> %v", previous.DNSHealthy, current.DNSHealthy))
	}

	if len(previous.MXRecords) != len(current.MXRecords) {
		changes = append(changes, "MX records changed")
	}

	if previous.SPFValid != current.SPFValid {
		changes = append(changes, fmt.Sprintf("SPF record changed: %v -> %v", previous.SPFValid, current.SPFValid))
	}

	if previous.DKIMValid != current.DKIMValid {
		changes = append(changes, fmt.Sprintf("DKIM record changed: %v -> %v", previous.DKIMValid, current.DKIMValid))
	}

	if previous.DMARCValid != current.DMARCValid {
		changes = append(changes, fmt.Sprintf("DMARC record changed: %v -> %v", previous.DMARCValid, current.DMARCValid))
	}

	return changes
}
