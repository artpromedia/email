import { type NextRequest, NextResponse } from "next/server";

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

    const body = await request.json();
    const { from, to, cc, bcc, subject, body: emailBody } = body;

    const errors: Record<string, string> = {};
    const warnings: string[] = [];

    // Validate 'from' address
    if (!from || !isValidEmail(from)) {
      errors.from = "Valid sender email is required";
    }

    // Validate 'to' addresses
    if (!to || to.length === 0) {
      errors.to = "At least one recipient is required";
    } else {
      const invalidTo = to.filter((email: string) => !isValidEmail(email));
      if (invalidTo.length > 0) {
        errors.to = `Invalid recipient addresses: ${invalidTo.join(", ")}`;
      }
    }

    // Validate 'cc' addresses
    if (cc && cc.length > 0) {
      const invalidCc = cc.filter((email: string) => !isValidEmail(email));
      if (invalidCc.length > 0) {
        errors.cc = `Invalid CC addresses: ${invalidCc.join(", ")}`;
      }
    }

    // Validate 'bcc' addresses
    if (bcc && bcc.length > 0) {
      const invalidBcc = bcc.filter((email: string) => !isValidEmail(email));
      if (invalidBcc.length > 0) {
        errors.bcc = `Invalid BCC addresses: ${invalidBcc.join(", ")}`;
      }
    }

    // Validate subject
    if (!subject || subject.trim().length === 0) {
      warnings.push("Email has no subject");
    } else if (subject.length > 200) {
      warnings.push("Subject line is very long (over 200 characters)");
    }

    // Validate body
    if (!emailBody || emailBody.trim().length === 0) {
      warnings.push("Email body is empty");
    }

    // Check for large recipient lists
    const totalRecipients = (to?.length || 0) + (cc?.length || 0) + (bcc?.length || 0);
    if (totalRecipients > 100) {
      errors.recipients = "Too many recipients (max 100)";
    } else if (totalRecipients > 50) {
      warnings.push("Large recipient list detected");
    }

    // Check for external recipients (if needed)
    // TODO: Implement domain verification logic

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

/**
 * Simple email validation regex
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
