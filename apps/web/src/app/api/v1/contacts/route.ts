/**
 * Contacts API Route
 * Fetches and manages user contacts
 */

import { NextResponse } from "next/server";

const CONTACTS_API_URL = process.env.CONTACTS_API_URL || "http://contacts:8083";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search") || "";
    const group = searchParams.get("group") || "";

    const authHeader = request.headers.get("Authorization");

    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (search) queryParams.set("search", search);
    if (group) queryParams.set("group", group);

    const response = await fetch(`${CONTACTS_API_URL}/api/v1/contacts?${queryParams.toString()}`, {
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Contacts service error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch contacts", contacts: [], total: 0 },
        { status: response.status }
      );
    }

    const data: unknown = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return NextResponse.json(
      { error: "Contacts service unavailable", contacts: [], total: 0 },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const authHeader = request.headers.get("Authorization");

    const response = await fetch(`${CONTACTS_API_URL}/api/v1/contacts`, {
      method: "POST",
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Create contact error:", errorText);
      return NextResponse.json({ error: "Failed to create contact" }, { status: response.status });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating contact:", error);
    return NextResponse.json({ error: "Contacts service unavailable" }, { status: 503 });
  }
}
