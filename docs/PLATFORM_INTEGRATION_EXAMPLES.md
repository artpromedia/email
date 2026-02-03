# Platform Integration Examples

Real-world integration examples for common platforms and frameworks.

## Table of Contents

1. [Next.js / React](#nextjs--react)
2. [Express.js / Node.js Backend](#expressjs--nodejs-backend)
3. [Django / Python](#django--python)
4. [Laravel / PHP](#laravel--php)
5. [Ruby on Rails](#ruby-on-rails)
6. [ASP.NET Core / C#](#aspnet-core--c)
7. [Mobile Apps](#mobile-apps)
8. [WordPress Plugin](#wordpress-plugin)
9. [Shopify App](#shopify-app)
10. [Zapier Integration](#zapier-integration)

---

## Next.js / React

### 1. API Route Handler

```typescript
// app/api/send-email/route.ts
import { NextRequest, NextResponse } from "next/server";

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
}

export async function POST(request: NextRequest) {
  try {
    const { to, subject, html }: EmailRequest = await request.json();

    const response = await fetch("https://api.yourdomain.com/v1/send", {
      method: "POST",
      headers: {
        "X-API-Key": process.env.EMAIL_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: {
          email: "noreply@yourapp.com",
          name: "Your App",
        },
        to: [{ email: to }],
        subject,
        html_body: html,
        track_opens: true,
        track_clicks: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json({ error: error.message }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ success: true, messageId: data.message_id });
  } catch (error) {
    console.error("Email send error:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
```

### 2. Server Action (App Router)

```typescript
// app/actions/email.ts
"use server";

import { revalidatePath } from "next/cache";

export async function sendWelcomeEmail(email: string, name: string) {
  try {
    const response = await fetch("https://api.yourdomain.com/v1/send/template", {
      method: "POST",
      headers: {
        "X-API-Key": process.env.EMAIL_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: "noreply@yourapp.com", name: "Your App" },
        to: [{ email, name }],
        template_id: "welcome",
        template_data: {
          name,
          app_url: "https://yourapp.com",
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to send email");
    }

    const data = await response.json();
    revalidatePath("/dashboard");

    return { success: true, messageId: data.message_id };
  } catch (error) {
    return { success: false, error: "Failed to send welcome email" };
  }
}
```

### 3. Client Component with Form

```typescript
// app/contact/page.tsx
'use client';

import { useState } from 'react';

export default function ContactPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const subject = formData.get('subject') as string;
    const messageText = formData.get('message') as string;

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'support@yourapp.com',
          subject: `Contact Form: ${subject}`,
          html: `
            <h2>New Contact Form Submission</h2>
            <p><strong>From:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong></p>
            <p>${messageText}</p>
          `,
        }),
      });

      if (response.ok) {
        setMessage('Message sent successfully!');
        e.currentTarget.reset();
      } else {
        setMessage('Failed to send message. Please try again.');
      }
    } catch (error) {
      setMessage('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Contact Us</h1>

      <div className="mb-4">
        <label htmlFor="email" className="block mb-2">Email</label>
        <input
          type="email"
          id="email"
          name="email"
          required
          className="w-full px-3 py-2 border rounded"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="subject" className="block mb-2">Subject</label>
        <input
          type="text"
          id="subject"
          name="subject"
          required
          className="w-full px-3 py-2 border rounded"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="message" className="block mb-2">Message</label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          className="w-full px-3 py-2 border rounded"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Sending...' : 'Send Message'}
      </button>

      {message && (
        <p className="mt-4 text-center">{message}</p>
      )}
    </form>
  );
}
```

### 4. Email Service Utility

```typescript
// lib/email.ts
interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: { email: string; name: string };
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}

export class EmailService {
  private apiKey: string;
  private baseURL: string;

  constructor() {
    this.apiKey = process.env.EMAIL_API_KEY!;
    this.baseURL = "https://api.yourdomain.com";
  }

  async send(options: SendEmailOptions) {
    const recipients = Array.isArray(options.to)
      ? options.to.map((email) => ({ email }))
      : [{ email: options.to }];

    const response = await fetch(`${this.baseURL}/v1/send`, {
      method: "POST",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: options.from || {
          email: "noreply@yourapp.com",
          name: "Your App",
        },
        to: recipients,
        subject: options.subject,
        html_body: options.html,
        reply_to: options.replyTo,
        attachments: options.attachments,
        track_opens: true,
        track_clicks: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Email send failed: ${error.message}`);
    }

    return response.json();
  }

  async sendTemplate(to: string, templateId: string, data: Record<string, any>) {
    const response = await fetch(`${this.baseURL}/v1/send/template`, {
      method: "POST",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: "noreply@yourapp.com", name: "Your App" },
        to: [{ email: to }],
        template_id: templateId,
        template_data: data,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Template send failed: ${error.message}`);
    }

    return response.json();
  }
}

// Usage in API route or server action
const emailService = new EmailService();
await emailService.send({
  to: "user@example.com",
  subject: "Welcome!",
  html: "<h1>Welcome to our app!</h1>",
});
```

---

## Express.js / Node.js Backend

### 1. Email Service Module

```javascript
// services/emailService.js
const axios = require("axios");

class EmailService {
  constructor() {
    this.client = axios.create({
      baseURL: "https://api.yourdomain.com",
      headers: {
        "X-API-Key": process.env.EMAIL_API_KEY,
        "Content-Type": "application/json",
      },
    });
  }

  async send({ to, subject, html, from = null }) {
    try {
      const response = await this.client.post("/v1/send", {
        from: from || {
          email: "noreply@yourapp.com",
          name: "Your App",
        },
        to: Array.isArray(to) ? to.map((email) => ({ email })) : [{ email: to }],
        subject,
        html_body: html,
        track_opens: true,
        track_clicks: true,
      });

      return response.data;
    } catch (error) {
      console.error("Email send error:", error.response?.data);
      throw new Error("Failed to send email");
    }
  }

  async sendTemplate(to, templateId, data) {
    try {
      const response = await this.client.post("/v1/send/template", {
        from: { email: "noreply@yourapp.com", name: "Your App" },
        to: [{ email: to }],
        template_id: templateId,
        template_data: data,
      });

      return response.data;
    } catch (error) {
      console.error("Template send error:", error.response?.data);
      throw new Error("Failed to send template email");
    }
  }

  async getStatus(messageId) {
    try {
      const response = await this.client.get(`/v1/messages/${messageId}`);
      return response.data;
    } catch (error) {
      console.error("Status check error:", error.response?.data);
      throw new Error("Failed to get message status");
    }
  }
}

module.exports = new EmailService();
```

### 2. User Registration Flow

```javascript
// routes/auth.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const emailService = require("../services/emailService");
const User = require("../models/User");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
      name,
      verificationToken: jwt.sign({ email }, process.env.JWT_SECRET),
    });

    // Send welcome email
    await emailService.sendTemplate(email, "welcome", {
      name,
      verification_link: `https://yourapp.com/verify?token=${user.verificationToken}`,
    });

    res.status(201).json({
      message: "Registration successful. Please check your email.",
      userId: user._id,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

module.exports = router;
```

### 3. Webhook Handler

```javascript
// routes/webhooks.js
const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const Email = require("../models/Email");

const router = express.Router();

// Verify webhook signature
function verifySignature(req, res, next) {
  const signature = req.headers["x-webhook-signature"];
  const expectedSignature = crypto
    .createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  next();
}

router.post("/email-events", express.json(), verifySignature, async (req, res) => {
  const { event, message_id, email, timestamp } = req.body;

  try {
    // Update email status in database
    await Email.updateOne(
      { messageId: message_id },
      {
        $set: { status: event },
        $push: {
          events: {
            type: event,
            timestamp: new Date(timestamp),
            metadata: req.body,
          },
        },
      }
    );

    // Handle specific events
    switch (event) {
      case "bounced":
        // Mark email as invalid
        await User.updateOne({ email }, { $set: { emailValid: false } });
        console.log(`Email bounced: ${email}`);
        break;

      case "unsubscribed":
        // Update user preferences
        await User.updateOne({ email }, { $set: { marketingEmails: false } });
        console.log(`User unsubscribed: ${email}`);
        break;

      case "opened":
        // Track engagement
        await User.updateOne({ email }, { $inc: { emailOpens: 1 } });
        break;
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({ error: "Processing failed" });
  }
});

module.exports = router;
```

---

## Django / Python

### 1. Email Service Module

```python
# services/email_service.py
import os
import requests
from typing import List, Dict, Optional

class EmailService:
    def __init__(self):
        self.api_key = os.getenv('EMAIL_API_KEY')
        self.base_url = 'https://api.yourdomain.com'
        self.headers = {
            'X-API-Key': self.api_key,
            'Content-Type': 'application/json'
        }

    def send(
        self,
        to: str,
        subject: str,
        html: str,
        from_email: Optional[str] = None,
        from_name: Optional[str] = None
    ) -> Dict:
        """Send a single email"""
        payload = {
            'from': {
                'email': from_email or 'noreply@yourapp.com',
                'name': from_name or 'Your App'
            },
            'to': [{'email': to}],
            'subject': subject,
            'html_body': html,
            'track_opens': True,
            'track_clicks': True
        }

        response = requests.post(
            f'{self.base_url}/v1/send',
            json=payload,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

    def send_template(
        self,
        to: str,
        template_id: str,
        template_data: Dict
    ) -> Dict:
        """Send email using template"""
        payload = {
            'from': {
                'email': 'noreply@yourapp.com',
                'name': 'Your App'
            },
            'to': [{'email': to}],
            'template_id': template_id,
            'template_data': template_data
        }

        response = requests.post(
            f'{self.base_url}/v1/send/template',
            json=payload,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

    def send_batch(self, messages: List[Dict]) -> Dict:
        """Send multiple emails at once"""
        payload = {'messages': messages}

        response = requests.post(
            f'{self.base_url}/v1/send/batch',
            json=payload,
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

email_service = EmailService()
```

### 2. User Registration View

```python
# views/auth_views.py
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from services.email_service import email_service
import jwt
import os

User = get_user_model()

@api_view(['POST'])
def register(request):
    """User registration endpoint"""
    email = request.data.get('email')
    password = request.data.get('password')
    name = request.data.get('name')

    # Validate input
    if not email or not password or not name:
        return Response(
            {'error': 'Email, password, and name are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Check if user exists
    if User.objects.filter(email=email).exists():
        return Response(
            {'error': 'Email already registered'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Create user
    user = User.objects.create(
        email=email,
        password=make_password(password),
        name=name,
        is_active=False
    )

    # Generate verification token
    token = jwt.encode({'user_id': user.id}, os.getenv('JWT_SECRET'), algorithm='HS256')
    user.verification_token = token
    user.save()

    # Send welcome email
    try:
        email_service.send_template(
            to=email,
            template_id='welcome',
            template_data={
                'name': name,
                'verification_link': f'https://yourapp.com/verify?token={token}'
            }
        )
    except Exception as e:
        print(f'Failed to send welcome email: {e}')

    return Response({
        'message': 'Registration successful. Please check your email.',
        'user_id': user.id
    }, status=status.HTTP_201_CREATED)
```

### 3. Email Management Command

```python
# management/commands/send_weekly_digest.py
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from services.email_service import email_service

User = get_user_model()

class Command(BaseCommand):
    help = 'Send weekly digest emails to all users'

    def handle(self, *args, **options):
        users = User.objects.filter(
            is_active=True,
            email_preferences__weekly_digest=True
        )

        messages = []
        for user in users:
            messages.append({
                'from': {
                    'email': 'digest@yourapp.com',
                    'name': 'Your App Digest'
                },
                'to': [{'email': user.email}],
                'template_id': 'weekly_digest',
                'template_data': {
                    'name': user.name,
                    'stats': user.get_weekly_stats(),
                    'unsubscribe_link': f'https://yourapp.com/unsubscribe/{user.id}'
                }
            })

        # Send in batches of 1000
        for i in range(0, len(messages), 1000):
            batch = messages[i:i + 1000]
            try:
                result = email_service.send_batch(batch)
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Sent batch {i // 1000 + 1}: {result["accepted"]} accepted, {result["rejected"]} rejected'
                    )
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Failed to send batch {i // 1000 + 1}: {e}')
                )
```

---

## Laravel / PHP

### 1. Email Service

```php
<?php
// app/Services/EmailService.php
namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class EmailService
{
    protected $apiKey;
    protected $baseUrl;

    public function __construct()
    {
        $this->apiKey = config('services.email.api_key');
        $this->baseUrl = config('services.email.base_url', 'https://api.yourdomain.com');
    }

    public function send(string $to, string $subject, string $html, ?array $from = null)
    {
        $response = Http::withHeaders([
            'X-API-Key' => $this->apiKey,
            'Content-Type' => 'application/json',
        ])->post("{$this->baseUrl}/v1/send", [
            'from' => $from ?? [
                'email' => 'noreply@yourapp.com',
                'name' => 'Your App',
            ],
            'to' => [['email' => $to]],
            'subject' => $subject,
            'html_body' => $html,
            'track_opens' => true,
            'track_clicks' => true,
        ]);

        if (!$response->successful()) {
            Log::error('Email send failed', [
                'to' => $to,
                'error' => $response->json(),
            ]);
            throw new \Exception('Failed to send email');
        }

        return $response->json();
    }

    public function sendTemplate(string $to, string $templateId, array $data)
    {
        $response = Http::withHeaders([
            'X-API-Key' => $this->apiKey,
            'Content-Type' => 'application/json',
        ])->post("{$this->baseUrl}/v1/send/template", [
            'from' => [
                'email' => 'noreply@yourapp.com',
                'name' => 'Your App',
            ],
            'to' => [['email' => $to]],
            'template_id' => $templateId,
            'template_data' => $data,
        ]);

        if (!$response->successful()) {
            Log::error('Template send failed', [
                'to' => $to,
                'template' => $templateId,
                'error' => $response->json(),
            ]);
            throw new \Exception('Failed to send template email');
        }

        return $response->json();
    }
}
```

### 2. User Registration

```php
<?php
// app/Http/Controllers/Auth/RegisterController.php
namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\EmailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class RegisterController extends Controller
{
    protected $emailService;

    public function __construct(EmailService $emailService)
    {
        $this->emailService = $emailService;
    }

    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
            'password' => 'required|min:8|confirmed',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'verification_token' => Str::random(60),
        ]);

        // Send welcome email
        try {
            $this->emailService->sendTemplate(
                $user->email,
                'welcome',
                [
                    'name' => $user->name,
                    'verification_link' => route('verify', ['token' => $user->verification_token]),
                ]
            );
        } catch (\Exception $e) {
            \Log::error('Failed to send welcome email: ' . $e->getMessage());
        }

        return response()->json([
            'message' => 'Registration successful. Please check your email.',
            'user_id' => $user->id,
        ], 201);
    }
}
```

---

## Mobile Apps

### React Native

```typescript
// services/emailService.ts
const API_BASE_URL = 'https://api.yourdomain.com';
const API_KEY = process.env.EXPO_PUBLIC_EMAIL_API_KEY;

export interface SendEmailOptions {
  to: string;
  subject: string;
  message: string;
}

export async function sendContactEmail(options: SendEmailOptions): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/send`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: {
        email: 'mobile-app@yourapp.com',
        name: 'Mobile App',
      },
      to: [{ email: options.to }],
      subject: options.subject,
      html_body: `<p>${options.message}</p>`,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to send email');
  }
}

// Usage in component
import { useState } from 'react';
import { View, TextInput, Button, Alert } from 'react-native';
import { sendContactEmail } from './services/emailService';

export function ContactScreen() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      await sendContactEmail({
        to: 'support@yourapp.com',
        subject,
        message,
      });
      Alert.alert('Success', 'Message sent successfully!');
      setSubject('');
      setMessage('');
    } catch (error) {
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View>
      <TextInput
        placeholder="Subject"
        value={subject}
        onChangeText={setSubject}
      />
      <TextInput
        placeholder="Message"
        value={message}
        onChangeText={setMessage}
        multiline
      />
      <Button
        title={loading ? 'Sending...' : 'Send'}
        onPress={handleSubmit}
        disabled={loading}
      />
    </View>
  );
}
```

---

**Last Updated:** February 3, 2026

_More platform examples available in the [full documentation](https://docs.yourdomain.com)._
