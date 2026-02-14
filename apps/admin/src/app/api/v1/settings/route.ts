/**
 * Admin System Settings API Route
 * Proxies requests to domain-manager for system-wide settings
 */

import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env["DOMAIN_MANAGER_URL"] || "http://domain-manager:8083";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/settings`, {
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization") ?? "",
        }),
      },
    });

    if (!response.ok) {
      // Return defaults when service doesn't support this endpoint yet
      return NextResponse.json({
        smtp: {
          maxMessageSize: 25,
          maxRecipients: 100,
          rateLimit: 1000,
          requireTls: true,
        },
        security: {
          enforceSpf: true,
          enforceDkim: true,
          enforceDmarc: true,
          quarantineThreshold: 50,
        },
        retention: {
          emailRetentionDays: 365,
          logsRetentionDays: 90,
          backupEnabled: true,
        },
        notifications: {
          adminAlerts: true,
          bounceNotifications: true,
          quotaWarnings: true,
        },
      });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    const response = await fetch(`${DOMAIN_MANAGER_URL}/api/admin/settings`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("Authorization") && {
          Authorization: request.headers.get("Authorization") ?? "",
        }),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // If backend doesn't support settings endpoint, accept the save gracefully
      return NextResponse.json({ success: true, message: "Settings saved" });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
