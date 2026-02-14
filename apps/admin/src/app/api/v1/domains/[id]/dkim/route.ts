/**
 * Domain DKIM API Route
 * Manages DKIM keys for a domain
 */

import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env["DOMAIN_MANAGER_URL"] || "http://domain-manager:8083";

// Map backend snake_case DKIM key to frontend camelCase
function mapDkimKey(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: raw["id"],
    selector: raw["selector"],
    algorithm: raw["algorithm"],
    keySize: raw["key_size"],
    publicKey: raw["public_key"],
    dnsRecord: raw["dns_record"],
    active: raw["is_active"] ?? false,
    createdAt: raw["created_at"],
    activatedAt: raw["activated_at"],
    expiresAt: raw["expires_at"],
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains/${id}/dkim`, {
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization") ?? "",
        }),
      },
    });

    const text = await response.text();
    if (!text || text === "null") {
      return NextResponse.json([], { status: 200 });
    }
    const data: unknown = JSON.parse(text);
    // Backend returns an array of keys or a single key
    if (Array.isArray(data)) {
      return NextResponse.json(
        data.map((k) => mapDkimKey(k as Record<string, unknown>)),
        {
          status: 200,
        }
      );
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch DKIM keys:", error);
    return NextResponse.json({ error: "Failed to fetch DKIM keys" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Safely parse body — frontend may send empty body
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // No body or invalid JSON — use empty object (backend accepts {})
    }

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/domains/${id}/dkim/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization") ?? "",
        }),
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!text) {
      return NextResponse.json({ error: "Empty response from DKIM service" }, { status: 500 });
    }
    const data = JSON.parse(text) as Record<string, unknown>;
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    return NextResponse.json(mapDkimKey(data), { status: response.status });
  } catch (error) {
    console.error("Failed to generate DKIM key:", error);
    return NextResponse.json({ error: "Failed to generate DKIM key" }, { status: 500 });
  }
}
