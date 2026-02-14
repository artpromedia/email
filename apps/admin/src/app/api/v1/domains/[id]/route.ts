/**
 * Admin Domain Detail API Route
 * Proxies requests to the domain-manager service for specific domain operations
 */

import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env["DOMAIN_MANAGER_URL"] || "http://domain-manager:8083";

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization") ?? "",
        }),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: text }, { status: response.status });
    }

    const data = (await response.json()) as BackendDomain;
    return NextResponse.json(mapDomain(data));
  } catch (error) {
    console.error("Failed to fetch domain:", error);
    return NextResponse.json({ error: "Failed to fetch domain" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization") ?? "",
        }),
      },
      body: JSON.stringify(body),
    });

    const data: unknown = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to update domain:", error);
    return NextResponse.json({ error: "Failed to update domain" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization") ?? "",
        }),
      },
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to delete domain:", error);
    return NextResponse.json({ error: "Failed to delete domain" }, { status: 500 });
  }
}
