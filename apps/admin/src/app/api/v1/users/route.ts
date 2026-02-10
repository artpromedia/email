/**
 * Admin Users API Route
 * Proxies requests to the auth service for user management
 */

import { type NextRequest, NextResponse } from "next/server";

const AUTH_URL = process.env.AUTH_URL || "http://auth:8080";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    const response = await fetch(
      `${AUTH_URL}/api/v1/admin/users${queryString ? `?${queryString}` : ""}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(request.headers.get("Authorization") && {
            Authorization: request.headers.get("Authorization")!,
          }),
        },
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${AUTH_URL}/api/v1/admin/users`, {
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
    console.error("Failed to create user:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
