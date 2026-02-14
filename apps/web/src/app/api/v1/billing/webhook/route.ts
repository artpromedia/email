import { createHmac } from "crypto";
import { type NextRequest, NextResponse } from "next/server";

const STRIPE_WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";
const DB_API_URL = process.env["TRANSACTIONAL_API_URL"] ?? "http://transactional-api:8085";
const ADMIN_API_KEY = process.env["ADMIN_API_KEY"] ?? "";

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  metadata: { org_id?: string; plan?: string; user_id?: string };
  items: {
    data: {
      price: { id: string; product: string };
    }[];
  };
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  trial_start: number | null;
  trial_end: number | null;
}

interface StripeInvoice {
  id: string;
  customer: string;
  subscription: string;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  period_start: number;
  period_end: number;
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
  lines: {
    data: {
      description: string;
      amount: number;
      price: { id: string };
    }[];
  };
  metadata: { org_id?: string };
}

function verifyStripeSignature(payload: string, signature: string, secret: string): boolean {
  const parts = signature.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.replace("t=", "");
  const v1Sig = parts.find((p) => p.startsWith("v1="))?.replace("v1=", "");

  if (!timestamp || !v1Sig) return false;

  // Check timestamp is within 5 minutes
  const diff = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (diff > 300) return false;

  const hmac = createHmac("sha256", secret);
  hmac.update(`${timestamp}.${payload}`);
  const expected = hmac.digest("hex");

  return expected === v1Sig;
}

async function dbQuery(
  query: string,
  params: unknown[]
): Promise<{ rows: Record<string, unknown>[] }> {
  const res = await fetch(`${DB_API_URL}/api/v1/admin/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": ADMIN_API_KEY,
    },
    body: JSON.stringify({ query, params }),
  });
  return res.json() as Promise<{ rows: Record<string, unknown>[] }>;
}

function fromUnix(ts: number | null): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

// Plan resolution from Stripe Price ID
const PRICE_TO_PLAN: Record<string, string> = {
  [process.env["STRIPE_PRICE_PRO_MONTHLY"] ?? "price_pro_monthly"]: "pro",
  [process.env["STRIPE_PRICE_PRO_YEARLY"] ?? "price_pro_yearly"]: "pro",
  [process.env["STRIPE_PRICE_BUSINESS_MONTHLY"] ?? "price_business_monthly"]: "business",
  [process.env["STRIPE_PRICE_BUSINESS_YEARLY"] ?? "price_business_yearly"]: "business",
};

async function handleCheckoutCompleted(session: Record<string, unknown>): Promise<void> {
  const metadata = session["metadata"] as {
    org_id?: string;
    plan?: string;
    user_id?: string;
  };
  const orgId = metadata.org_id;
  const planSlug = metadata.plan;
  const stripeCustomerId = session["customer"] as string;
  const stripeSubscriptionId = session["subscription"] as string;

  if (!orgId || !planSlug) {
    console.error("Missing org_id or plan in checkout session metadata");
    return;
  }

  // Get plan ID from slug
  const planResult = await dbQuery("SELECT id FROM plans WHERE slug = $1", [planSlug]);
  const planId = planResult.rows[0]?.["id"] as string | undefined;
  if (!planId) {
    console.error("Plan not found:", planSlug);
    return;
  }

  // Upsert subscription
  await dbQuery(
    `INSERT INTO subscriptions (org_id, plan_id, stripe_customer_id, stripe_subscription_id, status, billing_interval, current_period_start, current_period_end)
     VALUES ($1, $2, $3, $4, 'active', 'monthly', NOW(), NOW() + INTERVAL '1 month')
     ON CONFLICT (org_id) DO UPDATE SET
       plan_id = $2,
       stripe_customer_id = $3,
       stripe_subscription_id = $4,
       status = 'active',
       updated_at = NOW()`,
    [orgId, planId, stripeCustomerId, stripeSubscriptionId]
  );

  // Update org plan
  await dbQuery(
    `UPDATE organizations SET plan = $1, subscription_tier = $1, updated_at = NOW() WHERE id = $2`,
    [planSlug, orgId]
  );

  console.info(
    `Subscription activated: org=${orgId} plan=${planSlug} customer=${stripeCustomerId}`
  );
}

async function handleSubscriptionUpdated(sub: StripeSubscription): Promise<void> {
  const orgId = sub.metadata.org_id;
  if (!orgId) return;

  const priceId = sub.items.data[0]?.price.id;
  const planSlug = priceId ? PRICE_TO_PLAN[priceId] : undefined;

  await dbQuery(
    `UPDATE subscriptions SET
       status = $1,
       current_period_start = $2,
       current_period_end = $3,
       cancel_at_period_end = $4,
       canceled_at = $5,
       trial_start = $6,
       trial_end = $7,
       updated_at = NOW()
     WHERE stripe_subscription_id = $8`,
    [
      sub.status,
      fromUnix(sub.current_period_start),
      fromUnix(sub.current_period_end),
      sub.cancel_at_period_end,
      fromUnix(sub.canceled_at),
      fromUnix(sub.trial_start),
      fromUnix(sub.trial_end),
      sub.id,
    ]
  );

  // If plan changed, update org
  if (planSlug) {
    await dbQuery(
      `UPDATE organizations SET plan = $1, subscription_tier = $1, updated_at = NOW()
       WHERE id = $2`,
      [planSlug, orgId]
    );
  }

  // If subscription ended, downgrade to free
  if (sub.status === "canceled" || sub.status === "unpaid") {
    await dbQuery(
      `UPDATE organizations SET plan = 'free', subscription_tier = 'free', updated_at = NOW()
       WHERE id = $1`,
      [orgId]
    );
  }
}

async function handleSubscriptionDeleted(sub: StripeSubscription): Promise<void> {
  const orgId = sub.metadata.org_id;
  if (!orgId) return;

  await dbQuery(
    `UPDATE subscriptions SET status = 'canceled', updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [sub.id]
  );

  // Downgrade to free
  await dbQuery(
    `UPDATE organizations SET plan = 'free', subscription_tier = 'free', updated_at = NOW()
     WHERE id = $1`,
    [orgId]
  );

  console.info(`Subscription canceled: org=${orgId}`);
}

