package spf

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"

	"go.uber.org/zap"
)

// Result represents the SPF check result
type Result string

const (
	ResultNone      Result = "none"      // No SPF record found
	ResultNeutral   Result = "neutral"   // ? qualifier
	ResultPass      Result = "pass"      // + qualifier (default)
	ResultFail      Result = "fail"      // - qualifier
	ResultSoftFail  Result = "softfail"  // ~ qualifier
	ResultTempError Result = "temperror" // Temporary error
	ResultPermError Result = "permerror" // Permanent error
)

// Validator performs SPF validation
type Validator struct {
	resolver *net.Resolver
	logger   *zap.Logger
	timeout  time.Duration
	maxLookups int
}

// NewValidator creates a new SPF validator
func NewValidator(logger *zap.Logger) *Validator {
	return &Validator{
		resolver: net.DefaultResolver,
		logger:   logger,
		timeout:  10 * time.Second,
		maxLookups: 10, // RFC 7208 limit
	}
}

// CheckResult holds the complete SPF check result
type CheckResult struct {
	Result      Result
	Domain      string
	Mechanism   string
	Explanation string
	Error       error
}

// Check performs an SPF check for a sender IP and domain
func (v *Validator) Check(ctx context.Context, ip net.IP, senderDomain, heloDomain string) *CheckResult {
	ctx, cancel := context.WithTimeout(ctx, v.timeout)
	defer cancel()

	result := &CheckResult{
		Domain: senderDomain,
	}

	// Look up SPF record
	record, err := v.lookupSPF(ctx, senderDomain)
	if err != nil {
		if isTemporaryError(err) {
			result.Result = ResultTempError
		} else {
			result.Result = ResultNone
		}
		result.Error = err
		return result
	}

	if record == "" {
		result.Result = ResultNone
		return result
	}

	// Parse and evaluate SPF record
	lookupCount := 0
	evalResult := v.evaluate(ctx, record, ip, senderDomain, &lookupCount)
	result.Result = evalResult.result
	result.Mechanism = evalResult.mechanism

	if lookupCount > v.maxLookups {
		result.Result = ResultPermError
		result.Error = fmt.Errorf("exceeded maximum DNS lookups (%d)", v.maxLookups)
	}

	v.logger.Debug("SPF check completed",
		zap.String("ip", ip.String()),
		zap.String("domain", senderDomain),
		zap.String("result", string(result.Result)),
		zap.String("mechanism", result.Mechanism),
		zap.Int("lookups", lookupCount))

	return result
}

func (v *Validator) lookupSPF(ctx context.Context, domain string) (string, error) {
	records, err := v.resolver.LookupTXT(ctx, domain)
	if err != nil {
		return "", err
	}

	for _, record := range records {
		if strings.HasPrefix(record, "v=spf1 ") || record == "v=spf1" {
			return record, nil
		}
	}

	return "", nil
}

type evalResult struct {
	result    Result
	mechanism string
}

func (v *Validator) evaluate(ctx context.Context, record string, ip net.IP, domain string, lookupCount *int) evalResult {
	// Parse record
	terms := strings.Fields(record)
	if len(terms) == 0 || terms[0] != "v=spf1" {
		return evalResult{result: ResultPermError}
	}

	for _, term := range terms[1:] {
		if *lookupCount > v.maxLookups {
			return evalResult{result: ResultPermError}
		}

		result := v.evaluateTerm(ctx, term, ip, domain, lookupCount)
		if result.result != ResultNone {
			return result
		}
	}

	// Default result if no mechanism matched
	return evalResult{result: ResultNeutral}
}

