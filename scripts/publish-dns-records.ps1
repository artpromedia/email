# CEERION Mail DNS Records - PowerShell Version

Write-Host "=============================================="
Write-Host "CEERION MAIL DNS RECORDS - READY TO PUBLISH"
Write-Host "=============================================="
Write-Host ""

Write-Host "1. A RECORD:" -ForegroundColor Green
Write-Host "   Name: mail.ceerion.com"
Write-Host "   Type: A"
Write-Host "   Value: 209.126.9.62"
Write-Host "   TTL: 3600"
Write-Host ""

Write-Host "2. MX RECORD:" -ForegroundColor Green
Write-Host "   Name: ceerion.com (or @)"
Write-Host "   Type: MX" 
Write-Host "   Value: mail.ceerion.com"
Write-Host "   Priority: 10"
Write-Host "   TTL: 3600"
Write-Host ""

Write-Host "3. SPF RECORD:" -ForegroundColor Green
Write-Host "   Name: ceerion.com (or @)"
Write-Host "   Type: TXT"
Write-Host "   Value: v=spf1 mx -all"
Write-Host "   TTL: 3600"
Write-Host ""

Write-Host "4. DKIM RECORD:" -ForegroundColor Green
Write-Host "   Name: ceerion._domainkey.ceerion.com"
Write-Host "   Type: TXT"
Write-Host "   Value: v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu8VLMI9m8OMe/qGdt3xIhUx9RcwYGhpbhlNC8gFYf92fMhvq0aubCeo7/ACHElY5Ilbvkh0ybz0sTN4rBd51yXFdR+K4AzqzBuNXM8Z4E0xHhhpeTXO7xHfxYSPa1MDPvw0Nblan9QqVBLjz9sk6Xf9Jhg0vTGzfX+goaZmk1NyXIJky0E83+2DNE4qZtnkSR8tjCG5+y2tJdlDzPpijE476ztvUDc9Wunxmb0ibhTn1S/cQxBerNRxk8seeTbUD9UFXqP3tZXqsjw5ndJ5e5xRUcxcXcU1f77ni9DPdLE3kIj8LeXfPSUAc3isN5G/6KIafo5x7mum0bZednRgNvQIDAQAB"
Write-Host "   TTL: 3600"
Write-Host ""

Write-Host "5. DMARC RECORD:" -ForegroundColor Green
Write-Host "   Name: _dmarc.ceerion.com"
Write-Host "   Type: TXT"
Write-Host "   Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@ceerion.com; ruf=mailto:dmarc@ceerion.com; fo=1"
Write-Host "   TTL: 3600"
Write-Host ""

Write-Host "6. MTA-STS RECORD:" -ForegroundColor Green
Write-Host "   Name: _mta-sts.ceerion.com"
Write-Host "   Type: TXT"
Write-Host "   Value: v=STSv1; id=20250828"
Write-Host "   TTL: 3600"
Write-Host ""

Write-Host "7. TLS-RPT RECORD:" -ForegroundColor Green
Write-Host "   Name: _smtp._tls.ceerion.com"
Write-Host "   Type: TXT"
Write-Host "   Value: v=TLSRPTv1; rua=mailto:tlsrpt@ceerion.com"
Write-Host "   TTL: 3600"
Write-Host ""

Write-Host "8. PTR RECORD (Contact hosting provider):" -ForegroundColor Yellow
Write-Host "   IP: 209.126.9.62"
Write-Host "   Value: mail.ceerion.com"
Write-Host ""

Write-Host "=============================================="
Write-Host "VERIFICATION COMMANDS:" -ForegroundColor Cyan
Write-Host "=============================================="
Write-Host ""
Write-Host "nslookup -type=MX ceerion.com"
Write-Host "nslookup -type=A mail.ceerion.com"
Write-Host "nslookup -type=TXT ceerion.com"
Write-Host "nslookup -type=TXT ceerion._domainkey.ceerion.com"
Write-Host "nslookup -type=TXT _dmarc.ceerion.com"
Write-Host "nslookup -type=TXT _mta-sts.ceerion.com"
Write-Host "nslookup -type=TXT _smtp._tls.ceerion.com"
Write-Host ""

Write-Host "=============================================="
Write-Host "REQUIRED EMAIL ADDRESSES:" -ForegroundColor Magenta
Write-Host "=============================================="
Write-Host "- postmaster@ceerion.com"
Write-Host "- abuse@ceerion.com"
Write-Host "- dmarc@ceerion.com"
Write-Host "- tlsrpt@ceerion.com"
Write-Host ""

Write-Host "=============================================="
Write-Host "STATUS: READY FOR DNS PUBLICATION ✅" -ForegroundColor Green
Write-Host "=============================================="
