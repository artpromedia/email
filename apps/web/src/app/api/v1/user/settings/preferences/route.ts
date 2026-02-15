import { NextResponse } from "next/server";

/**
 * GET /api/v1/user/settings/preferences
 * Return user preferences (defaults).
 * The page expects { preferences: Preferences }
 */
export function GET() {
  return NextResponse.json({
    preferences: {
      display: {
        theme: "system",
        density: "comfortable",
        fontSize: "medium",
      },
      language: {
        locale: "en-US",
        timezone: "UTC",
        dateFormat: "MMM d, yyyy",
        timeFormat: "12h",
      },
      reading: {
        conversationView: true,
        showExternalImages: true,
        confirmDelete: true,
        previewPane: "right",
      },
      composing: {
        defaultReplyAll: false,
        includeOriginal: true,
        signatureEnabled: true,
      },
    },
  });
}
