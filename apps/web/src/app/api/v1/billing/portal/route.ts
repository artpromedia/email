import { type NextRequest, NextResponse } from "next/server";

const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"] ?? "";
const STRIPE_API = "https://api.stripe.com/v1";

async function stripeRequest(endpoint: string, body: Record<string, string>): Promise<Response> {
  return fetch(`${STRIPE_API}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${STRIPE_SECRET_KEY}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user session
    const authUrl = process.env["AUTH_SERVICE_URL"] ?? "http://auth:8081";
    const authRes = await fetch(`${authUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!authRes.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = (await authRes.json()) as {
      organization_id: string;
    };

    const body = (await req.json()) as { return_url: string };

    // Get stripe_customer_id from subscriptions table
    const apiUrl = process.env["TRANSACTIONAL_API_URL"] ?? "http://transactional-api:8085";
    const adminKey = process.env["ADMIN_API_KEY"] ?? "";
    const pgRes = await fetch(`${apiUrl}/api/v1/admin/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": adminKey,
      },
      body: JSON.stringify({
        query:
          "SELECT stripe_customer_id FROM subscriptions WHERE org_id = $1 AND status = 'active' LIMIT 1",
        params: [user.organization_id],
      }),
    });

    let stripeCustomerId = "";
    if (pgRes.ok) {
      const data = (await pgRes.json()) as {
        rows: { stripe_customer_id: string }[];
      };
      if (data.rows.length > 0 && data.rows[0]) {
        stripeCustomerId = data.rows[0].stripe_customer_id;
      }
    }

    if (!stripeCustomerId) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 404 });
    }

    // Create Stripe Customer Portal session
    const portalRes = await stripeRequest("/billing_portal/sessions", {
      customer: stripeCustomerId,
      return_url: body.return_url,
    });

    if (!portalRes.ok) {
      const err = await portalRes.text();
      console.error("Stripe portal error:", err);
      return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 });
    }

    const session = (await portalRes.json()) as { url: string };
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Portal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
