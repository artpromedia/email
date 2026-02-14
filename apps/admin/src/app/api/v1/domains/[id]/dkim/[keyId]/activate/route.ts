/**
 * Domain DKIM Key Activate Route
 * POST /api/v1/domains/[id]/dkim/[keyId]/activate
 */

import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env["DOMAIN_MANAGER_URL"] || "http://domain-manager:8083";

interface RouteParams {
  params: Promise<{ id: string; keyId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id, keyId } = await params;

    const response = await fetch(
      `${DOMAIN_MANAGER_URL}/api/admin/domains/${id}/dkim/${keyId}/activate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );

    const text = await response.text();
    if (!text) {
      return new NextResponse(null, { status: response.status });
    }
    return NextResponse.json(JSON.parse(text), { status: response.status });
  } catch (error) {
    console.error("Failed to activate DKIM key:", error);
    return NextResponse.json({ error: "Failed to activate DKIM key" }, { status: 500 });
  }
}