func (v *Validator) evaluateTerm(ctx context.Context, term string, ip net.IP, domain string, lookupCount *int) evalResult {
	// Parse qualifier
	qualifier := "+"
	if len(term) > 0 && (term[0] == '+' || term[0] == '-' || term[0] == '~' || term[0] == '?') {
		qualifier = string(term[0])
		term = term[1:]
	}

	// Handle modifiers
	if strings.HasPrefix(term, "redirect=") {
		*lookupCount++
		redirectDomain := term[9:]
		record, err := v.lookupSPF(ctx, redirectDomain)
		if err != nil || record == "" {
			return evalResult{result: ResultPermError}
		}
		return v.evaluate(ctx, record, ip, redirectDomain, lookupCount)
	}

	if strings.HasPrefix(term, "exp=") {
		// Explanation - ignore for evaluation
		return evalResult{result: ResultNone}
	}

	// Evaluate mechanism
	match := false
	mechanism := term

	switch {
	case term == "all":
		match = true

	case term == "a" || strings.HasPrefix(term, "a:") || strings.HasPrefix(term, "a/"):
		*lookupCount++
		match = v.checkA(ctx, term, ip, domain)

	case term == "mx" || strings.HasPrefix(term, "mx:") || strings.HasPrefix(term, "mx/"):
		*lookupCount++
		match = v.checkMX(ctx, term, ip, domain)

	case strings.HasPrefix(term, "ip4:"):
		match = v.checkIP4(term[4:], ip)

	case strings.HasPrefix(term, "ip6:"):
		match = v.checkIP6(term[4:], ip)

	case strings.HasPrefix(term, "include:"):
		*lookupCount++
		match = v.checkInclude(ctx, term[8:], ip, lookupCount)

	case strings.HasPrefix(term, "exists:"):
		*lookupCount++
		match = v.checkExists(ctx, term[7:])

	case term == "ptr" || strings.HasPrefix(term, "ptr:"):
		*lookupCount++
		match = v.checkPTR(ctx, term, ip, domain)
	}

	if match {
		return evalResult{
			result:    qualifierToResult(qualifier),
			mechanism: mechanism,
		}
	}

	return evalResult{result: ResultNone}
}

func (v *Validator) checkA(ctx context.Context, term string, ip net.IP, domain string) bool {
	targetDomain := domain
	cidrLen := 32
	if ip.To4() == nil {
		cidrLen = 128
	}

	// Parse a:domain/cidr
	if strings.HasPrefix(term, "a:") {
		rest := term[2:]
		if idx := strings.Index(rest, "/"); idx != -1 {
			targetDomain = rest[:idx]
			fmt.Sscanf(rest[idx+1:], "%d", &cidrLen)
		} else {
			targetDomain = rest
		}
	} else if strings.HasPrefix(term, "a/") {
		fmt.Sscanf(term[2:], "%d", &cidrLen)
	}

	ips, err := v.resolver.LookupIP(ctx, "ip", targetDomain)
	if err != nil {
		return false
	}

	return matchIP(ip, ips, cidrLen)
}

func (v *Validator) checkMX(ctx context.Context, term string, ip net.IP, domain string) bool {
	targetDomain := domain
	cidrLen := 32
	if ip.To4() == nil {
		cidrLen = 128
	}

	// Parse mx:domain/cidr
	if strings.HasPrefix(term, "mx:") {
		rest := term[3:]
		if idx := strings.Index(rest, "/"); idx != -1 {
			targetDomain = rest[:idx]
			fmt.Sscanf(rest[idx+1:], "%d", &cidrLen)
		} else {
			targetDomain = rest
		}
	} else if strings.HasPrefix(term, "mx/") {
		fmt.Sscanf(term[3:], "%d", &cidrLen)
	}

	mxRecords, err := v.resolver.LookupMX(ctx, targetDomain)
	if err != nil {
		return false
	}

	for _, mx := range mxRecords {
		ips, err := v.resolver.LookupIP(ctx, "ip", mx.Host)
		if err != nil {
			continue
		}
		if matchIP(ip, ips, cidrLen) {
			return true
		}
	}

	return false
}

