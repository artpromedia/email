package monitor

import (
	"context"
	"fmt"
	"time"

	"github.com/robfig/cron/v3"
	"go.uber.org/zap"

	"domain-manager/config"
	"domain-manager/domain"
	"domain-manager/repository"
	"domain-manager/service"
)

// DNSMonitor monitors DNS records for all verified domains
type DNSMonitor struct {
	domainRepo *repository.DomainRepository
	dkimRepo   *repository.DKIMKeyRepository
	dnsService *service.DNSService
	config     *config.MonitorConfig
	cron       *cron.Cron
	logger     *zap.Logger
	alertChan  chan domain.DNSMonitorAlert
}

// NewDNSMonitor creates a new DNS monitor
func NewDNSMonitor(
	domainRepo *repository.DomainRepository,
	dkimRepo *repository.DKIMKeyRepository,
	dnsService *service.DNSService,
	cfg *config.MonitorConfig,
	logger *zap.Logger,
) *DNSMonitor {
	return &DNSMonitor{
		domainRepo: domainRepo,
		dkimRepo:   dkimRepo,
		dnsService: dnsService,
		config:     cfg,
		cron:       cron.New(cron.WithSeconds()),
		logger:     logger,
		alertChan:  make(chan domain.DNSMonitorAlert, 100),
	}
}

// Start starts the DNS monitoring cron job
func (m *DNSMonitor) Start() error {
	// Convert check interval to cron schedule
	interval := m.config.CheckInterval
	if interval == 0 {
		interval = 30 * time.Minute // Default: every 30 minutes
	}

	// Build cron schedule from duration (simplified: just use minutes)
	minutes := int(interval.Minutes())
	if minutes < 1 {
		minutes = 30
	}
	schedule := fmt.Sprintf("0 */%d * * * *", minutes)

	_, err := m.cron.AddFunc(schedule, func() {
		m.checkAllDomains()
	})
	if err != nil {
		return err
	}

	m.cron.Start()
	m.logger.Info("DNS monitor started", zap.String("schedule", schedule))

	return nil
}

// Stop stops the DNS monitor
func (m *DNSMonitor) Stop() {
	ctx := m.cron.Stop()
	<-ctx.Done()
	close(m.alertChan)
	m.logger.Info("DNS monitor stopped")
}

// Alerts returns the alert channel
func (m *DNSMonitor) Alerts() <-chan domain.DNSMonitorAlert {
	return m.alertChan
}

// checkAllDomains checks DNS records for all verified domains
func (m *DNSMonitor) checkAllDomains() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	m.logger.Info("Starting DNS check for all verified domains")

	domains, err := m.domainRepo.ListAllVerified(ctx)
	if err != nil {
		m.logger.Error("Failed to list verified domains", zap.Error(err))
		return
	}

	for _, d := range domains {
		m.checkDomain(ctx, d)
	}

	m.logger.Info("Completed DNS check", zap.Int("domains_checked", len(domains)))
}

// checkDomain checks DNS records for a single domain
func (m *DNSMonitor) checkDomain(ctx context.Context, d *domain.Domain) {
	// Get active DKIM key
	var dkimSelector, dkimPublicKey string
	keys, err := m.dkimRepo.ListByDomain(ctx, d.ID)
	if err == nil {
		for _, k := range keys {
			if k.IsActive {
				dkimSelector = k.Selector
				dkimPublicKey = k.PublicKey
				break
			}
		}
	}

	// Perform DNS check
	result := m.dnsService.CheckDNS(ctx, d.DomainName, d.VerificationToken, dkimSelector, dkimPublicKey)

	// Check for changes and generate alerts
	m.generateAlerts(d, result)

	// Update domain DNS status
	err = m.domainRepo.UpdateDNSStatus(ctx, d.ID, result.MXVerified, result.SPFVerified, result.DKIMVerified, result.DMARCVerified)
	if err != nil {
		m.logger.Error("Failed to update DNS status",
			zap.String("domain_id", d.ID),
			zap.Error(err),
		)
	}
}

