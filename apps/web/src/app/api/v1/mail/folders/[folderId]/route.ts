/**
 * Single Folder API Route
 * Rename or delete a folder
 */
import { NextResponse } from "next/server";
import { getUserIdFromAuth } from "@/lib/mail/auth";
import {
  getUserMailboxIds,
  getFolderById,
  renameFolder,
  deleteFolder,
} from "@/lib/mail/queries";
import { toFolderResponse } from "@/lib/mail/transform";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  try {
    const { folderId } = await params;
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { name: string };
    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // Verify ownership
    const folder = await getFolderById(folderId);
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    const mailboxIds = await getUserMailboxIds(userId);
    if (!mailboxIds.includes(folder.mailboxId)) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    if (folder.specialUse) {
      return NextResponse.json({ error: "Cannot rename system folders" }, { status: 400 });
    }

    const updated = await renameFolder(folderId, body.name);
    if (!updated) {
      return NextResponse.json({ error: "Failed to rename folder" }, { status: 400 });
    }

    return NextResponse.json(toFolderResponse(updated));
  } catch (error) {
    console.error("Error renaming folder:", error);
    return NextResponse.json({ error: "Failed to rename folder" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> }
) {
  try {
    const { folderId } = await params;
    const authHeader = request.headers.get("Authorization");
    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify ownership
    const folder = await getFolderById(folderId);
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    const mailboxIds = await getUserMailboxIds(userId);
    if (!mailboxIds.includes(folder.mailboxId)) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    if (folder.specialUse) {
      return NextResponse.json({ error: "Cannot delete system folders" }, { status: 400 });
    }

    const deleted = await deleteFolder(folderId);
    if (!deleted) {
      return NextResponse.json({ error: "Failed to delete folder" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting folder:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
