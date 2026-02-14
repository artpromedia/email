/**
 * Calendar Events API Route
 * Fetches and manages calendar events
 */

import { NextResponse } from "next/server";

const CALENDAR_API_URL = process.env["CALENDAR_API_URL"] || "http://calendar:8082";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const authHeader = request.headers.get("Authorization");

    const queryParams = new URLSearchParams();
    if (start) queryParams.set("start", start);
    if (end) queryParams.set("end", end);

    const url = `${CALENDAR_API_URL}/api/v1/events${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

    const response = await fetch(url, {
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Calendar service error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch events", events: [] },
        { status: response.status }
      );
    }

    const data: unknown = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return NextResponse.json(
      { error: "Calendar service unavailable", events: [] },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const authHeader = request.headers.get("Authorization");

    const response = await fetch(`${CALENDAR_API_URL}/api/v1/events`, {
      method: "POST",
      headers: {
        Authorization: authHeader || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Create event error:", errorText);
      return NextResponse.json({ error: "Failed to create event" }, { status: response.status });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating calendar event:", error);
    return NextResponse.json({ error: "Calendar service unavailable" }, { status: 503 });
  }
}
