# 🚀 CEERION MAIL - DNS RECORDS PUBLICATION GUIDE

## 📋 Quick Copy-Paste DNS Records

### 1. Essential Records (Deploy First)

```
# A Record
Name: mail.ceerion.com
Type: A
Value: 209.126.9.62

# MX Record
Name: ceerion.com
Type: MX
Priority: 10
Value: mail.ceerion.com

# SPF Record
Name: ceerion.com
Type: TXT
Value: "v=spf1 mx -all"
```

### 2. Authentication Records

```
# DKIM Record (Selector: ceerion)
Name: ceerion._domainkey.ceerion.com
Type: TXT
Value: "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu8VLMI9m8OMe/qGdt3xIhUx9RcwYGhpbhlNC8gFYf92fMhvq0aubCeo7/ACHElY5Ilbvkh0ybz0sTN4rBd51yXFdR+K4AzqzBuNXM8Z4E0xHhhpeTXO7xHfxYSPa1MDPvw0Nblan9QqVBLjz9sk6Xf9Jhg0vTGzfX+goaZmk1NyXIJky0E83+2DNE4qZtnkSR8tjCG5+y2tJdlDzPpijE476ztvUDc9Wunxmb0ibhTn1S/cQxBerNRxk8seeTbUD9UFXqP3tZXqsjw5ndJ5e5xRUcxcXcU1f77ni9DPdLE3kIj8LeXfPSUAc3isN5G/6KIafo5x7mum0bZednRgNvQIDAQAB"

# DMARC Record
Name: _dmarc.ceerion.com
Type: TXT
Value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@ceerion.com; ruf=mailto:dmarc@ceerion.com; fo=1"

# MTA-STS Record
Name: _mta-sts.ceerion.com
Type: TXT
Value: "v=STSv1; id=20250828"

# TLS-RPT Record
Name: _smtp._tls.ceerion.com
Type: TXT
Value: "v=TLSRPTv1; rua=mailto:tlsrpt@ceerion.com"
```

## 🌐 Additional Requirements

### PTR Record (Contact Hosting Provider)

```
IP: 209.126.9.62
Hostname: mail.ceerion.com
```

### MTA-STS Policy File

Host at: `https://mta-sts.ceerion.com/.well-known/mta-sts.txt`

```
version: STSv1
mode: testing
mx: mail.ceerion.com
max_age: 86400
```

### Required Email Addresses

- postmaster@ceerion.com
- abuse@ceerion.com
- dmarc@ceerion.com
- tlsrpt@ceerion.com

## ✅ Verification Checklist

### DNS Propagation Test

```powershell
nslookup -type=MX ceerion.com
nslookup -type=A mail.ceerion.com
nslookup -type=TXT ceerion.com
nslookup -type=TXT ceerion._domainkey.ceerion.com
nslookup -type=TXT _dmarc.ceerion.com
nslookup -type=TXT _mta-sts.ceerion.com
nslookup -type=TXT _smtp._tls.ceerion.com
```

### Online Tools

- **MXToolbox**: https://mxtoolbox.com/domain/ceerion.com
- **Mail-Tester**: https://www.mail-tester.com/
- **DMARC Analyzer**: https://dmarcanalyzer.com/

## 🎯 Success Criteria

**Target Status**: All authentication probes showing **GREEN**

- ✅ SPF: Pass
- ✅ DKIM: Pass (headers show rotation capability)
- ✅ DMARC: Pass
- ✅ MTA-STS: Pass
- ✅ TLS-RPT: Pass
- ✅ PTR: Matches SMTP HELO

---

**📧 CEERION Mail Infrastructure Ready for Production**
