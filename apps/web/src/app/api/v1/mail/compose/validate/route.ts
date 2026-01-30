import { type NextRequest, NextResponse } from "next/server";

/**
 * Simple email validation regex
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate a list of email addresses
 */
function validateEmailList(emails: string[] | undefined, fieldName: string): string | null {
  if (!emails || emails.length === 0) return null;
  const invalid = emails.filter((email) => !isValidEmail(email));
  if (invalid.length > 0) {
    return `Invalid ${fieldName} addresses: ${invalid.join(", ")}`;
  }
  return null;
}

/**
 * Validate sender address
 */
function validateFrom(from: string | undefined): string | null {
  if (!from || !isValidEmail(from)) {
    return "Valid sender email is required";
  }
  return null;
}

/**
 * Validate recipient addresses (to field)
 */
function validateTo(to: string[] | undefined): string | null {
  if (!to || to.length === 0) {
    return "At least one recipient is required";
  }
  return validateEmailList(to, "recipient");
}

/**
 * Validate subject and return warnings
 */
function validateSubject(subject: string | undefined): string[] {
  const warnings: string[] = [];
  if (!subject || subject.trim().length === 0) {
    warnings.push("Email has no subject");
  } else if (subject.length > 200) {
    warnings.push("Subject line is very long (over 200 characters)");
  }
  return warnings;
}

/**
 * Validate email body and return warnings
 */
function validateBody(body: string | undefined): string[] {
  const warnings: string[] = [];
  if (!body || body.trim().length === 0) {
    warnings.push("Email body is empty");
  }
  return warnings;
}

/**
 * Validate recipient count and return error/warnings
 */
function validateRecipientCount(
  to: string[] | undefined,
  cc: string[] | undefined,
  bcc: string[] | undefined
): { error: string | null; warnings: string[] } {
  const totalRecipients = (to?.length ?? 0) + (cc?.length ?? 0) + (bcc?.length ?? 0);
  const warnings: string[] = [];
  let error: string | null = null;

  if (totalRecipients > 100) {
    error = "Too many recipients (max 100)";
  } else if (totalRecipients > 50) {
    warnings.push("Large recipient list detected");
  }

  return { error, warnings };
}

/**
 * Check for external recipients based on sender domain
 */
function checkExternalRecipients(
  from: string | undefined,
  to: string[] | undefined,
  cc: string[] | undefined,
  bcc: string[] | undefined
): string[] {
  const warnings: string[] = [];
  if (!from) return warnings;

  const senderDomain = from.split("@")[1];
  if (!senderDomain) return warnings;

  const allRecipients = [...(to ?? []), ...(cc ?? []), ...(bcc ?? [])];
  const externalRecipients = allRecipients.filter((email) => {
    const recipientDomain = email.split("@")[1];
    return recipientDomain && recipientDomain !== senderDomain;
  });

  if (externalRecipients.length > 0) {
    warnings.push(`Email contains ${externalRecipients.length} external recipient(s)`);
  }

  return warnings;
}

/**
 * POST /api/v1/mail/compose/validate
 * Validate email addresses, subject, and content before sending
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      from?: string;
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      body?: string;
    };
    const { from, to, cc, bcc, subject, body: emailBody } = body;

    const errors: Record<string, string> = {};
    const warnings: string[] = [];

    // Validate 'from' address
    const fromError = validateFrom(from);
    if (fromError) errors.from = fromError;

    // Validate 'to' addresses
    const toError = validateTo(to);
    if (toError) errors.to = toError;

    // Validate 'cc' addresses
    const ccError = validateEmailList(cc, "CC");
    if (ccError) errors.cc = ccError;

    // Validate 'bcc' addresses
    const bccError = validateEmailList(bcc, "BCC");
    if (bccError) errors.bcc = bccError;

    // Validate subject
    warnings.push(...validateSubject(subject));

    // Validate body
    warnings.push(...validateBody(emailBody));

    // Check recipient count
    const recipientValidation = validateRecipientCount(to, cc, bcc);
    if (recipientValidation.error) errors.recipients = recipientValidation.error;
    warnings.push(...recipientValidation.warnings);

    // Check for external recipients (domain verification)
    warnings.push(...checkExternalRecipients(from, to, cc, bcc));

    const isValid = Object.keys(errors).length === 0;

    return NextResponse.json({
      isValid,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error("Error validating email:", error);
    return NextResponse.json({ error: "Failed to validate email" }, { status: 500 });
  }
}
