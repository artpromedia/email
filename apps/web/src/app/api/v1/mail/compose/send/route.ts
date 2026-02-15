import * as net from "node:net";
import { type NextRequest, NextResponse } from "next/server";

const SMTP_HOST = process.env.SMTP_HOST || "smtp-server";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "25", 10);

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
 * Extract user ID from JWT token
 */
function extractUserIdFromToken(authHeader: string): string | null {
  const claims = decodeJwtClaims(authHeader);
  return claims?.sub ?? claims?.userId ?? null;
}

/**
 * Extract email and name from JWT token
 */
function extractSenderFromToken(authHeader: string): {
  email: string;
  name: string;
} | null {
  const claims = decodeJwtClaims(authHeader);
  if (!claims?.email) return null;
  return { email: claims.email, name: claims.name ?? "" };
}

/**
 * Convert recipient field to array format
 */
function toRecipientArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Escape special characters for MIME header encoding
 */
function mimeEncode(text: string): string {
  // If ASCII-only and no special chars, return as-is
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  // Use RFC 2047 Q-encoding
  return `=?UTF-8?B?${Buffer.from(text).toString("base64")}?=`;
}

/**
 * Format an email address for the From/To header
 */
function formatAddress(email: string, name?: string): string {
  if (name) return `${mimeEncode(name)} <${email}>`;
  return email;
}

/**
 * Build a MIME email message
 */
function buildMimeMessage(params: {
  messageId: string;
  from: string;
  fromName: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  textBody: string;
  htmlBody: string;
  priority: string;
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
}): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  const lines: string[] = [];

  lines.push(`Message-ID: ${params.messageId}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push(`From: ${formatAddress(params.from, params.fromName)}`);
  lines.push(`To: ${params.to.join(", ")}`);
  if (params.cc.length > 0) lines.push(`Cc: ${params.cc.join(", ")}`);
  // BCC is NOT included in headers (by design)
  lines.push(`Subject: ${mimeEncode(params.subject)}`);
  lines.push(`MIME-Version: 1.0`);

  if (params.priority === "high") {
    lines.push(`X-Priority: 1`);
    lines.push(`Importance: high`);
  } else if (params.priority === "low") {
    lines.push(`X-Priority: 5`);
    lines.push(`Importance: low`);
  }

  if (params.inReplyTo) lines.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references && params.references.length > 0) {
    lines.push(`References: ${params.references.join(" ")}`);
  }

  // Custom headers
  if (params.headers) {
    for (const [key, value] of Object.entries(params.headers)) {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push(``);

  // Plain text part
  const plainText = params.textBody || params.htmlBody.replace(/<[^>]*>/g, "");
  lines.push(`--${boundary}`);
  lines.push(`Content-Type: text/plain; charset=UTF-8`);
  lines.push(`Content-Transfer-Encoding: base64`);
  lines.push(``);
  lines.push(Buffer.from(plainText).toString("base64"));
  lines.push(``);

  // HTML part
  if (params.htmlBody) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: text/html; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: base64`);
    lines.push(``);
    lines.push(Buffer.from(params.htmlBody).toString("base64"));
    lines.push(``);
  }

  lines.push(`--${boundary}--`);
  lines.push(``);

  return lines.join("\r\n");
}

/**
 * Send email via SMTP using the local smtp-server container
 */
