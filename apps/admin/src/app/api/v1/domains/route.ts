/**
 * Admin Domains API Route
 * Proxies requests to the domain-manager service
 */

import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env.DOMAIN_MANAGER_URL || "http://domain-manager:8083";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    const response = await fetch(
      `${DOMAIN_MANAGER_URL}/api/admin/domains${queryString ? `?${queryString}` : ""}`,
      {
        headers: {
          "Content-Type": "application/json",
          // Forward auth headers
          ...(request.headers.get("Authorization") && {
            Authorization: request.headers.get("Authorization")!,
          }),
        },
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch domains:", error);
    return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains`, {
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
    console.error("Failed to create domain:", error);
    return NextResponse.json({ error: "Failed to create domain" }, { status: 500 });
  }
}
