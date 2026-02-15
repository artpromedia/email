/**
 * Bulk permanent delete emails
 * DELETE /api/v1/mail/emails/permanent
 */
import { NextResponse } from "next/server";
import { getUserIdFromAuth } from "@/lib/mail/auth";
import { deleteMessages } from "@/lib/mail/queries";

export async function DELETE(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { emailIds: string[] };
    if (!body.emailIds || body.emailIds.length === 0) {
      return NextResponse.json({ error: "No email IDs provided" }, { status: 400 });
    }

    const count = await deleteMessages(body.emailIds);
    return NextResponse.json({ success: true, deleted: count });
  } catch (error) {
    console.error("Error permanently deleting emails:", error);
    return NextResponse.json({ error: "Failed to delete emails" }, { status: 500 });
  }
}
