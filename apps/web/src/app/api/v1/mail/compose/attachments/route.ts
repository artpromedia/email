import { randomBytes } from "node:crypto";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Extract user ID from JWT token in authorization header
 */
function extractUserIdFromToken(authHeader: string): string | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64").toString()) as {
      sub?: string;
      userId?: string;
    };
    return payload.sub ?? payload.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Get storage path for attachments
 * In production, this would return MinIO/S3 bucket path
 */
function getStoragePath(userId: string): string {
  const storageBase =
    process.env["ATTACHMENT_STORAGE_PATH"] ?? join(process.cwd(), "uploads", "attachments");
  return join(storageBase, userId);
}

/**
 * Upload file to storage (local filesystem, MinIO/S3 in production)
 */
async function uploadToStorage(userId: string, filename: string, buffer: Buffer): Promise<string> {
  const uploadDir = getStoragePath(userId);
  await mkdir(uploadDir, { recursive: true });
  const filePath = join(uploadDir, filename);
  await writeFile(filePath, buffer);
  // In production with MinIO/S3:
  // await minioClient.putObject('attachments', `${userId}/${filename}`, buffer);
  return filePath;
}

/**
 * Delete file from storage
 */
async function deleteFromStorage(userId: string, filename: string): Promise<void> {
  const filePath = join(getStoragePath(userId), filename);
  try {
    await unlink(filePath);
  } catch {
    // File may not exist, which is fine
  }
  // In production with MinIO/S3:
  // await minioClient.removeObject('attachments', `${userId}/${filename}`);
}

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

    // Extract user from JWT token
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Generate unique filename
    const fileId = randomBytes(16).toString("hex");
    const extension = file.name.split(".").pop();
    const filename = `${fileId}.${extension}`;

    // Upload to storage (local filesystem or MinIO/S3)
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadToStorage(userId, filename, buffer);

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
export async function DELETE(request: NextRequest) {
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

    // Extract user from JWT token
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Delete from storage
    await deleteFromStorage(userId, `${id}.*`);
    console.info("Attachment deleted:", { id });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
