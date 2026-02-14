/**
 * Admin Audit Logs API Route
 * Proxies requests to the auth service for audit log retrieval
 */

import { type NextRequest, NextResponse } from "next/server";

const AUTH_URL = process.env["AUTH_URL"] || "http://auth:8080";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    const response = await fetch(
      `${AUTH_URL}/api/v1/admin/audit${queryString ? `?${queryString}` : ""}`,
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
      // Return empty logs instead of mock data when service is unavailable
      return NextResponse.json({ logs: [] });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return NextResponse.json({ logs: [] });
  }
}