async function sendViaSMTP(params: {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  data: string;
}): Promise<void> {
  const allRecipients = [...params.to, ...params.cc, ...params.bcc];

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SMTP_PORT, SMTP_HOST);
    let buffer = "";
    let step = 0;
    let recipientIndex = 0;
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("SMTP timeout"));
    }, 30000);

    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`SMTP connection error: ${err.message}`));
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      // Process complete lines
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.substring(0, 3), 10);
        // Multi-line response (code followed by -)
        if (line[3] === "-") continue;

        if (code >= 400) {
          clearTimeout(timeout);
          socket.end("QUIT\r\n");
          reject(new Error(`SMTP error (${code}): ${line}`));
          return;
        }

        switch (step) {
          case 0: // Greeting
            socket.write(`EHLO localhost\r\n`);
            step = 1;
            break;
          case 1: // EHLO response
            socket.write(`MAIL FROM:<${params.from}>\r\n`);
            step = 2;
            break;
          case 2: // MAIL FROM response
            if (recipientIndex < allRecipients.length) {
              const recipient = allRecipients[recipientIndex] ?? "";
              socket.write(`RCPT TO:<${recipient}>\r\n`);
              recipientIndex++;
              if (recipientIndex < allRecipients.length) {
                // Stay in step 2 for more recipients
                break;
              }
            }
            step = 3;
            break;
          case 3: // Last RCPT TO response
            socket.write(`DATA\r\n`);
            step = 4;
            break;
          case 4: // DATA response (354)
            // Send the email data, ending with \r\n.\r\n
            socket.write(params.data);
            if (!params.data.endsWith("\r\n")) socket.write("\r\n");
            socket.write(".\r\n");
            step = 5;
            break;
          case 5: // Data accepted
            socket.write("QUIT\r\n");
            step = 6;
            break;
          case 6: // QUIT response
            clearTimeout(timeout);
            socket.end();
            resolve();
            return;
        }
      }
    });

    socket.on("close", () => {
      clearTimeout(timeout);
      if (step < 6) {
        reject(new Error("SMTP connection closed prematurely"));
      }
    });
  });
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

    // Extract sender info from JWT
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ message: "Invalid token" }, { status: 401 });
    }

    const sender = extractSenderFromToken(authHeader);
    if (!sender) {
      return NextResponse.json({ message: "Cannot determine sender email" }, { status: 400 });
    }

    const body = (await request.json()) as {
      fromAddressId?: string;
      sendMode?: string;
      from?: string;
      to: string | string[];
      cc?: string | string[];
      bcc?: string | string[];
      subject: string;
      body: string;
      bodyHtml?: string;
      bodyType?: string;
      attachmentIds?: string[];
      attachments?: string[];
      priority?: string;
      requestReadReceipt?: boolean;
      inReplyTo?: string;
      references?: string[];
      headers?: Record<string, string>;
    };

    // Resolve sender email: use 'from' if it looks like an email, else use JWT email
    const fromEmail = body.from?.includes("@") ? body.from : sender.email;
    const fromName = sender.name;

    const toArray = toRecipientArray(body.to);
    const ccArray = toRecipientArray(body.cc);
    const bccArray = toRecipientArray(body.bcc);

    if (toArray.length === 0 || !body.subject || (!body.body && !body.bodyHtml)) {
      return NextResponse.json(
        { message: "Missing required fields: to, subject, and body are required" },
        { status: 400 }
      );
    }

    // Build message
    const domain = fromEmail.split("@")[1] ?? "oonrumail.com";
    const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 9)}@${domain}>`;

    const mimeData = buildMimeMessage({
      messageId,
      from: fromEmail,
      fromName,
      to: toArray,
      cc: ccArray,
      bcc: bccArray,
      subject: body.subject,
      textBody: body.body || "",
      htmlBody: body.bodyHtml || body.body || "",
      priority: body.priority ?? "normal",
      inReplyTo: body.inReplyTo,
      references: body.references,
      headers: body.headers,
    });

    // Send via SMTP
    console.info("Sending email via SMTP:", {
      messageId,
      from: fromEmail,
      to: toArray,
      cc: ccArray,
      subject: body.subject,
      smtpHost: SMTP_HOST,
      smtpPort: SMTP_PORT,
    });

    await sendViaSMTP({
      from: fromEmail,
      to: toArray,
      cc: ccArray,
      bcc: bccArray,
      data: mimeData,
    });

    console.info("Email sent successfully:", { messageId });

    return NextResponse.json(
      {
        success: true,
        emailId: messageId,
        messageId,
        status: "sent",
        message: "Email sent successfully",
        sentAt: new Date().toISOString(),
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to send email";
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