// generateAlerts generates alerts for DNS changes
func (m *DNSMonitor) generateAlerts(d *domain.Domain, result *domain.DNSCheckResult) {
	now := time.Now()

	// Check MX record status change
	if d.MXVerified && !result.MXVerified {
		alert := domain.DNSMonitorAlert{
			ID:         generateAlertID(),
			DomainID:   d.ID,
			DomainName: d.DomainName,
			AlertType:  "mx_failure",
			RecordType: "MX",
			Severity:   "critical",
			Message:    "MX record check failed. Email delivery may be affected.",
			CreatedAt:  now,
		}
		m.sendAlert(alert)
	}

	// Check SPF record status change
	if d.SPFVerified && !result.SPFVerified {
		alert := domain.DNSMonitorAlert{
			ID:         generateAlertID(),
			DomainID:   d.ID,
			DomainName: d.DomainName,
			AlertType:  "spf_failure",
			RecordType: "TXT",
			Severity:   "high",
			Message:    "SPF record check failed. Outgoing emails may be marked as spam.",
			CreatedAt:  now,
		}
		m.sendAlert(alert)
	}

	// Check DKIM record status change
	if d.DKIMVerified && !result.DKIMVerified {
		alert := domain.DNSMonitorAlert{
			ID:         generateAlertID(),
			DomainID:   d.ID,
			DomainName: d.DomainName,
			AlertType:  "dkim_failure",
			RecordType: "TXT",
			Severity:   "high",
			Message:    "DKIM record check failed. Email authentication may fail.",
			CreatedAt:  now,
		}
		m.sendAlert(alert)
	}

	// Check DMARC record status change
	if d.DMARCVerified && !result.DMARCVerified {
		alert := domain.DNSMonitorAlert{
			ID:         generateAlertID(),
			DomainID:   d.ID,
			DomainName: d.DomainName,
			AlertType:  "dmarc_failure",
			RecordType: "TXT",
			Severity:   "medium",
			Message:    "DMARC record check failed.",
			CreatedAt:  now,
		}
		m.sendAlert(alert)
	}

	// Generate alerts for critical issues found
	for _, issue := range result.Issues {
		alert := domain.DNSMonitorAlert{
			ID:         generateAlertID(),
			DomainID:   d.ID,
			DomainName: d.DomainName,
			AlertType:  "dns_issue",
			RecordType: issue.RecordType,
			Severity:   "medium",
			Message:    issue.Message,
			CreatedAt:  now,
		}
		m.sendAlert(alert)
	}
}

// sendAlert sends an alert to the alert channel
func (m *DNSMonitor) sendAlert(alert domain.DNSMonitorAlert) {
	select {
	case m.alertChan <- alert:
		m.logger.Warn("DNS alert generated",
			zap.String("domain", alert.DomainName),
			zap.String("type", alert.AlertType),
			zap.String("severity", alert.Severity),
			zap.String("message", alert.Message),
		)
	default:
		m.logger.Error("Alert channel full, dropping alert",
			zap.String("domain", alert.DomainName),
			zap.String("type", alert.AlertType),
		)
	}
}

// CheckDomain performs an immediate DNS check for a specific domain
func (m *DNSMonitor) CheckDomain(ctx context.Context, domainID string) (*domain.DNSCheckResult, error) {
	d, err := m.domainRepo.GetByID(ctx, domainID)
	if err != nil {
		return nil, err
	}
	if d == nil {
		return nil, nil
	}

	// Get active DKIM key
	var dkimSelector, dkimPublicKey string
	keys, err := m.dkimRepo.ListByDomain(ctx, d.ID)
	if err == nil {
		for _, k := range keys {
			if k.IsActive {
				dkimSelector = k.Selector
				dkimPublicKey = k.PublicKey
				break
			}
		}
	}

	// Perform DNS check
	result := m.dnsService.CheckDNS(ctx, d.DomainName, d.VerificationToken, dkimSelector, dkimPublicKey)

	// Update domain DNS status
	_ = m.domainRepo.UpdateDNSStatus(ctx, d.ID, result.MXVerified, result.SPFVerified, result.DKIMVerified, result.DMARCVerified)

	return result, nil
}

// generateAlertID generates a unique alert ID
func generateAlertID() string {
	return time.Now().Format("20060102150405.000000")
}
