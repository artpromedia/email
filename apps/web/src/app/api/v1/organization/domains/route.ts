import { type NextRequest, NextResponse } from "next/server";

const AUTH_API_URL = process.env["AUTH_API_URL"] || "http://auth:8080";

/**
 * GET /api/v1/organization/domains
 * Return the user's accessible domains from the auth service.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await fetch(`${AUTH_API_URL}/api/auth/me`, {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ domains: [] });
    }

    const user = (await response.json()) as {
      domains?: {
        id: string;
        name: string;
        is_primary: boolean;
        can_send: boolean;
        can_manage: boolean;
        has_sso: boolean;
      }[];
    };

    const domains = (user.domains ?? []).map((d) => ({
      id: d.id,
      domain: d.name,
      status: "verified" as const,
      isPrimary: d.is_primary,
      dnsRecords: [
        { type: "MX", name: "@", value: `mail.${d.name}`, verified: true },
        { type: "TXT", name: "@", value: `v=spf1 include:${d.name} ~all`, verified: true },
        {
          type: "TXT",
          name: "oonru._domainkey",
          value: "v=DKIM1; k=rsa; p=...",
          verified: true,
        },
        {
          type: "TXT",
          name: "_dmarc",
          value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${d.name}`,
          verified: true,
        },
      ],
      createdAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    }));

    return NextResponse.json({ domains });
  } catch (error) {
    console.error("Error fetching domains:", error);
    return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 });
  }
}