async function handleInvoicePaid(invoice: StripeInvoice): Promise<void> {
  const orgId = invoice.metadata.org_id;
  if (!orgId) return;

  await dbQuery(
    `INSERT INTO invoices (org_id, stripe_invoice_id, amount_due, amount_paid, currency, status, period_start, period_end, invoice_pdf, hosted_invoice_url, line_items)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (stripe_invoice_id) DO UPDATE SET
       status = $6,
       amount_paid = $4,
       updated_at = NOW()`,
    [
      orgId,
      invoice.id,
      invoice.amount_due,
      invoice.amount_paid,
      invoice.currency,
      invoice.status,
      fromUnix(invoice.period_start),
      fromUnix(invoice.period_end),
      invoice.invoice_pdf,
      invoice.hosted_invoice_url,
      JSON.stringify(invoice.lines.data),
    ]
  );
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature") ?? "";

    // Verify webhook signature
    if (STRIPE_WEBHOOK_SECRET) {
      const isValid = verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
      if (!isValid) {
        console.error("Invalid Stripe webhook signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
      }
    }

    const event = JSON.parse(rawBody) as StripeEvent;
    console.info(`Stripe webhook: ${event.type} (${event.id})`);

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as unknown as StripeSubscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as unknown as StripeSubscription);
        break;

      case "invoice.paid":
        await handleInvoicePaid(event.data.object as unknown as StripeInvoice);
        break;

      case "invoice.payment_failed":
        console.warn("Payment failed:", event.data.object["id"]);
        break;

      default:
        console.info(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
