# Security Penetration Testing Guide

This guide covers security testing procedures for the Enterprise Email Platform.

## Overview

The platform includes a comprehensive security testing suite with the following tools:

| Tool                 | Type     | Purpose                                     |
| -------------------- | -------- | ------------------------------------------- |
| **OWASP ZAP**        | DAST     | Dynamic application security testing        |
| **Trivy**            | Scanner  | Container/dependency vulnerability scanning |
| **Nuclei**           | Scanner  | Fast vulnerability detection                |
| **SQLMap**           | Exploit  | SQL injection testing                       |
| **Nikto**            | Scanner  | Web server vulnerability scanning           |
| **SSLyze**           | Analyzer | SSL/TLS configuration analysis              |
| **Dependency Check** | Scanner  | OWASP dependency vulnerability check        |

## Quick Start

### 1. Start Security Testing Environment

```bash
cd tests/security
./run-security-tests.sh start-infrastructure
```

### 2. Run Quick Smoke Test

```bash
./run-security-tests.sh quick --target http://localhost:3000
```

### 3. Run Full Security Assessment

```bash
./run-security-tests.sh all --target http://localhost:3000
```

### 4. Generate Consolidated Report

```bash
./run-security-tests.sh report
```

## Pre-Testing Checklist

Before running penetration tests:

- [ ] **Isolated Environment**: Test environment is isolated from production
- [ ] **Data Backup**: All test data is backed up
- [ ] **Authorization**: Written authorization for testing obtained
- [ ] **Scope Defined**: Test scope clearly defined (in-scope and out-of-scope systems)
- [ ] **Monitoring**: Security monitoring is active to detect test traffic
- [ ] **Rollback Plan**: Recovery plan in place if tests cause issues
- [ ] **Test Credentials**: Test accounts with various permission levels ready
- [ ] **Documentation**: Testing methodology documented

## Test Execution

### OWASP ZAP Scan

Run DAST against the web application:

```bash
./run-security-tests.sh zap --target http://localhost:3000
```

**What it tests:**

- Cross-Site Scripting (XSS)
- SQL Injection
- Command Injection
- Path Traversal
- CSRF Vulnerabilities
- Insecure Headers
- Session Management
- Authentication Bypass

**Custom ZAP Scripts:**

Custom scripts are available in `zap-scripts/`:

- `auth-hook.js` - Authentication handling
- `input-vectors.js` - Custom input vectors
- `passive-rules.js` - Custom passive scan rules

### Trivy Vulnerability Scan

Scan containers and dependencies:

```bash
./run-security-tests.sh trivy
```

**What it scans:**

- Docker images for CVEs
- npm/pnpm dependencies
- Go modules
- Python packages
- OS packages in containers

### Nuclei Scanner

Fast vulnerability detection:

```bash
./run-security-tests.sh nuclei --target http://localhost:3000
```

**Template Categories:**

- CVE detection
- Security misconfigurations
- Exposure (sensitive files, backups)
- Default credentials
- WAF bypass

### SSL/TLS Analysis

Analyze TLS configuration:

```bash
./run-security-tests.sh ssl --target https://localhost:443
```

**Checks performed:**

- Certificate validity
- Protocol support (TLS 1.2/1.3)
- Cipher suites
- Perfect Forward Secrecy
- HSTS configuration
- Certificate chain

### Dependency Check

OWASP dependency vulnerability check:

```bash
./run-security-tests.sh dependency
```

**What it analyzes:**

- Known vulnerabilities in dependencies
- Transitive dependencies
- License compliance (optional)

## Manual Testing Procedures

### Authentication Testing

1. **Password Brute Force**

   ```bash
   # Test rate limiting on login
   for i in {1..100}; do
     curl -X POST http://localhost:3000/api/auth/login \
       -d '{"email":"test@test.com","password":"wrong"}' \
       -H "Content-Type: application/json"
   done
   ```

2. **Session Management**
   - Verify session timeout
   - Check session fixation protection
   - Validate session token entropy

3. **MFA Bypass Attempts**
   - Parameter manipulation
   - Response manipulation
   - Race conditions

### Authorization Testing

1. **IDOR Testing**

   ```bash
   # Access other user's resources
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/users/other-user-id/emails
   ```

2. **Privilege Escalation**
   - Horizontal: Access peer resources
   - Vertical: Admin functions as regular user

### API Security Testing

1. **Mass Assignment**

   ```bash
   # Try to set admin flag
   curl -X PUT http://localhost:3000/api/users/me \
     -d '{"name":"Test","isAdmin":true}' \
     -H "Authorization: Bearer $TOKEN"
   ```

