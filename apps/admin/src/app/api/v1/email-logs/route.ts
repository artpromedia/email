/**
 * Admin Email Logs API Route
 * Proxies requests to the transactional API for email event logs
 */

import { type NextRequest, NextResponse } from "next/server";

const TRANSACTIONAL_API_URL = process.env.TRANSACTIONAL_API_URL || "http://transactional-api:8085";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();

    const response = await fetch(
      `${TRANSACTIONAL_API_URL}/v1/events${queryString ? `?${queryString}` : ""}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(request.headers.get("Authorization") && {
            Authorization: request.headers.get("Authorization")!,
          }),
          ...(request.headers.get("X-API-Key") && {
            "X-API-Key": request.headers.get("X-API-Key")!,
          }),
        },
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch email logs:", error);
    return NextResponse.json({ error: "Failed to fetch email logs" }, { status: 500 });
  }
}
