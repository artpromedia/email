# API Key Management Guide

Complete guide for creating, managing, and securing API keys for the OONRUMAIL Platform.

## Table of Contents

1. [Creating API Keys](#creating-api-keys)
2. [Key Scopes & Permissions](#key-scopes--permissions)
3. [Security Best Practices](#security-best-practices)
4. [Key Rotation](#key-rotation)
5. [Monitoring & Auditing](#monitoring--auditing)
6. [Troubleshooting](#troubleshooting)

---

## Creating API Keys

### Via Admin Dashboard

1. **Login to Admin Portal**

   ```
   https://admin.yourdomain.com
   ```

2. **Navigate to API Keys**
   - Go to Settings → API Keys
   - Click "Create New API Key"

3. **Configure Key Settings**

   ```
   Name: Production App
   Environment: Production
   Scopes: email.send, email.read
   Expires: 2026-12-31
   Rate Limit: 100 req/min (optional)
   IP Whitelist: 203.0.113.0/24 (optional)
   ```

4. **Save and Copy Key**
   ```
   API Key: em_live_abc123xyz789...
   ```
   ⚠️ **Important:** Copy the key immediately - it won't be shown again!

### Via API (Programmatic)

```bash
curl -X POST https://api.yourdomain.com/v1/api-keys \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production App",
    "scopes": ["email.send", "email.read", "templates.read"],
    "expires_at": "2026-12-31T23:59:59Z",
    "rate_limit": 100,
    "ip_whitelist": ["203.0.113.0/24"]
  }'
```

**Response:**

```json
{
  "id": "apk_1234567890abcdef",
  "key": "em_live_abc123xyz789...",
  "name": "Production App",
  "scopes": ["email.send", "email.read", "templates.read"],
  "created_at": "2026-02-03T10:00:00Z",
  "expires_at": "2026-12-31T23:59:59Z",
  "rate_limit": 100,
  "ip_whitelist": ["203.0.113.0/24"],
  "last_used": null
}
```

### Key Prefixes

| Prefix      | Environment | Description                           |
| ----------- | ----------- | ------------------------------------- |
| `em_test_`  | Development | Test keys with limited features       |
| `em_live_`  | Production  | Production keys with full access      |
| `sms_test_` | Development | SMS test keys (doesn't send real SMS) |
| `sms_live_` | Production  | SMS production keys                   |

---

## Key Scopes & Permissions

### Email Scopes

| Scope                | Permissions             | Use Case                   |
| -------------------- | ----------------------- | -------------------------- |
| `email.send`         | Send emails via API     | Transactional emails       |
| `email.send:batch`   | Send batch emails       | Newsletter, bulk campaigns |
| `email.read`         | Read email metadata     | Check delivery status      |
| `email.read:content` | Read full email content | Email archiving            |
| `email.delete`       | Delete emails           | Data retention policies    |
| `email.*`            | All email permissions   | Admin access               |

### Template Scopes

| Scope              | Permissions              | Use Case            |
| ------------------ | ------------------------ | ------------------- |
| `templates.read`   | List and view templates  | Template selection  |
| `templates.write`  | Create/update templates  | Template management |
| `templates.delete` | Delete templates         | Template cleanup    |
| `templates.*`      | All template permissions | Admin access        |

### Analytics Scopes

| Scope              | Permissions           | Use Case            |
| ------------------ | --------------------- | ------------------- |
| `analytics.read`   | View analytics        | Dashboards, reports |
| `analytics.export` | Export analytics data | Data analysis       |

### Domain Scopes

| Scope            | Permissions             | Use Case            |
| ---------------- | ----------------------- | ------------------- |
| `domains.read`   | List domains            | Domain verification |
| `domains.write`  | Add/update domains      | Domain management   |
| `domains.verify` | Verify domain ownership | DNS setup           |
| `domains.*`      | All domain permissions  | Admin access        |

### SMS Scopes

| Scope      | Permissions         | Use Case          |
| ---------- | ------------------- | ----------------- |
| `sms.send` | Send SMS messages   | 2FA, OTP          |
| `sms.read` | View SMS status     | Delivery tracking |
| `sms.*`    | All SMS permissions | Admin access      |

### Example Scope Combinations

**Transactional Email App:**

```json
{
  "scopes": ["email.send", "email.read", "templates.read"]
}
```

**Marketing Platform:**

```json
{
  "scopes": ["email.send:batch", "templates.*", "analytics.read"]
}
```

**Admin Dashboard:**

```json
{
  "scopes": ["email.*", "templates.*", "domains.*", "analytics.*"]
}
```

**2FA Service:**

```json
{
  "scopes": ["sms.send", "sms.read"]
}
```

---

## Security Best Practices

### 1. Store Keys Securely

❌ **Never Do This:**

```javascript
// Hardcoded in source code
const apiKey = 'em_live_abc123xyz789...';

// Committed to git
git add .env
```

✅ **Always Do This:**

```javascript
// Use environment variables
const apiKey = process.env.EMAIL_API_KEY;

// Add to .gitignore
echo ".env" >> .gitignore
```

### 2. Use Environment-Specific Keys

```bash
# Development (.env.development)
EMAIL_API_KEY=em_test_dev123...

# Staging (.env.staging)
EMAIL_API_KEY=em_test_staging456...

# Production (.env.production)
EMAIL_API_KEY=em_live_prod789...
```

### 3. Implement Key Vault (Recommended)

**AWS Secrets Manager:**

```javascript
const AWS = require("aws-sdk");
const secretsManager = new AWS.SecretsManager();

async function getApiKey() {
  const data = await secretsManager
    .getSecretValue({
      SecretId: "prod/email/api-key",
    })
    .promise();

  return JSON.parse(data.SecretString).apiKey;
}
```

**Azure Key Vault:**

```javascript
const { SecretClient } = require("@azure/keyvault-secrets");

const client = new SecretClient(vaultUrl, credential);
const secret = await client.getSecret("email-api-key");
const apiKey = secret.value;
```

**HashiCorp Vault:**

```javascript
const vault = require("node-vault")({
  endpoint: "http://vault.yourdomain.com:8200",
  token: process.env.VAULT_TOKEN,
});

const result = await vault.read("secret/data/email-api-key");
const apiKey = result.data.data.key;
```

### 4. IP Whitelisting

Restrict API key usage to specific IP addresses:

```bash
curl -X PATCH https://api.yourdomain.com/v1/api-keys/apk_123 \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "ip_whitelist": [
      "203.0.113.10",
      "203.0.113.0/24",
      "2001:db8::/32"
    ]
  }'
```

### 5. Rate Limiting per Key

```bash
curl -X PATCH https://api.yourdomain.com/v1/api-keys/apk_123 \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "rate_limit": 50,
    "rate_limit_window": "1m"
  }'
```

### 6. Expiration Dates

Always set expiration dates:

```javascript
// Good: 90-day expiration
{
  "expires_at": "2026-05-03T23:59:59Z"  // 90 days from now
}

// Better: 30-day expiration for high-privilege keys
{
  "expires_at": "2026-03-05T23:59:59Z"  // 30 days from now
}
```

### 7. Minimal Scopes

Only grant necessary permissions:

```javascript
// ❌ Too broad
{
  "scopes": ["email.*", "templates.*", "domains.*"]
}

// ✅ Minimal required
{
  "scopes": ["email.send", "templates.read"]
}
```

---

## Key Rotation

### Automatic Rotation (Recommended)

Set up automatic key rotation every 90 days:

```javascript
// rotation-script.js
const axios = require("axios");

async function rotateApiKey(currentKeyId) {
  // 1. Create new key with same permissions
  const response = await axios.post(
    "https://api.yourdomain.com/v1/api-keys",
    {
      name: "Production App (Rotated)",
      scopes: ["email.send", "email.read"],
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
    }
  );

  const newKey = response.data.key;

  // 2. Update key in secrets manager
  await updateSecretInVault("email-api-key", newKey);

  // 3. Wait for deployment to pick up new key (grace period)
  await sleep(24 * 60 * 60 * 1000); // 24 hours

  // 4. Revoke old key
  await axios.delete(`https://api.yourdomain.com/v1/api-keys/${currentKeyId}`, {
    headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
  });

  console.log("Key rotation complete");
  return newKey;
}

// Run monthly
setInterval(() => rotateApiKey("apk_current"), 30 * 24 * 60 * 60 * 1000);
```

### Manual Rotation Steps

1. **Generate New Key**

   ```bash
   curl -X POST https://api.yourdomain.com/v1/api-keys \
     -H "Authorization: Bearer <admin-token>" \
     -d '{"name": "Production App (Rotated)", "scopes": [...]}'
   ```

2. **Update Environment Variables**

   ```bash
   # In AWS/Azure/GCP console
   EMAIL_API_KEY=em_live_NEW_KEY...
   ```

3. **Deploy Application**

   ```bash
   # Trigger deployment with new key
   kubectl rollout restart deployment/app
   ```

4. **Verify New Key Works**

   ```bash
   curl https://api.yourdomain.com/v1/health \
     -H "X-API-Key: em_live_NEW_KEY..."
   ```

5. **Revoke Old Key** (after 24-48 hours)
   ```bash
   curl -X DELETE https://api.yourdomain.com/v1/api-keys/apk_OLD \
     -H "Authorization: Bearer <admin-token>"
   ```

### Emergency Rotation (Compromised Key)

If a key is compromised, rotate immediately:

```bash
# 1. Revoke compromised key immediately
curl -X DELETE https://api.yourdomain.com/v1/api-keys/apk_compromised \
  -H "Authorization: Bearer <admin-token>"

# 2. Create new key
curl -X POST https://api.yourdomain.com/v1/api-keys \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "name": "Emergency Rotation",
    "scopes": ["email.send", "email.read"],
    "ip_whitelist": ["YOUR_IP_ONLY"]
  }'

# 3. Update immediately
export EMAIL_API_KEY=em_live_NEW_KEY...

# 4. Review access logs
curl https://api.yourdomain.com/v1/api-keys/apk_compromised/logs \
  -H "Authorization: Bearer <admin-token>"
```

---

## Monitoring & Auditing

### View Key Usage

```bash
# Get key details
curl https://api.yourdomain.com/v1/api-keys/apk_123 \
  -H "Authorization: Bearer <admin-token>"
```

**Response:**

```json
{
  "id": "apk_123",
  "name": "Production App",
  "scopes": ["email.send", "email.read"],
  "created_at": "2026-01-01T00:00:00Z",
  "last_used": "2026-02-03T10:30:00Z",
  "usage_stats": {
    "total_requests": 15432,
    "requests_last_24h": 1234,
    "requests_last_7d": 8765,
    "last_ip": "203.0.113.10"
  },
  "status": "active"
}
```

### Access Logs

```bash
# View access logs for specific key
curl https://api.yourdomain.com/v1/api-keys/apk_123/logs?limit=100 \
  -H "Authorization: Bearer <admin-token>"
```

**Response:**

```json
{
  "logs": [
    {
      "timestamp": "2026-02-03T10:30:00Z",
      "endpoint": "/v1/send",
      "method": "POST",
      "status": 200,
      "ip": "203.0.113.10",
      "user_agent": "node-axios/1.6.0",
      "response_time_ms": 145
    }
  ]
}
```

### Set Up Alerts

**Email Alert for Unusual Activity:**

```bash
curl -X POST https://api.yourdomain.com/v1/alerts \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "name": "API Key Unusual Activity",
    "conditions": {
      "rate_limit_exceeded": true,
      "new_ip_address": true,
      "failed_auth_attempts_gt": 10
    },
    "actions": {
      "email": "security@yourdomain.com",
      "slack": "https://hooks.slack.com/..."
    }
  }'
```

### Monitoring Dashboard

View real-time API key metrics at:

```
https://admin.yourdomain.com/monitoring/api-keys
```

Metrics include:

- Requests per minute
- Error rates
- P50/P95/P99 latency
- Geographic distribution
- Scope usage breakdown

---

## Troubleshooting

### Common Issues

#### 1. "Invalid API Key" (401)

**Causes:**

- Key was revoked
- Key expired
- Wrong key prefix (test vs live)
- Typo in key

**Fix:**

```bash
# Check key status
curl https://api.yourdomain.com/v1/api-keys/apk_123/status \
  -H "Authorization: Bearer <admin-token>"

# Generate new key if needed
```

#### 2. "Insufficient Permissions" (403)

**Cause:** Key lacks required scope

**Fix:**

```bash
# Check current scopes
curl https://api.yourdomain.com/v1/api-keys/apk_123 \
  -H "Authorization: Bearer <admin-token>"

# Add missing scope
curl -X PATCH https://api.yourdomain.com/v1/api-keys/apk_123 \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"scopes": ["email.send", "email.read", "templates.read"]}'
```

#### 3. "Rate Limit Exceeded" (429)

**Cause:** Exceeded requests per minute

**Fix:**

```bash
# Request rate limit increase
curl -X PATCH https://api.yourdomain.com/v1/api-keys/apk_123 \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"rate_limit": 200}'

# Or implement exponential backoff in code
```

#### 4. "IP Not Whitelisted" (403)

**Cause:** Request from unauthorized IP

**Fix:**

```bash
# Add IP to whitelist
curl -X PATCH https://api.yourdomain.com/v1/api-keys/apk_123 \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "ip_whitelist": ["203.0.113.10", "203.0.113.20"]
  }'
```

### Debug Mode

Enable debug logging:

```javascript
const client = new EnterpriseEmail({
  apiKey: process.env.EMAIL_API_KEY,
  debug: true  // Logs all requests/responses
});

// Or with curl
curl -v https://api.yourdomain.com/v1/send \
  -H "X-API-Key: em_live_..." \
  -d '...'
```

### Test Key Validity

```bash
# Quick health check
curl https://api.yourdomain.com/v1/health \
  -H "X-API-Key: em_live_..."

# Expected response:
{
  "status": "healthy",
  "key_valid": true,
  "scopes": ["email.send", "email.read"]
}
```

---

## API Key Lifecycle

```
┌─────────────┐
│   Created   │  API key generated
└──────┬──────┘
       │
       v
┌─────────────┐
│   Active    │  Key in use, monitored
└──────┬──────┘
       │
       v
┌─────────────┐
│  Expiring   │  < 7 days until expiration
└──────┬──────┘  (alert sent)
       │
       v
┌─────────────┐
│  Expired    │  Key no longer valid
└──────┬──────┘  (can be renewed)
       │
       v
┌─────────────┐
│  Revoked    │  Permanently disabled
└─────────────┘
```

---

## Quick Reference

### Create Key

```bash
POST /v1/api-keys
```

### List Keys

```bash
GET /v1/api-keys
```

### Get Key Details

```bash
GET /v1/api-keys/:id
```

### Update Key

```bash
PATCH /v1/api-keys/:id
```

### Revoke Key

```bash
DELETE /v1/api-keys/:id
```

### View Logs

```bash
GET /v1/api-keys/:id/logs
```

---

**Last Updated:** February 3, 2026
