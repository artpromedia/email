# CEERION.COM DNS Records - Ready to Publish

## Quick Setup Guide for DNS Provider

### Core Mail Records (Deploy Immediately)

```dns
# A Record
mail.ceerion.com.    IN    A        209.126.9.62

# MX Record
ceerion.com.         IN    MX   10  mail.ceerion.com.

# SPF Record
ceerion.com.         IN    TXT      "v=spf1 mx -all"
```

### Email Authentication Records

```dns
# DKIM Record (selector: ceerion)
ceerion._domainkey.ceerion.com.    IN    TXT    "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu8VLMI9m8OMe/qGdt3xIhUx9RcwYGhpbhlNC8gFYf92fMhvq0aubCeo7/ACHElY5Ilbvkh0ybz0sTN4rBd51yXFdR+K4AzqzBuNXM8Z4E0xHhhpeTXO7xHfxYSPa1MDPvw0Nblan9QqVBLjz9sk6Xf9Jhg0vTGzfX+goaZmk1NyXIJky0E83+2DNE4qZtnkSR8tjCG5+y2tJdlDzPpijE476ztvUDc9Wunxmb0ibhTn1S/cQxBerNRxk8seeTbUD9UFXqP3tZXqsjw5ndJ5e5xRUcxcXcU1f77ni9DPdLE3kIj8LeXfPSUAc3isN5G/6KIafo5x7mum0bZednRgNvQIDAQAB"

# DMARC Record
_dmarc.ceerion.com.                IN    TXT    "v=DMARC1; p=quarantine; rua=mailto:dmarc@ceerion.com; ruf=mailto:dmarc@ceerion.com; fo=1"

# MTA-STS Record
_mta-sts.ceerion.com.              IN    TXT    "v=STSv1; id=20250828"

# TLS-RPT Record
_smtp._tls.ceerion.com.            IN    TXT    "v=TLSRPTv1; rua=mailto:tlsrpt@ceerion.com"
```

## Required Actions

### 1. DNS Provider Configuration

Copy the above records to your DNS provider (GoDaddy, Cloudflare, etc.)

### 2. Hosting Provider (PTR Record)

Contact your server hosting provider to configure:

```
PTR Record: 209.126.9.62 → mail.ceerion.com
```

### 3. MTA-STS Policy File

Host this file at: `https://mta-sts.ceerion.com/.well-known/mta-sts.txt`

```
version: STSv1
mode: testing
mx: mail.ceerion.com
max_age: 86400
```

### 4. Create Required Email Addresses

- postmaster@ceerion.com
- abuse@ceerion.com
- dmarc@ceerion.com
- tlsrpt@ceerion.com

## Verification Commands

```bash
# Test all records at once
dig MX ceerion.com +short
dig A mail.ceerion.com +short
dig TXT ceerion.com | grep spf
dig TXT ceerion._domainkey.ceerion.com
dig TXT _dmarc.ceerion.com
dig TXT _mta-sts.ceerion.com
dig TXT _smtp._tls.ceerion.com
```

## Online Verification Tools

- **Mail-Tester**: https://www.mail-tester.com/
- **MXToolbox**: https://mxtoolbox.com/domain/ceerion.com
- **DMARC Analyzer**: https://dmarcanalyzer.com/

---

**Status**: Ready for DNS publication ✅  
**Target**: All authentication probes GREEN  
**DKIM**: Rotate-ready with headers confirmation
