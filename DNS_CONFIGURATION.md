# DNS Configuration for CEERION Mail

## Server Information

- **Mail Server IP**: 209.126.9.62
- **Domain**: ceerion.com
- **Mail Hostname**: mail.ceerion.com

## Required DNS Records

### 1. A Record

```dns
Type: A
Name: mail.ceerion.com
Value: 209.126.9.62
TTL: 3600
```

### 2. MX Record

```dns
Type: MX
Name: ceerion.com (or @)
Value: mail.ceerion.com
Priority: 10
TTL: 3600
```

### 3. SPF Record

```dns
Type: TXT
Name: ceerion.com (or @)
Value: v=spf1 mx -all
TTL: 3600
```

### 4. DKIM Record

```dns
Type: TXT
Name: ceerion._domainkey.ceerion.com
Value: v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu8VLMI9m8OMe/qGdt3xIhUx9RcwYGhpbhlNC8gFYf92fMhvq0aubCeo7/ACHElY5Ilbvkh0ybz0sTN4rBd51yXFdR+K4AzqzBuNXM8Z4E0xHhhpeTXO7xHfxYSPa1MDPvw0Nblan9QqVBLjz9sk6Xf9Jhg0vTGzfX+goaZmk1NyXIJky0E83+2DNE4qZtnkSR8tjCG5+y2tJdlDzPpijE476ztvUDc9Wunxmb0ibhTn1S/cQxBerNRxk8seeTbUD9UFXqP3tZXqsjw5ndJ5e5xRUcxcXcU1f77ni9DPdLE3kIj8LeXfPSUAc3isN5G/6KIafo5x7mum0bZednRgNvQIDAQAB
TTL: 3600
```

### 5. DMARC Record

```dns
Type: TXT
Name: _dmarc.ceerion.com
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@ceerion.com; ruf=mailto:dmarc@ceerion.com; fo=1
TTL: 3600
```

### 6. MTA-STS Record

```dns
Type: TXT
Name: _mta-sts.ceerion.com
Value: v=STSv1; id=20250828
TTL: 3600
```

### 7. TLS-RPT Record

```dns
Type: TXT
Name: _smtp._tls.ceerion.com
Value: v=TLSRPTv1; rua=mailto:tlsrpt@ceerion.com
TTL: 3600
```

### 8. PTR Record (Reverse DNS)

**Note**: This must be configured by your hosting provider/ISP for IP 209.126.9.62

```dns
Type: PTR
IP: 209.126.9.62
Value: mail.ceerion.com
```

## MTA-STS Policy File

Create and host the following file at: **<https://mta-sts.ceerion.com/.well-known/mta-sts.txt>**

```text
version: STSv1
mode: testing
mx: mail.ceerion.com
max_age: 86400
```

## Required Email Addresses

Create these email addresses on your mail server:

- `postmaster@ceerion.com`
- `abuse@ceerion.com`
- `dmarc@ceerion.com`
- `tlsrpt@ceerion.com`

## Verification Steps

### 1. DNS Propagation Check

```bash
# Check MX record
dig MX ceerion.com

# Check A record
dig A mail.ceerion.com

# Check SPF
dig TXT ceerion.com | grep spf

# Check DKIM
dig TXT ceerion._domainkey.ceerion.com

# Check DMARC
dig TXT _dmarc.ceerion.com

# Check MTA-STS
dig TXT _mta-sts.ceerion.com

# Check TLS-RPT
dig TXT _smtp._tls.ceerion.com
```

### 2. Mail Authentication Tests

- **MX Toolbox**: <https://mxtoolbox.com/domain/ceerion.com>
- **DKIM Validator**: <https://dkimvalidator.com/>
- **DMARC Analyzer**: <https://dmarcanalyzer.com/>
- **MTA-STS Validator**: <https://aykevl.nl/apps/mta-sts/>

### 3. Email Deliverability Tests

- Send test emails to major providers (Gmail, Outlook, Yahoo)
- Check headers for DKIM signatures
- Monitor DMARC reports
- Verify MTA-STS policy is being fetched

## Implementation Priority

1. **Immediate (Critical)**:
   - A record: mail.ceerion.com → 209.126.9.62
   - MX record: ceerion.com → mail.ceerion.com
   - SPF record: v=spf1 mx -all

2. **Within 24 hours**:
   - DKIM record
   - Create required email addresses
   - Configure PTR record with hosting provider

3. **Within 48 hours**:
   - DMARC record (start with p=none for monitoring)
   - MTA-STS setup
   - TLS-RPT setup

4. **Monitoring Phase (1-2 weeks)**:
   - Monitor DMARC reports
   - Adjust DMARC policy from none → quarantine → reject
   - Monitor MTA-STS and TLS-RPT reports

## Security Considerations

- **DKIM Key Rotation**: Plan to rotate DKIM keys every 6-12 months
- **DMARC Policy Evolution**: Start with p=none, then p=quarantine, finally p=reject
- **MTA-STS Mode**: Start with mode=testing, then move to mode=enforce
- **Monitoring**: Set up regular monitoring for all authentication mechanisms

## Troubleshooting

Common issues and solutions:

- **SPF fails**: Ensure all sending IPs are included in SPF record
- **DKIM fails**: Verify DKIM record syntax and key format
- **DMARC fails**: Check SPF and DKIM alignment
- **PTR mismatch**: Contact hosting provider to set reverse DNS
- **MTA-STS issues**: Verify HTTPS certificate and policy file accessibility