2. **API Enumeration**

   ```bash
   # Test for user enumeration
   curl http://localhost:3000/api/users/exists?email=admin@test.com
   ```

3. **Rate Limiting**
   - Verify all endpoints have appropriate rate limits
   - Test rate limit bypass techniques

### Email-Specific Security Tests

1. **SMTP Injection**

   ```bash
   # Test for header injection
   curl -X POST http://localhost:3000/api/mail/send \
     -d '{"to":"victim@test.com%0ACc:attacker@evil.com","subject":"Test"}' \
     -H "Authorization: Bearer $TOKEN"
   ```

2. **Email Content Injection**
   - HTML injection in email body
   - JavaScript execution in email preview
   - Attachment type bypass

3. **SPF/DKIM/DMARC Bypass**
   - Test email authentication spoofing
   - Verify DMARC policy enforcement

## Security Test Report Template

Use the following template for documenting findings:

### Executive Summary

| Severity | Count | Status      |
| -------- | ----- | ----------- |
| Critical | X     | Open/Closed |
| High     | X     | Open/Closed |
| Medium   | X     | Open/Closed |
| Low      | X     | Open/Closed |
| Info     | X     | N/A         |

### Finding Template

```markdown
## Finding: [Title]

**Severity:** [Critical/High/Medium/Low] **CVSS Score:** X.X **Status:** [Open/In Progress/Closed]

### Description

[Detailed description of the vulnerability]

### Location

- URL: [Affected URL]
- Parameter: [Vulnerable parameter]
- Component: [Affected component]

### Impact

[What could an attacker do with this vulnerability?]

### Steps to Reproduce

1. [Step 1]
2. [Step 2]
3. [Step 3]

### Evidence

[Screenshots, request/response logs, etc.]

### Recommendation

[How to fix the vulnerability]

### References

- [OWASP Reference]
- [CVE if applicable]
```

## Common Vulnerabilities Checklist

### Web Application

- [ ] XSS (Reflected, Stored, DOM)
- [ ] SQL Injection
- [ ] CSRF
- [ ] IDOR
- [ ] Broken Authentication
- [ ] Sensitive Data Exposure
- [ ] Security Misconfiguration
- [ ] Using Components with Known Vulnerabilities
- [ ] Insufficient Logging & Monitoring

### API

- [ ] Broken Object Level Authorization
- [ ] Broken User Authentication
- [ ] Excessive Data Exposure
- [ ] Lack of Resources & Rate Limiting
- [ ] Broken Function Level Authorization
- [ ] Mass Assignment
- [ ] Security Misconfiguration
- [ ] Injection
- [ ] Improper Assets Management

### Email Platform Specific

- [ ] Email Header Injection
- [ ] SPF/DKIM/DMARC Bypass
- [ ] Attachment Malware Bypass
- [ ] Email Content Spoofing
- [ ] IMAP/SMTP Authentication Bypass
- [ ] Mailbox Access Control
- [ ] Domain Verification Bypass
- [ ] Webmail XSS

## Report Generation

After testing, generate reports:

```bash
# Generate consolidated HTML report
./run-security-tests.sh report

# Reports location
ls -la tests/security/reports/
```

**Report Types:**

- `zap-report-*.html` - ZAP scan results
- `trivy-report-*.txt` - Vulnerability scan results
- `nuclei-report-*.txt` - Nuclei findings
- `ssl-report-*.txt` - SSL/TLS analysis
- `dependency-check-*.html` - Dependency vulnerabilities
- `consolidated-report-*.html` - Combined summary

## Remediation Verification

After fixes are applied:

1. **Re-run targeted tests** for fixed vulnerabilities
2. **Verify no regressions** introduced
3. **Update finding status** in report
4. **Document fixes** with before/after evidence

## Continuous Security Testing

### CI/CD Integration

Add to CI pipeline:

```yaml
# .github/workflows/security.yml
security-scan:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Run Trivy
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: "fs"
        severity: "CRITICAL,HIGH"
    - name: Run ZAP baseline
      uses: zaproxy/action-baseline@v0.7.0
      with:
        target: "http://localhost:3000"
```

### Scheduled Scans

- **Daily**: Dependency vulnerability checks
- **Weekly**: Full DAST scan with ZAP
- **Monthly**: Comprehensive penetration test
- **Quarterly**: External penetration test by third party

## Contact

For security concerns:

- **Security Team**: security@enterpriseemail.com
- **Bug Bounty**: https://enterpriseemail.com/security/bug-bounty
