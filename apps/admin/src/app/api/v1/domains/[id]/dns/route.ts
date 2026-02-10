/**
 * Domain DNS Check API Route
 * Checks DNS records for a domain
 */

import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env.DOMAIN_MANAGER_URL || "http://domain-manager:8083";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains/${id}/check-dns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization")!,
        }),
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to check DNS:", error);
    return NextResponse.json({ error: "Failed to check DNS" }, { status: 500 });
  }
}