func (v *Validator) checkIP4(cidr string, ip net.IP) bool {
	if ip.To4() == nil {
		return false // IPv6 address
	}

	// Handle single IP
	if !strings.Contains(cidr, "/") {
		cidr = cidr + "/32"
	}

	_, network, err := net.ParseCIDR(cidr)
	if err != nil {
		return false
	}

	return network.Contains(ip)
}

func (v *Validator) checkIP6(cidr string, ip net.IP) bool {
	if ip.To4() != nil {
		return false // IPv4 address
	}

	// Handle single IP
	if !strings.Contains(cidr, "/") {
		cidr = cidr + "/128"
	}

	_, network, err := net.ParseCIDR(cidr)
	if err != nil {
		return false
	}

	return network.Contains(ip)
}

func (v *Validator) checkInclude(ctx context.Context, includeDomain string, ip net.IP, lookupCount *int) bool {
	record, err := v.lookupSPF(ctx, includeDomain)
	if err != nil || record == "" {
		return false
	}

	result := v.evaluate(ctx, record, ip, includeDomain, lookupCount)
	return result.result == ResultPass
}

func (v *Validator) checkExists(ctx context.Context, domain string) bool {
	ips, err := v.resolver.LookupIP(ctx, "ip4", domain)
	return err == nil && len(ips) > 0
}

func (v *Validator) checkPTR(ctx context.Context, term string, ip net.IP, domain string) bool {
	targetDomain := domain
	if strings.HasPrefix(term, "ptr:") {
		targetDomain = term[4:]
	}

	names, err := v.resolver.LookupAddr(ctx, ip.String())
	if err != nil {
		return false
	}

	for _, name := range names {
		name = strings.TrimSuffix(name, ".")
		if strings.HasSuffix(name, "."+targetDomain) || name == targetDomain {
			// Verify forward lookup matches
			ips, err := v.resolver.LookupIP(ctx, "ip", name)
			if err != nil {
				continue
			}
			for _, resolvedIP := range ips {
				if resolvedIP.Equal(ip) {
					return true
				}
			}
		}
	}

	return false
}

func matchIP(ip net.IP, candidates []net.IP, cidrLen int) bool {
	for _, candidate := range candidates {
		if ip.To4() != nil && candidate.To4() != nil {
			// IPv4
			_, network, _ := net.ParseCIDR(fmt.Sprintf("%s/%d", candidate.String(), cidrLen))
			if network != nil && network.Contains(ip) {
				return true
			}
		} else if ip.To4() == nil && candidate.To4() == nil {
			// IPv6
			_, network, _ := net.ParseCIDR(fmt.Sprintf("%s/%d", candidate.String(), cidrLen))
			if network != nil && network.Contains(ip) {
				return true
			}
		}
	}
	return false
}

func qualifierToResult(qualifier string) Result {
	switch qualifier {
	case "+":
		return ResultPass
	case "-":
		return ResultFail
	case "~":
		return ResultSoftFail
	case "?":
		return ResultNeutral
	default:
		return ResultPass
	}
}

func isTemporaryError(err error) bool {
	if dnsErr, ok := err.(*net.DNSError); ok {
		return dnsErr.Temporary()
	}
	return false
}

// GenerateSPFRecord generates an SPF record for a domain
func GenerateSPFRecord(includes []string, ip4s []string, ip6s []string, mx bool, policy string) string {
	var parts []string
	parts = append(parts, "v=spf1")

	for _, inc := range includes {
		parts = append(parts, fmt.Sprintf("include:%s", inc))
	}

	if mx {
		parts = append(parts, "mx")
	}

	for _, ip := range ip4s {
		parts = append(parts, fmt.Sprintf("ip4:%s", ip))
	}

	for _, ip := range ip6s {
		parts = append(parts, fmt.Sprintf("ip6:%s", ip))
	}

	switch policy {
	case "reject":
		parts = append(parts, "-all")
	case "softfail":
		parts = append(parts, "~all")
	case "neutral":
		parts = append(parts, "?all")
	default:
		parts = append(parts, "-all")
	}

	return strings.Join(parts, " ")
}
