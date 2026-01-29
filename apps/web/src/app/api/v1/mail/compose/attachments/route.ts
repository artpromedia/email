import { randomBytes } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/v1/mail/compose/attachments
 * Upload email attachments
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file size (max 25MB)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File size exceeds 25MB limit" }, { status: 413 });
    }

    // TODO: Extract user from JWT token
    const userId = "user-id-placeholder";

    // Generate unique filename
    const fileId = randomBytes(16).toString("hex");
    const extension = file.name.split(".").pop();
    const filename = `${fileId}.${extension}`;

    // TODO: Upload to MinIO/S3 instead of local filesystem
    const uploadDir = join(process.cwd(), "uploads", "attachments", userId);
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = join(uploadDir, filename);
    await writeFile(filePath, buffer);

    const attachment = {
      id: fileId,
      filename: file.name,
      contentType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      url: `/api/v1/mail/compose/attachments/${fileId}`,
    };

    console.info("Attachment uploaded:", {
      id: fileId,
      filename: file.name,
      size: file.size,
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Error uploading attachment:", error);
    return NextResponse.json({ error: "Failed to upload attachment" }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/mail/compose/attachments/:id
 * Delete an attachment
 */
export function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Attachment ID is required" }, { status: 400 });
    }

    // TODO: Extract user from JWT token
    const _userId = "user-id-placeholder";

    // TODO: Delete from MinIO/S3
    console.info("Attachment deleted:", { id });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
