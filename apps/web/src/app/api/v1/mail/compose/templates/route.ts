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

interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  variables: string[];
  isPublic: boolean;
  createdBy: string;
  createdAt?: string;
}

// In-memory template storage (in production, use database)
const templateStore = new Map<string, EmailTemplate>();

// Initialize with default templates
const defaultTemplates: EmailTemplate[] = [
  {
    id: "1",
    name: "Welcome Email",
    category: "onboarding",
    subject: "Welcome to {{company_name}}!",
    body: "<h1>Welcome!</h1><p>We're excited to have you on board.</p>",
    variables: ["company_name", "user_name"],
    isPublic: true,
    createdBy: "system",
  },
  {
    id: "2",
    name: "Meeting Request",
    category: "meeting",
    subject: "Meeting Request: {{meeting_topic}}",
    body: "<p>I'd like to schedule a meeting to discuss {{meeting_topic}}.</p>",
    variables: ["meeting_topic", "date", "time"],
    isPublic: true,
    createdBy: "system",
  },
  {
    id: "3",
    name: "Follow Up",
    category: "sales",
    subject: "Following up on {{topic}}",
    body: "<p>I wanted to follow up on our recent conversation about {{topic}}.</p>",
    variables: ["topic", "contact_name"],
    isPublic: false,
    createdBy: "system",
  },
];

defaultTemplates.forEach((t) => templateStore.set(t.id, t));

/**
 * Fetch templates from storage for a user
 */
function fetchUserTemplates(userId: string, category?: string | null): EmailTemplate[] {
  const allTemplates = Array.from(templateStore.values());
  // Return public templates and user's own templates
  const userTemplates = allTemplates.filter((t) => t.isPublic || t.createdBy === userId);
  if (category) {
    return userTemplates.filter((t) => t.category === category);
  }
  return userTemplates;
}

/**
 * Save template to storage
 */
function saveTemplate(template: EmailTemplate): void {
  templateStore.set(template.id, template);
  // In production: await db.insert(templates).values(template);
}

/**
 * GET /api/v1/mail/compose/templates
 * Get email templates for the authenticated user
 */
export function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    // Extract user from JWT token
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Fetch templates from database
    const templates = fetchUserTemplates(userId, category);

    return NextResponse.json({
      templates,
      total: templates.length,
      categories: ["onboarding", "meeting", "sales", "support", "notification"],
    });
  } catch (error) {
    console.error("Error fetching templates:", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

/**
 * POST /api/v1/mail/compose/templates
 * Create a new email template
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      name?: string;
      category?: string;
      subject?: string;
      body?: string;
      variables?: string[];
      isPublic?: boolean;
    };
    const { name, category, subject, body: templateBody, variables, isPublic = false } = body;

    if (!name || !subject || !templateBody) {
      return NextResponse.json({ error: "Name, subject, and body are required" }, { status: 400 });
    }

    // Extract user from JWT token
    const userId = extractUserIdFromToken(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Save template to database
    const template: EmailTemplate = {
      id: Date.now().toString(),
      name,
      category: category ?? "uncategorized",
      subject,
      body: templateBody,
      variables: variables ?? [],
      isPublic,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };

    saveTemplate(template);
    console.info("Template created:", { id: template.id, name });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Error creating template:", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
