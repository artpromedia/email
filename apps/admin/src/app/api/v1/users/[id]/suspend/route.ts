/**
 * Admin User Suspend API Route
 * Proxies suspend/unsuspend requests to the auth service
 */

import { type NextRequest, NextResponse } from "next/server";

const AUTH_URL = process.env["AUTH_URL"] || "http://auth:8080";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const response = await fetch(`${AUTH_URL}/api/v1/admin/users/${id}/suspend`, {
      method: "POST",
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
    console.error("Failed to suspend user:", error);
    return NextResponse.json({ error: "Failed to suspend user" }, { status: 500 });
  }
}
