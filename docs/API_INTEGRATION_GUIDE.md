# OONRUMAIL Platform - API Integration Guide

Complete guide for integrating the OONRUMAIL Platform into your applications.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [Service URLs](#service-urls)
4. [Integration Examples](#integration-examples)
5. [SDKs & Libraries](#sdks--libraries)
6. [Webhooks](#webhooks)
7. [Rate Limits](#rate-limits)
8. [Error Handling](#error-handling)

---

## Quick Start

### 1. Generate API Keys

```bash
# Generate API key for transactional email
curl -X POST https://api.yourdomain.com/v1/api-keys \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production App",
    "scopes": ["email.send", "email.read"],
    "expires_at": "2026-12-31T23:59:59Z"
  }'

# Response:
{
  "id": "apk_1234567890abcdef",
  "key": "em_live_abc123xyz789...",
  "name": "Production App",
  "scopes": ["email.send", "email.read"],
  "created_at": "2026-02-03T10:00:00Z",
  "expires_at": "2026-12-31T23:59:59Z"
}
```

**⚠️ Important:** Store the API key securely. It's only shown once!

### 2. Test Your Connection

```bash
curl https://api.yourdomain.com/v1/health \
  -H "X-API-Key: em_live_abc123xyz789..."

# Response:
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-02-03T10:00:00Z"
}
```

---

## Authentication

The platform supports multiple authentication methods:

### API Key Authentication (Recommended for Server-to-Server)

```bash
# Header method (preferred)
curl -H "X-API-Key: em_live_abc123xyz789..." \
  https://api.yourdomain.com/v1/send

# Bearer token method
curl -H "Authorization: Bearer em_live_abc123xyz789..." \
  https://api.yourdomain.com/v1/send
```

### OAuth 2.0 (For User Applications)

```bash
# Step 1: Get authorization code
https://auth.yourdomain.com/oauth/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.com/callback
  &response_type=code
  &scope=email.read+email.send

# Step 2: Exchange code for token
curl -X POST https://auth.yourdomain.com/oauth/token \
  -d "grant_type=authorization_code" \
  -d "code=AUTH_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=https://yourapp.com/callback"

# Response:
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Session Authentication (For Web Apps)

```javascript
// Next.js middleware handles this automatically
// Set cookie after login:
document.cookie = `session_token=${token}; path=/; secure; samesite=strict`;
```

---

## Service URLs

| Service               | Production URL                   | Local Development       |
| --------------------- | -------------------------------- | ----------------------- |
| **Web App**           | `https://mail.yourdomain.com`    | `http://localhost:3000` |
| **Admin Portal**      | `https://admin.yourdomain.com`   | `http://localhost:3001` |
| **Transactional API** | `https://api.yourdomain.com`     | `http://localhost:8080` |
| **SMTP Server**       | `smtp.yourdomain.com:587`        | `localhost:2525`        |
| **IMAP Server**       | `imap.yourdomain.com:993`        | `localhost:1143`        |
| **SMS Gateway**       | `https://sms.yourdomain.com`     | `http://localhost:8081` |
| **Domain Manager**    | `https://domains.yourdomain.com` | `http://localhost:8082` |
| **Auth Service**      | `https://auth.yourdomain.com`    | `http://localhost:8083` |

---

## Integration Examples

### 1. Send Transactional Email

#### Node.js

```javascript
const axios = require("axios");

async function sendEmail(to, subject, html) {
  try {
    const response = await axios.post(
      "https://api.yourdomain.com/v1/send",
      {
        from: {
          email: "noreply@yourdomain.com",
          name: "Your App",
        },
        to: [
          {
            email: to,
            name: to.split("@")[0],
          },
        ],
        subject: subject,
        html_body: html,
        track_opens: true,
        track_clicks: true,
        tags: ["transactional"],
      },
      {
        headers: {
          "X-API-Key": process.env.EMAIL_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Email sent:", response.data.message_id);
    return response.data;
  } catch (error) {
    console.error("Failed to send email:", error.response?.data);
    throw error;
  }
}

// Usage
await sendEmail(
  "user@example.com",
  "Welcome to Our Platform!",
  "<h1>Welcome!</h1><p>Thanks for signing up.</p>"
);
```

#### Python

```python
import requests
import os

def send_email(to: str, subject: str, html: str):
    response = requests.post(
        'https://api.yourdomain.com/v1/send',
        json={
            'from': {
                'email': 'noreply@yourdomain.com',
                'name': 'Your App'
            },
            'to': [{
                'email': to,
                'name': to.split('@')[0]
            }],
            'subject': subject,
            'html_body': html,
            'track_opens': True,
            'track_clicks': True,
            'tags': ['transactional']
        },
        headers={
            'X-API-Key': os.getenv('EMAIL_API_KEY'),
            'Content-Type': 'application/json'
        }
    )

    response.raise_for_status()
    data = response.json()
    print(f"Email sent: {data['message_id']}")
    return data

# Usage
send_email(
    'user@example.com',
    'Welcome to Our Platform!',
    '<h1>Welcome!</h1><p>Thanks for signing up.</p>'
)
```

#### PHP

```php
<?php
function sendEmail($to, $subject, $html) {
    $apiKey = getenv('EMAIL_API_KEY');

    $data = [
        'from' => [
            'email' => 'noreply@yourdomain.com',
            'name' => 'Your App'
        ],
        'to' => [[
            'email' => $to,
            'name' => explode('@', $to)[0]
        ]],
        'subject' => $subject,
        'html_body' => $html,
        'track_opens' => true,
        'track_clicks' => true,
        'tags' => ['transactional']
    ];

    $ch = curl_init('https://api.yourdomain.com/v1/send');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'X-API-Key: ' . $apiKey,
        'Content-Type: application/json'
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        throw new Exception("Failed to send email: " . $response);
    }

    $result = json_decode($response, true);
    echo "Email sent: " . $result['message_id'] . "\n";
    return $result;
}

// Usage
sendEmail(
    'user@example.com',
    'Welcome to Our Platform!',
    '<h1>Welcome!</h1><p>Thanks for signing up.</p>'
);
?>
```

#### Go

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "os"
)

type EmailRequest struct {
    From       EmailAddress   `json:"from"`
    To         []EmailAddress `json:"to"`
    Subject    string         `json:"subject"`
    HTMLBody   string         `json:"html_body"`
    TrackOpens bool           `json:"track_opens"`
    TrackClicks bool          `json:"track_clicks"`
    Tags       []string       `json:"tags"`
}

type EmailAddress struct {
    Email string `json:"email"`
    Name  string `json:"name"`
}

type EmailResponse struct {
    MessageID string `json:"message_id"`
    Status    string `json:"status"`
}

func sendEmail(to, subject, html string) (*EmailResponse, error) {
    apiKey := os.Getenv("EMAIL_API_KEY")

    req := EmailRequest{
        From: EmailAddress{
            Email: "noreply@yourdomain.com",
            Name:  "Your App",
        },
        To: []EmailAddress{{
            Email: to,
            Name:  to[:strings.Index(to, "@")],
        }},
        Subject:     subject,
        HTMLBody:    html,
        TrackOpens:  true,
        TrackClicks: true,
        Tags:        []string{"transactional"},
    }

    body, _ := json.Marshal(req)

    httpReq, _ := http.NewRequest("POST",
        "https://api.yourdomain.com/v1/send",
        bytes.NewBuffer(body))
    httpReq.Header.Set("X-API-Key", apiKey)
    httpReq.Header.Set("Content-Type", "application/json")

    client := &http.Client{}
    resp, err := client.Do(httpReq)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    respBody, _ := io.ReadAll(resp.Body)

    var result EmailResponse
    json.Unmarshal(respBody, &result)

    fmt.Printf("Email sent: %s\n", result.MessageID)
    return &result, nil
}

// Usage
func main() {
    sendEmail(
        "user@example.com",
        "Welcome to Our Platform!",
        "<h1>Welcome!</h1><p>Thanks for signing up.</p>",
    )
}
```

### 2. Send Email with Template

```javascript
// Node.js
async function sendTemplateEmail(to, templateId, data) {
  const response = await axios.post(
    "https://api.yourdomain.com/v1/send/template",
    {
      from: { email: "noreply@yourdomain.com", name: "Your App" },
      to: [{ email: to }],
      template_id: templateId,
      template_data: data,
      tags: ["template", "automated"],
    },
    {
      headers: {
        "X-API-Key": process.env.EMAIL_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

// Usage
await sendTemplateEmail("user@example.com", "welcome_template", {
  username: "John",
  activation_link: "https://yourapp.com/activate?token=abc123",
  support_email: "support@yourdomain.com",
});
```

### 3. Batch Send

```javascript
// Node.js - Send up to 1000 emails at once
async function sendBatch(recipients) {
  const messages = recipients.map((recipient) => ({
    from: { email: "noreply@yourdomain.com", name: "Your App" },
    to: [{ email: recipient.email, name: recipient.name }],
    subject: `Hello ${recipient.name}!`,
    html_body: `<h1>Hi ${recipient.name}</h1><p>This is your personalized message.</p>`,
    template_data: recipient.data,
  }));

  const response = await axios.post(
    "https://api.yourdomain.com/v1/send/batch",
    { messages },
    {
      headers: {
        "X-API-Key": process.env.EMAIL_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  console.log(`Batch sent: ${response.data.accepted} accepted, ${response.data.rejected} rejected`);
  return response.data;
}

// Usage
await sendBatch([
  { email: "user1@example.com", name: "Alice", data: { plan: "Pro" } },
  { email: "user2@example.com", name: "Bob", data: { plan: "Enterprise" } },
  // ... up to 1000 recipients
]);
```

### 4. Send SMS (2FA/OTP)

```javascript
// Node.js
async function sendSMS(phoneNumber, message) {
  const response = await axios.post(
    "https://sms.yourdomain.com/api/sms/send",
    {
      to: phoneNumber,
      message: message,
      from: "YourApp", // Sender ID (max 11 chars)
      priority: "high",
    },
    {
      headers: {
        "X-API-Key": process.env.SMS_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

// Send OTP
async function sendOTP(phoneNumber) {
  const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

  await sendSMS(phoneNumber, `Your verification code is: ${otp}. Valid for 5 minutes.`);

  return otp;
}

// Usage
const otp = await sendOTP("+1234567890");
// Store OTP in Redis/DB with expiration
```

### 5. SMTP Integration (Traditional Email Clients)

```javascript
// Node.js with nodemailer
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.yourdomain.com",
  port: 587,
  secure: false, // Use STARTTLS
  auth: {
    user: "your-email@yourdomain.com",
    pass: "your-app-password",
  },
});

async function sendViaSTMP(to, subject, html) {
  const info = await transporter.sendMail({
    from: '"Your App" <noreply@yourdomain.com>',
    to: to,
    subject: subject,
    html: html,
  });

  console.log("Message sent: %s", info.messageId);
  return info;
}

// Usage
await sendViaSTMP("user@example.com", "Welcome!", "<h1>Welcome to our platform</h1>");
```

### 6. Check Email Delivery Status

```javascript
// Node.js
async function getEmailStatus(messageId) {
  const response = await axios.get(`https://api.yourdomain.com/v1/messages/${messageId}`, {
    headers: {
      "X-API-Key": process.env.EMAIL_API_KEY,
    },
  });

  console.log("Status:", response.data.status);
  // Status can be: queued, sent, delivered, bounced, failed, opened, clicked

  return response.data;
}

// Usage
const status = await getEmailStatus("msg_abc123xyz");
```

---

## SDKs & Libraries

### Official SDKs

```bash
# Node.js/TypeScript
npm install @enterpriseemail/sdk

# Python
pip install enterpriseemail

# PHP
composer require enterpriseemail/sdk

# Go
go get github.com/enterpriseemail/go-sdk

# Ruby
gem install enterpriseemail

# Java
# Add to pom.xml
<dependency>
  <groupId>com.enterpriseemail</groupId>
  <artifactId>enterpriseemail-sdk</artifactId>
  <version>1.0.0</version>
</dependency>
```

### SDK Usage Example

```javascript
// Node.js SDK
const EnterpriseEmail = require("@enterpriseemail/sdk");

const client = new EnterpriseEmail({
  apiKey: process.env.EMAIL_API_KEY,
  baseURL: "https://api.yourdomain.com",
});

// Send email
await client.send({
  from: "noreply@yourdomain.com",
  to: "user@example.com",
  subject: "Welcome!",
  html: "<h1>Welcome to our platform</h1>",
  trackOpens: true,
  trackClicks: true,
});

// Send with template
await client.sendTemplate({
  templateId: "welcome",
  to: "user@example.com",
  data: { username: "John", activationLink: "https://..." },
});

// Get message status
const status = await client.getMessageStatus("msg_abc123");

// List templates
const templates = await client.templates.list();

// Create template
await client.templates.create({
  name: "password-reset",
  subject: "Reset Your Password",
  html: "<h1>Reset Password</h1><p>Click: {{reset_link}}</p>",
});
```

---

## Webhooks

Configure webhooks to receive real-time notifications about email events.

### Webhook Setup

```bash
curl -X POST https://api.yourdomain.com/v1/webhooks \
  -H "X-API-Key: em_live_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourapp.com/webhooks/email",
    "events": ["delivered", "bounced", "opened", "clicked", "unsubscribed"],
    "secret": "whsec_randomly_generated_secret"
  }'
```

### Webhook Payload Examples

**Email Delivered:**

```json
{
  "event": "delivered",
  "timestamp": "2026-02-03T10:30:00Z",
  "message_id": "msg_abc123xyz",
  "email": "user@example.com",
  "smtp_response": "250 2.0.0 OK",
  "metadata": {
    "campaign_id": "campaign_123",
    "user_id": "user_456"
  }
}
```

**Email Bounced:**

```json
{
  "event": "bounced",
  "timestamp": "2026-02-03T10:30:00Z",
  "message_id": "msg_abc123xyz",
  "email": "invalid@example.com",
  "bounce_type": "hard",
  "reason": "550 5.1.1 User unknown",
  "smtp_code": 550
}
```

**Email Opened:**

```json
{
  "event": "opened",
  "timestamp": "2026-02-03T10:35:00Z",
  "message_id": "msg_abc123xyz",
  "email": "user@example.com",
  "user_agent": "Mozilla/5.0...",
  "ip_address": "192.168.1.100"
}
```

### Webhook Handler Example

```javascript
// Node.js Express
const express = require("express");
const crypto = require("crypto");

app.post("/webhooks/email", express.json(), (req, res) => {
  // Verify webhook signature
  const signature = req.headers["x-webhook-signature"];
  const expectedSignature = crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { event, message_id, email } = req.body;

  switch (event) {
    case "delivered":
      console.log(`Email ${message_id} delivered to ${email}`);
      // Update database
      break;

    case "bounced":
      console.log(`Email ${message_id} bounced for ${email}`);
      // Mark email as invalid
      break;

    case "opened":
      console.log(`Email ${message_id} opened by ${email}`);
      // Track engagement
      break;

    case "clicked":
      console.log(`Link clicked in ${message_id} by ${email}`);
      // Track conversion
      break;
  }

  res.status(200).json({ received: true });
});
```

---

## Rate Limits

| Endpoint Type       | Rate Limit | Burst |
| ------------------- | ---------- | ----- |
| Authentication      | 5/minute   | 10    |
| Email Send          | 100/minute | 200   |
| Batch Send          | 10/minute  | 20    |
| API Read Operations | 300/minute | 500   |
| SMS Send            | 50/minute  | 100   |
| Webhooks            | Unlimited  | -     |

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1675425600
Retry-After: 60
```

### Handle Rate Limits

```javascript
async function sendWithRetry(emailData, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sendEmail(emailData);
    } catch (error) {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers["retry-after"] || 60;
        console.log(`Rate limited. Retrying after ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}
```

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "INVALID_RECIPIENT",
    "message": "Invalid email address format",
    "details": {
      "field": "to[0].email",
      "value": "invalid-email"
    }
  },
  "request_id": "req_abc123xyz",
  "timestamp": "2026-02-03T10:00:00Z"
}
```

### Common Error Codes

| Code                       | HTTP Status | Description                  |
| -------------------------- | ----------- | ---------------------------- |
| `AUTHENTICATION_REQUIRED`  | 401         | Missing or invalid API key   |
| `INSUFFICIENT_PERMISSIONS` | 403         | API key lacks required scope |
| `RATE_LIMIT_EXCEEDED`      | 429         | Too many requests            |
| `INVALID_REQUEST`          | 400         | Malformed request body       |
| `INVALID_RECIPIENT`        | 400         | Invalid email address        |
| `TEMPLATE_NOT_FOUND`       | 404         | Template doesn't exist       |
| `SEND_FAILED`              | 500         | Failed to send email         |
| `SERVICE_UNAVAILABLE`      | 503         | Temporary service issue      |

### Error Handling Best Practices

```javascript
async function robustSendEmail(emailData) {
  try {
    const response = await axios.post("https://api.yourdomain.com/v1/send", emailData, {
      headers: { "X-API-Key": process.env.EMAIL_API_KEY },
    });

    return { success: true, data: response.data };
  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data?.error;

    // Handle specific errors
    switch (status) {
      case 401:
        console.error("Invalid API key");
        // Notify admin
        break;

      case 429:
        // Rate limited - retry with backoff
        const retryAfter = error.response.headers["retry-after"];
        console.log(`Rate limited. Retry after ${retryAfter}s`);
        return { success: false, retryAfter };

      case 400:
        // Bad request - fix data
        console.error("Invalid request:", errorData.message);
        return { success: false, error: errorData };

      case 500:
      case 503:
        // Server error - retry later
        console.error("Server error - will retry");
        return { success: false, retryable: true };

      default:
        console.error("Unexpected error:", error.message);
        return { success: false, error: error.message };
    }
  }
}
```

---

## Environment Variables

Store these securely (never commit to git):

```bash
# .env file
EMAIL_API_KEY=em_live_abc123xyz789...
SMS_API_KEY=sms_live_def456uvw012...
WEBHOOK_SECRET=whsec_randomly_generated...
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=your-email@yourdomain.com
SMTP_PASS=your-app-password
```

---

## Next Steps

1. **Generate your API keys** from the admin dashboard
2. **Test the integration** in development environment
3. **Set up webhooks** for event notifications
4. **Configure monitoring** for API usage and errors
5. **Review rate limits** and request increases if needed

## Support

- 📧 Email: support@yourdomain.com
- Documentation: https://docs.yourdomain.com
- 🐛 Issues: https://github.com/artpromedia/email/issues

---

**Last Updated:** February 3, 2026
