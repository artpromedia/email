/**
 * Domain DKIM Key Operations Route
 * Handles activate, rotate, and delete operations on individual DKIM keys
 */

import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env["DOMAIN_MANAGER_URL"] || "http://domain-manager:8083";

interface RouteParams {
  params: Promise<{ id: string; keyId: string }>;
}

/**
 * POST /api/v1/domains/[id]/dkim/[keyId]/activate → activate DKIM key
 * (Handled by the activate route instead, but kept for flexibility)
 */

/** DELETE /api/v1/domains/[id]/dkim/[keyId] → delete DKIM key */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id, keyId } = await params;

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains/${id}/dkim/${keyId}`, {
      method: "DELETE",
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const text = await response.text();
    if (!text) {
      return new NextResponse(null, { status: response.status });
    }
    return NextResponse.json(JSON.parse(text), { status: response.status });
  } catch (error) {
    console.error("Failed to delete DKIM key:", error);
    return NextResponse.json({ error: "Failed to delete DKIM key" }, { status: 500 });
  }
}
