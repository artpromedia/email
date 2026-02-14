// ─── Plans ───────────────────────────────────────────────────────────────────

export interface PlanLimits {
  emails_per_month: number;
  emails_per_day: number;
  max_domains: number;
  max_api_keys: number;
  max_webhooks: number;
  max_templates: number;
  max_team_members: number;
  max_contacts: number;
}

export interface PlanFeatures {
  custom_tracking_domain: boolean;
  dedicated_ip: boolean;
  priority_support: boolean;
  sso: boolean;
  audit_log: boolean;
  sla: boolean;
}

export interface Plan {
  id: string;
  slug: "free" | "pro" | "business" | "enterprise";
  name: string;
  description: string;
  price_monthly: number; // cents
  price_yearly: number; // cents
  stripe_price_monthly: string | null;
  stripe_price_yearly: string | null;
  limits: PlanLimits;
  features: PlanFeatures;
  overage_enabled: boolean;
  overage_price_per_1000: number; // cents
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "paused"
  | "unpaid";

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  plan: Plan;
  status: SubscriptionStatus;
  billing_interval: "monthly" | "yearly";
  current_period_start: string;
  current_period_end: string;
  trial_start?: string;
  trial_end?: string;
  cancel_at?: string;
  canceled_at?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  created_at: string;
  updated_at: string;
}

// ─── Usage ───────────────────────────────────────────────────────────────────

export interface UsageRecord {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  emails_sent: number;
  emails_delivered: number;
  emails_bounced: number;
  emails_opened: number;
  emails_clicked: number;
  plan_limit: number;
  overage_count: number;
  overage_cost: number;
}

export interface DailyUsage {
  usage_date: string;
  emails_sent: number;
  emails_delivered: number;
  emails_bounced: number;
  api_calls: number;
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";

export interface Invoice {
  id: string;
  organization_id: string;
  status: InvoiceStatus;
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  period_start: string;
  period_end: string;
  due_date?: string;
  paid_at?: string;
  invoice_url?: string;
  invoice_pdf?: string;
  created_at: string;
}

// ─── Console API Key (customer-facing) ───────────────────────────────────────

export interface ConsoleApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit: number;
  daily_limit: number;
  is_active: boolean;
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
}

export interface ConsoleDomain {
  id: string;
  name: string;
  status: string;
  mx_verified: boolean;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_verified: boolean;
  created_at: string;
  verified_at?: string;
}

// ─── Console Dashboard ──────────────────────────────────────────────────────

export interface ConsoleOverview {
  plan: Plan;
  subscription: Subscription;
  usage: {
    emails_sent_today: number;
    emails_sent_this_month: number;
    daily_limit: number;
    monthly_limit: number;
  };
  domains_count: number;
  api_keys_count: number;
  delivery_rate: number;
}
