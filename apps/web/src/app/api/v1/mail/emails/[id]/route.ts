/**
 * Single Email API Route
 * Get, update, or delete a specific email
 */

import { NextResponse } from "next/server";

const IMAP_API_URL = process.env["IMAP_API_URL"] || "http://imap-server:8084";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get("Authorization");

    const response = await fetch(`${IMAP_API_URL}/api/v1/emails/${id}`, {
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data: unknown = await response.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Email not found", email: null }, { status: 404 });
  } catch (error) {
    console.error("Error fetching email:", error);
    return NextResponse.json({ error: "Failed to fetch email", email: null }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const authHeader = request.headers.get("Authorization");

    const response = await fetch(`${IMAP_API_URL}/api/v1/emails/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data: unknown = await response.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Failed to update email" }, { status: response.status });
  } catch (error) {
    console.error("Error updating email:", error);
    return NextResponse.json({ error: "Failed to update email" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get("Authorization");

    const response = await fetch(`${IMAP_API_URL}/api/v1/emails/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      return NextResponse.json({ success: true, message: "Email deleted" });
    }

    return NextResponse.json({ error: "Failed to delete email" }, { status: response.status });
  } catch (error) {
    console.error("Error deleting email:", error);
    return NextResponse.json({ error: "Failed to delete email" }, { status: 500 });
  }
}
