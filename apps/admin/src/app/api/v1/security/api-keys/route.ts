/**
 * Admin API Keys Management Route
 * Proxies requests to the auth service for API key management
 */

import { type NextRequest, NextResponse } from "next/server";

const AUTH_URL = process.env["AUTH_URL"] || "http://auth:8080";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${AUTH_URL}/api/v1/admin/api-keys`, {
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization") ?? "",
        }),
      },
    });

    if (!response.ok) {
      return NextResponse.json({ keys: [] });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch API keys:", error);
    return NextResponse.json({ keys: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    const response = await fetch(`${AUTH_URL}/api/v1/admin/api-keys`, {
      method: "POST",
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
    console.error("Failed to create API key:", error);
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }
}
