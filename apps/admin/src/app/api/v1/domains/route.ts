/**
 * Admin Domains API Route
 * Proxies requests to the domain-manager service
 * Translates between frontend field names and backend Go struct field names
 */

import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env["DOMAIN_MANAGER_URL"] || "http://domain-manager:8083";
const DEFAULT_ORG_ID =
  process.env["DEFAULT_ORGANIZATION_ID"] || "00000000-0000-0000-0000-000000000001";

interface BackendDomain {
  id: string;
  organization_id: string;
  domain_name: string;
  display_name: string;
  status: string;
  is_primary: boolean;
  verification_token?: string;
  mx_verified: boolean;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_verified: boolean;
  created_at: string;
  updated_at: string;
  verified_at?: string;
  last_dns_check?: string;
}

function mapDomain(d: BackendDomain) {
  return {
    id: d.id,
    name: d.domain_name,
    displayName: d.display_name,
    status: d.status === "pending_verification" ? "pending" : d.status,
    verified: d.mx_verified || d.status === "active",
    dkimEnabled: d.dkim_verified,
    spfEnabled: d.spf_verified,
    dmarcEnabled: d.dmarc_verified,
    mxVerified: d.mx_verified,
    isPrimary: d.is_primary,
    userCount: 0,
    emailCount: 0,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    verifiedAt: d.verified_at,
    verificationToken: d.verification_token,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URLSearchParams(request.nextUrl.searchParams);
    // Inject organization_id if not provided
    if (!searchParams.has("organization_id")) {
      searchParams.set("organization_id", DEFAULT_ORG_ID);
    }

    const response = await fetch(
      `${DOMAIN_MANAGER_URL}/api/admin/domains?${searchParams.toString()}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(request.headers.get("Authorization") && {
            Authorization: request.headers.get("Authorization") ?? "",
          }),
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Domain manager GET error:", response.status, text);
      return NextResponse.json({ domains: [], error: text }, { status: response.status });
    }

    const data = (await response.json()) as BackendDomain[];
    // Backend returns a flat array; wrap in { domains: [...] } for frontend
    const domains = Array.isArray(data) ? data.map(mapDomain) : [];
    return NextResponse.json({ domains });
  } catch (error) {
    console.error("Failed to fetch domains:", error);
    return NextResponse.json({ domains: [], error: "Failed to fetch domains" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      domain_name?: string;
      organization_id?: string;
    };

    // Map frontend field names to backend expected format
    const backendBody = {
      organization_id: body.organization_id || DEFAULT_ORG_ID,
      domain_name: body.domain_name || body.name || "",
    };

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization") ?? "",
        }),
      },
      body: JSON.stringify(backendBody),
    });

    const data = (await response.json()) as BackendDomain | { error?: string; message?: string };
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    // Map the created domain response
    const mapped = "domain_name" in data ? mapDomain(data) : data;
    return NextResponse.json(mapped, { status: response.status });
  } catch (error) {
    console.error("Failed to create domain:", error);
    return NextResponse.json({ error: "Failed to create domain" }, { status: 500 });
  }
}
