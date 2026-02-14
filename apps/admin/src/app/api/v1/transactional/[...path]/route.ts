/**
 * Transactional Email API Proxy
 * Catches all /api/v1/transactional/* requests and forwards to transactional-api service
 * Injects the admin API key for authentication
 */

import { type NextRequest, NextResponse } from "next/server";

const TRANSACTIONAL_API_URL =
  process.env["TRANSACTIONAL_API_URL"] || "http://transactional-api:8085";
const ADMIN_API_KEY =
  process.env["TRANSACTIONAL_ADMIN_API_KEY"] || "em_6L6wKgdb-VWJo7Mx_KU5AMlNrNKfXB114xbPMzlHwvA=";

async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
  method: string
) {
  try {
    const { path } = await params;
    const backendPath = `/v1/${path.join("/")}`;
    const searchParams = request.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const url = `${TRANSACTIONAL_API_URL}${backendPath}${queryString ? `?${queryString}` : ""}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": ADMIN_API_KEY,
    };

    const fetchOptions: RequestInit = { method, headers };

    if (method !== "GET" && method !== "DELETE") {
      try {
        const body = await request.text();
        if (body) fetchOptions.body = body;
      } catch {
        // No body
      }
    }

    const response = await fetch(url, fetchOptions);

    // Handle empty responses (204, etc.)
    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      const text = await response.text();
      return new NextResponse(text, { status: response.status });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`Transactional API proxy error [${method}]:`, error);
    return NextResponse.json(
      { error: "Failed to proxy request to transactional API" },
      { status: 502 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params, "GET");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params, "POST");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params, "PUT");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params, "DELETE");
}
