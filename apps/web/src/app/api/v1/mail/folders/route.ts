/**
 * Mail Folders API Route
 * Fetches email folders/labels from IMAP server
 */

import { NextResponse } from "next/server";

const IMAP_API_URL = process.env.IMAP_API_URL || "http://imap-server:8084";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");

    const response = await fetch(`${IMAP_API_URL}/api/v1/folders`, {
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("IMAP folders error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch folders", folders: [] },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching folders:", error);
    return NextResponse.json(
      { error: "Folder service unavailable", folders: [] },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get("Authorization");

    const response = await fetch(`${IMAP_API_URL}/api/v1/folders`, {
      method: "POST",
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Create folder error:", errorText);
      return NextResponse.json(
        { error: "Failed to create folder" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating folder:", error);
    return NextResponse.json(
      { error: "Folder service unavailable" },
      { status: 503 }
    );
  }
}
