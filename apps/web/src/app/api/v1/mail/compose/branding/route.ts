import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_API_URL = process.env.DOMAIN_API_URL || "http://domain-manager:8083";

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

    // Fetch domain branding from domain manager service
    const response = await fetch(`${DOMAIN_API_URL}/api/v1/domains/${domain}/branding`, {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const branding = await response.json();
      return NextResponse.json(branding);
    }

    // Return empty branding if not configured
    return NextResponse.json({
      domain,
      logo: null,
      brandColor: null,
      companyName: null,
      footerText: null,
      disclaimerText: null,
      includeUnsubscribeLink: false,
      customHeaders: {},
    });
  } catch (error) {
    console.error("Error fetching branding:", error);
    return NextResponse.json({ error: "Failed to fetch branding configuration" }, { status: 500 });
  }
}
