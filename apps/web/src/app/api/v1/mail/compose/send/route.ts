import { type NextRequest, NextResponse } from "next/server";

/**
 * Decode JWT claims from authorization header
 */
function decodeJwtClaims(authHeader: string): {
  sub?: string;
  userId?: string;
  email?: string;
  name?: string;
} | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1] ?? "", "base64").toString()) as {
      sub?: string;
      userId?: string;
      email?: string;
      name?: string;
    };
  } catch {
    return null;
  }
}

/**
 * Extract user ID from JWT token in authorization header
 */
function extractUserIdFromToken(authHeader: string): string | null {
  const claims = decodeJwtClaims(authHeader);
  return claims?.sub ?? claims?.userId ?? null;
}

/**
 * Extract email from JWT token in authorization header
 */
function extractEmailFromToken(authHeader: string): string | null {
  const claims = decodeJwtClaims(authHeader);
  return claims?.email ?? null;
}

/**
 * Verify user has permission to send from this address
 */
function verifySenderAuthorization(_userId: string, _fromAddress: string): boolean {
  // In production: check user's verified sender addresses in database
  // const authorized = await db.select().from(userAddresses).where(and(eq(userAddresses.userId, userId), eq(userAddresses.email, fromAddress))).first();
  return true;
}

/**
 * Check rate limits and quotas for the user
 */
function checkRateLimits(_userId: string): { allowed: boolean; reason?: string } {
  // In production: check Redis for rate limit counters
  // const dailyCount = await redis.get(`email:daily:${userId}`);
  // if (dailyCount > DAILY_LIMIT) return { allowed: false, reason: 'Daily limit exceeded' };
  return { allowed: true };
}

/**
 * Apply domain policies and filters to the email
 */
function applyDomainPolicies(
  _domain: string,
  _email: Record<string, unknown>
): { allowed: boolean; reason?: string } {
  // In production: fetch and apply domain policies
  // const policies = await db.select().from(domainPolicies).where(eq(domainPolicies.domain, domain)).first();
  return { allowed: true };
}

/**
 * Queue email for sending via SMTP server
 */
function queueEmailForSending(email: Record<string, unknown>): void {
  // In production: add to message queue (Redis, RabbitMQ, etc.)
  // await messageQueue.add('send-email', email);
  console.info("Email queued for SMTP delivery:", { messageId: email["messageId"] });
}

/**
 * Save email to user's Sent folder
 */
function saveToSentFolder(_userId: string, _email: Record<string, unknown>): void {
  // In production: save to database
  // await db.insert(emails).values({ ...email, folder: 'sent', userId });
}

/**
 * Convert recipient field to array format
 */
function toRecipientArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * POST /api/v1/mail/compose/send
 * Send an email
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      // Client sends these fields from SendEmailRequest type
      fromAddressId?: string;
      sendMode?: string;
      bodyHtml?: string;
      attachmentIds?: string[];
      // Legacy / direct fields
      from?: string;
      to: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      subject: string;
      body: string;
      bodyType?: string;
      attachments?: string[];
      priority?: string;
      requestDeliveryReceipt?: boolean;
      requestReadReceipt?: boolean;
      inReplyTo?: string;
      references?: string[];
      headers?: Record<string, string>;
    };
    const {
      fromAddressId: _fromAddressId,
      from: fromDirect,
      to,
      cc,
      bcc,
      subject,
      body: emailBody,
      bodyHtml,
      bodyType = "html",
      attachments = [],
      attachmentIds = [],
      priority = "normal",
      requestDeliveryReceipt = false,
      requestReadReceipt = false,
      inReplyTo,
      references,
      headers = {},
    } = body;

    // Use 'from' directly if it looks like an email, otherwise resolve from JWT
    let from = fromDirect ?? "";
    if (!from?.includes("@")) {
      // fromAddressId is a UUID — resolve the sender's email from the JWT
      const jwtEmail = extractEmailFromToken(authHeader);
      if (jwtEmail) {
        from = jwtEmail;
      }
    }
    // _fromAddressId reserved for future address lookup

    // Validate required fields
    const toArray = toRecipientArray(to);
    if (!from || !to || toArray.length === 0 || !subject || (!emailBody && !bodyHtml)) {
      return NextResponse.json(
        {
          error: "Missing required fields: from, to, subject, and body are required",
        },
        { status: 400 }
      );
    }

    // Extract user from JWT token and verify sender authorization
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ message: "Invalid token" }, { status: 401 });
    }

    // Verify user has permission to send from this address
    if (!verifySenderAuthorization(userId, from)) {
      return NextResponse.json(
        { message: "Not authorized to send from this address" },
        { status: 403 }
      );
    }

    // Check rate limits and quotas
    const rateLimitCheck = checkRateLimits(userId);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { error: rateLimitCheck.reason ?? "Rate limit exceeded" },
        { status: 429 }
      );
    }

    // Create email message object
    const domain = from.split("@")[1] ?? "example.com";

    // Apply domain policies and filters
    const policyCheck = applyDomainPolicies(domain, body);
    if (!policyCheck.allowed) {
      return NextResponse.json(
        { error: policyCheck.reason ?? "Email blocked by policy" },
        { status: 403 }
      );
    }

    const messageId = `<${Date.now()}.${Math.random().toString(36).substring(7)}@${domain}>`;

    const email = {
      messageId,
      from,
      to: toArray,
      cc: toRecipientArray(cc),
      bcc: toRecipientArray(bcc),
      subject,
      body: emailBody || bodyHtml || "",
      bodyHtml: bodyHtml || emailBody || "",
      bodyType: bodyHtml ? "html" : bodyType,
      attachments: attachmentIds.length > 0 ? attachmentIds : attachments,
      priority,
      requestDeliveryReceipt,
      requestReadReceipt,
      inReplyTo,
      references,
      headers,
      userId,
      createdAt: new Date().toISOString(),
    };

    // Queue email for sending via SMTP server
    queueEmailForSending(email);

    // Save to 'Sent' folder
    saveToSentFolder(userId, email);

    console.info("Email queued for sending:", {
      messageId,
      from,
      to: email.to,
      subject,
    });

    return NextResponse.json(
      {
        success: true,
        emailId: messageId,
        messageId,
        status: "queued",
        message: "Email has been queued for sending",
        sentAt: new Date().toISOString(),
      },
      { status: 202 } // 202 Accepted
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
