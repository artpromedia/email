/**
 * Admin API Proxy Route (Catch-all)
 * Proxies /api/v1/admin/* requests to the domain-manager backend
 * Forwards Authorization header for domain-scoped access control
 */

import { NextResponse, type NextRequest } from "next/server";

const DOMAIN_MANAGER_URL = process.env["DOMAIN_MANAGER_URL"] || "http://domain-manager:8083";

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const pathStr = path.join("/");
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    const backendUrl = `${DOMAIN_MANAGER_URL}/api/admin/${pathStr}${queryString ? `?${queryString}` : ""}`;

    // Forward headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const authHeader = request.headers.get("Authorization");
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    // Get body for non-GET requests
    let body: string | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      try {
        const text = await request.text();
        if (text) {
          body = text;
        }
      } catch {
        // No body
      }
    }

    const response = await fetch(backendUrl, {
      method: request.method,
      headers,
      body,
    });

    // Handle non-JSON responses
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      return new NextResponse(text, {
        status: response.status,
        headers: { "Content-Type": contentType },
      });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Admin API proxy error:", error);
    return NextResponse.json({ error: "Admin service unavailable" }, { status: 503 });
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
