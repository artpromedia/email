import { NextResponse } from "next/server";

/**
 * GET /api/v1/user/settings/preferences
 * Return user preferences (defaults).
 * The page expects { preferences: Preferences } matching the Preferences interface:
 *   display, language, email, compose
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
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dateFormat: "MM/DD/YYYY",
        timeFormat: "12h",
      },
      email: {
        defaultReplyAll: false,
        confirmDelete: true,
        showImages: true,
        conversationView: true,
        previewPane: "right",
        markReadDelay: 3,
      },
      compose: {
        defaultFont: "Arial",
        defaultFontSize: 14,
        includeOriginal: true,
        signatureEnabled: false,
      },
    },
  });
}
