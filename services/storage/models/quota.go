package models

import (
	"time"
)

// QuotaLevel represents the hierarchy level for quotas
type QuotaLevel string

const (
	QuotaLevelOrganization QuotaLevel = "organization"
	QuotaLevelDomain       QuotaLevel = "domain"
	QuotaLevelUser         QuotaLevel = "user"
	QuotaLevelMailbox      QuotaLevel = "mailbox"
)

// Quota represents storage quota information
type Quota struct {
	ID            string     `json:"id"`
	Level         QuotaLevel `json:"level"`
	EntityID      string     `json:"entity_id"`      // org_id, domain_id, user_id, or mailbox_id
	ParentID      string     `json:"parent_id"`      // Parent quota ID for hierarchy
	TotalBytes    int64      `json:"total_bytes"`    // Total allocated quota
	UsedBytes     int64      `json:"used_bytes"`     // Currently used
	ReservedBytes int64      `json:"reserved_bytes"` // Reserved for pending operations
	SoftLimitPct  int        `json:"soft_limit_pct"` // Warning threshold percentage
	HardLimitPct  int        `json:"hard_limit_pct"` // Rejection threshold (usually 100)
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// AvailableBytes returns the available bytes considering used and reserved
func (q *Quota) AvailableBytes() int64 {
	available := q.TotalBytes - q.UsedBytes - q.ReservedBytes
	if available < 0 {
		return 0
	}
	return available
}

// UsagePercent returns the current usage as a percentage
func (q *Quota) UsagePercent() float64 {
	if q.TotalBytes == 0 {
		return 0
	}
	return float64(q.UsedBytes) * 100 / float64(q.TotalBytes)
}

// IsAtSoftLimit checks if usage is at or above soft limit
func (q *Quota) IsAtSoftLimit() bool {
	return q.UsagePercent() >= float64(q.SoftLimitPct)
}

// IsAtHardLimit checks if usage is at or above hard limit
func (q *Quota) IsAtHardLimit() bool {
	return q.UsagePercent() >= float64(q.HardLimitPct)
}

// CanAccommodate checks if the quota can accommodate additional bytes
func (q *Quota) CanAccommodate(additionalBytes int64) bool {
	projectedUsage := q.UsedBytes + q.ReservedBytes + additionalBytes
	hardLimit := q.TotalBytes * int64(q.HardLimitPct) / 100
	return projectedUsage <= hardLimit
}

// QuotaStatus represents the current status of a quota
type QuotaStatus string

const (
	QuotaStatusOK       QuotaStatus = "ok"
	QuotaStatusWarning  QuotaStatus = "warning"   // At soft limit
	QuotaStatusCritical QuotaStatus = "critical"  // Near hard limit
	QuotaStatusExceeded QuotaStatus = "exceeded"  // At or over hard limit
)

// QuotaInfo provides detailed quota information
type QuotaInfo struct {
	Quota         *Quota      `json:"quota"`
	Status        QuotaStatus `json:"status"`
	AvailableBytes int64      `json:"available_bytes"`
	UsagePercent  float64     `json:"usage_percent"`
	// Hierarchy information
	ParentQuota   *QuotaInfo  `json:"parent_quota,omitempty"`
}

// GetStatus calculates the current quota status
func (q *Quota) GetStatus() QuotaStatus {
	usage := q.UsagePercent()
	switch {
	case usage >= float64(q.HardLimitPct):
		return QuotaStatusExceeded
	case usage >= float64(q.HardLimitPct)-5: // Within 5% of hard limit
		return QuotaStatusCritical
	case usage >= float64(q.SoftLimitPct):
		return QuotaStatusWarning
	default:
		return QuotaStatusOK
	}
}

// QuotaCheckResult represents the result of a quota check
type QuotaCheckResult struct {
	Allowed       bool        `json:"allowed"`
	Status        QuotaStatus `json:"status"`
	Level         QuotaLevel  `json:"level"`          // Level that blocked (if not allowed)
	EntityID      string      `json:"entity_id"`      // Entity that blocked
	AvailableBytes int64      `json:"available_bytes"`
	RequiredBytes int64       `json:"required_bytes"`
	Message       string      `json:"message,omitempty"`
}

// QuotaUsageUpdate represents a quota usage update
type QuotaUsageUpdate struct {
	MailboxID  string `json:"mailbox_id"`
	DeltaBytes int64  `json:"delta_bytes"` // Positive for increase, negative for decrease
	Operation  string `json:"operation"`   // Description of operation
}

// QuotaAllocation represents quota allocated from parent to child
type QuotaAllocation struct {
	ID            string    `json:"id"`
	ParentQuotaID string    `json:"parent_quota_id"`
	ChildQuotaID  string    `json:"child_quota_id"`
	AllocatedBytes int64    `json:"allocated_bytes"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// QuotaAuditLog tracks quota changes for auditing
type QuotaAuditLog struct {
	ID            string     `json:"id"`
	QuotaID       string     `json:"quota_id"`
	Level         QuotaLevel `json:"level"`
	EntityID      string     `json:"entity_id"`
	Operation     string     `json:"operation"`
	PreviousValue int64      `json:"previous_value"`
	NewValue      int64      `json:"new_value"`
	DeltaBytes    int64      `json:"delta_bytes"`
	Reason        string     `json:"reason"`
	PerformedBy   string     `json:"performed_by"` // User or system
	CreatedAt     time.Time  `json:"created_at"`
}

// CreateQuotaRequest represents a request to create a new quota
type CreateQuotaRequest struct {
	Level        QuotaLevel `json:"level"`
	EntityID     string     `json:"entity_id"`
	ParentID     string     `json:"parent_id,omitempty"`
	TotalBytes   int64      `json:"total_bytes"`
	SoftLimitPct int        `json:"soft_limit_pct,omitempty"`
	HardLimitPct int        `json:"hard_limit_pct,omitempty"`
}

// UpdateQuotaRequest represents a request to update a quota
type UpdateQuotaRequest struct {
	TotalBytes   *int64 `json:"total_bytes,omitempty"`
	SoftLimitPct *int   `json:"soft_limit_pct,omitempty"`
	HardLimitPct *int   `json:"hard_limit_pct,omitempty"`
}
