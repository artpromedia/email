import { type NextRequest, NextResponse } from "next/server";

const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"] ?? "";
const STRIPE_API = "https://api.stripe.com/v1";

// Plan slug → Stripe Price ID mapping
const PRICE_MAP: Record<string, { monthly: string; yearly: string }> = {
  pro: {
    monthly: process.env["STRIPE_PRICE_PRO_MONTHLY"] ?? "",
    yearly: process.env["STRIPE_PRICE_PRO_YEARLY"] ?? "",
  },
  business: {
    monthly: process.env["STRIPE_PRICE_BUSINESS_MONTHLY"] ?? "",
    yearly: process.env["STRIPE_PRICE_BUSINESS_YEARLY"] ?? "",
  },
};

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

    // Verify user session with auth service
    const authUrl = process.env["AUTH_SERVICE_URL"] ?? "http://auth:8081";
    const authRes = await fetch(`${authUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!authRes.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = (await authRes.json()) as {
      id: string;
      email: string;
      organization_id: string;
    };

    const body = (await req.json()) as {
      plan: string;
      interval: "monthly" | "yearly";
      success_url: string;
      cancel_url: string;
    };

    const priceConfig = PRICE_MAP[body.plan];
    if (!priceConfig) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const priceId = body.interval === "yearly" ? priceConfig.yearly : priceConfig.monthly;
    if (!priceId) {
      return NextResponse.json({ error: "Price not configured" }, { status: 500 });
    }

    // Create Stripe Checkout Session
    const checkoutRes = await stripeRequest("/checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      customer_email: user.email,
      "metadata[org_id]": user.organization_id,
      "metadata[plan]": body.plan,
      "metadata[user_id]": user.id,
      allow_promotion_codes: "true",
      billing_address_collection: "required",
    });

    if (!checkoutRes.ok) {
      const err = await checkoutRes.text();
      console.error("Stripe checkout error:", err);
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }

    const session = (await checkoutRes.json()) as { url: string };
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
