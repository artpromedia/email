import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/v1/mail/compose/templates
 * Get email templates for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    // TODO: Extract user from JWT token
    const userId = "user-id-placeholder";

    // TODO: Fetch templates from database
    const templates = [
      {
        id: "1",
        name: "Welcome Email",
        category: "onboarding",
        subject: "Welcome to {{company_name}}!",
        body: "<h1>Welcome!</h1><p>We're excited to have you on board.</p>",
        variables: ["company_name", "user_name"],
        isPublic: true,
        createdBy: userId,
      },
      {
        id: "2",
        name: "Meeting Request",
        category: "meeting",
        subject: "Meeting Request: {{meeting_topic}}",
        body: "<p>I'd like to schedule a meeting to discuss {{meeting_topic}}.</p>",
        variables: ["meeting_topic", "date", "time"],
        isPublic: true,
        createdBy: userId,
      },
      {
        id: "3",
        name: "Follow Up",
        category: "sales",
        subject: "Following up on {{topic}}",
        body: "<p>I wanted to follow up on our recent conversation about {{topic}}.</p>",
        variables: ["topic", "contact_name"],
        isPublic: false,
        createdBy: userId,
      },
    ];

    const filteredTemplates = category
      ? templates.filter((t) => t.category === category)
      : templates;

    return NextResponse.json({
      templates: filteredTemplates,
      total: filteredTemplates.length,
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

    const body = await request.json();
    const { name, category, subject, body: templateBody, variables, isPublic = false } = body;

    if (!name || !subject || !templateBody) {
      return NextResponse.json({ error: "Name, subject, and body are required" }, { status: 400 });
    }

    // TODO: Extract user from JWT token
    const userId = "user-id-placeholder";

    // TODO: Save template to database
    const template = {
      id: Date.now().toString(),
      name,
      category: category || "uncategorized",
      subject,
      body: templateBody,
      variables: variables || [],
      isPublic,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };

    console.log("Template created:", { id: template.id, name });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Error creating template:", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
