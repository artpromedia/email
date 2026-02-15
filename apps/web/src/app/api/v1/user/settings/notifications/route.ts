import { NextResponse } from "next/server";

/**
 * GET /api/v1/user/settings/notifications
 * Return user notification settings (defaults).
 * The page expects { settings: NotificationSettings }
 */
export function GET() {
  return NextResponse.json({
    settings: {
      email: {
        newMessages: true,
        mentions: true,
        replies: true,
        digest: "daily",
      },
      push: {
        enabled: false,
        newMessages: false,
        mentions: false,
        calendarReminders: false,
      },
      chat: {
        directMessages: true,
        groupMentions: true,
        channelUpdates: false,
      },
      calendar: {
        reminders: true,
        invitations: true,
        changes: true,
      },
    },
  });
}
