/**
 * Admin Security Settings API Route
 * Proxies requests to the auth service for security configuration
 */

import { type NextRequest, NextResponse } from "next/server";

const AUTH_URL = process.env["AUTH_URL"] || "http://auth:8080";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${AUTH_URL}/api/v1/admin/security/settings`, {
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization") ?? "",
        }),
      },
    });

    if (!response.ok) {
      // Return sensible defaults if auth service doesn't support this endpoint yet
      return NextResponse.json({
        mfaRequired: false,
        passwordMinLength: 12,
        passwordRequireUppercase: true,
        passwordRequireNumbers: true,
        passwordRequireSymbols: true,
        sessionTimeout: 30,
        maxLoginAttempts: 5,
        lockoutDuration: 15,
        ipWhitelistEnabled: false,
        ipWhitelist: [],
      });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch security settings:", error);
    return NextResponse.json({ error: "Failed to fetch security settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    const response = await fetch(`${AUTH_URL}/api/v1/admin/security/settings`, {
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
    console.error("Failed to save security settings:", error);
    return NextResponse.json({ error: "Failed to save security settings" }, { status: 500 });
  }
}
