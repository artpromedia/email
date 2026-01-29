import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/v1/mail/compose/branding
 * Get domain branding configuration for email compose
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain");

    if (!domain) {
      return NextResponse.json({ error: "Domain parameter is required" }, { status: 400 });
    }

    // TODO: Fetch domain branding from database
    const branding = {
      domain,
      logo: "https://example.com/logo.png",
      brandColor: "#3B82F6",
      companyName: "Acme Corporation",
      footerText: "This email was sent from Acme Corporation. Please do not reply to this email.",
      disclaimerText:
        "CONFIDENTIAL: This email and any attachments are confidential and may be privileged.",
      includeUnsubscribeLink: true,
      customHeaders: {
        "X-Company-ID": "acme-corp",
        "X-Campaign-ID": "",
      },
    };

    return NextResponse.json(branding);
  } catch (error) {
    console.error("Error fetching branding:", error);
    return NextResponse.json({ error: "Failed to fetch branding configuration" }, { status: 500 });
  }
}
