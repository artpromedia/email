/**
 * Domain DKIM API Route
 * Manages DKIM keys for a domain
 */

import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env.DOMAIN_MANAGER_URL || "http://domain-manager:8083";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains/${id}/dkim`, {
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
    console.error("Failed to fetch DKIM keys:", error);
    return NextResponse.json({ error: "Failed to fetch DKIM keys" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains/${id}/dkim/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization")!,
        }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to generate DKIM key:", error);
    return NextResponse.json({ error: "Failed to generate DKIM key" }, { status: 500 });
  }
}
