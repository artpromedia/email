/**
 * Admin Domain Detail API Route
 * Proxies requests to the domain-manager service for specific domain operations
 */

import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env.DOMAIN_MANAGER_URL || "http://domain-manager:8083";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains/${id}`, {
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
    console.error("Failed to fetch domain:", error);
    return NextResponse.json({ error: "Failed to fetch domain" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains/${id}`, {
      method: "PUT",
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
          Authorization: request.headers.get("Authorization")!,
        }),
      },
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to delete domain:", error);
    return NextResponse.json({ error: "Failed to delete domain" }, { status: 500 });
  }
}
