/**
 * Mail Emails API Route
 * Fetches emails from the IMAP server
 */

import { NextResponse } from "next/server";

const IMAP_API_URL = process.env.IMAP_API_URL || "http://imap-server:8084";
const TRANSACTIONAL_API_URL = process.env.TRANSACTIONAL_API_URL || "http://transactional-api:8085";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder") || "inbox";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search") || "";

    const authHeader = request.headers.get("Authorization");

    const response = await fetch(
      `${IMAP_API_URL}/api/v1/emails?folder=${folder}&page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      {
        headers: {
          Authorization: authHeader || "",
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("IMAP server error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch emails from server", emails: [], total: 0 },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching emails:", error);
    return NextResponse.json(
      { error: "Email service unavailable", emails: [], total: 0 },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get("Authorization");

    const response = await fetch(`${TRANSACTIONAL_API_URL}/v1/emails/send`, {
      method: "POST",
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Send email error:", errorText);
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error sending email:", error);
    return NextResponse.json(
      { error: "Email service unavailable" },
      { status: 503 }
    );
  }
}
