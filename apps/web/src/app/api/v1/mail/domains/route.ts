/**
 * Mail Domains API Route
 * Fetches user's email domains
 */

import { NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env.DOMAIN_MANAGER_URL || "http://domain-manager:8083";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/domains`, {
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Domain manager error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch domains", domains: [] },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching mail domains:", error);
    return NextResponse.json(
      { error: "Domain service unavailable", domains: [] },
      { status: 503 }
    );
  }
}
