-- ============================================================================
-- SaaS Billing Schema for OonruMail
-- Plans, Subscriptions, Usage Metering, Invoices
-- ============================================================================

-- ─── Plans ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          VARCHAR(50) UNIQUE NOT NULL,       -- 'free', 'pro', 'business', 'enterprise'
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  monthly_price INTEGER NOT NULL DEFAULT 0,         -- cents (e.g. 2000 = $20.00)
  yearly_price  INTEGER,                            -- cents, null = no yearly option
  stripe_price_id_monthly VARCHAR(100),             -- Stripe Price ID
  stripe_price_id_yearly  VARCHAR(100),

  -- Limits
  emails_per_month    INTEGER NOT NULL DEFAULT 3000,
  emails_per_day      INTEGER NOT NULL DEFAULT 100,
  max_domains         INTEGER NOT NULL DEFAULT 1,
  max_api_keys        INTEGER NOT NULL DEFAULT 2,
  max_webhooks        INTEGER NOT NULL DEFAULT 1,
  max_templates       INTEGER NOT NULL DEFAULT 5,
  max_team_members    INTEGER NOT NULL DEFAULT 1,
  max_contacts        INTEGER NOT NULL DEFAULT 100,

  -- Features (JSONB for flexibility)
  features JSONB NOT NULL DEFAULT '{
    "analytics": "basic",
    "webhooks": false,
    "custom_tracking_domain": false,
    "dedicated_ip": false,
    "email_validation": false,
    "priority_support": false,
    "sla": false,
    "template_editor": false,
    "inbound_parse": false
  }',

  -- Overage
  overage_rate      INTEGER DEFAULT 0,              -- cents per 1000 emails over limit
  overage_enabled   BOOLEAN DEFAULT false,

  is_active     BOOLEAN DEFAULT true,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── Subscriptions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id           UUID NOT NULL REFERENCES plans(id),

  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused', 'unpaid')),

  -- Stripe integration
  stripe_customer_id      VARCHAR(100),
  stripe_subscription_id  VARCHAR(100),

  -- Billing period
  billing_interval  VARCHAR(10) DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,

  -- Trial
  trial_start   TIMESTAMPTZ,
  trial_end     TIMESTAMPTZ,

  -- Cancellation
  cancel_at           TIMESTAMPTZ,
  canceled_at         TIMESTAMPTZ,
  cancellation_reason TEXT,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE(organization_id)
);

-- ─── Usage Metering ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usage_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Period
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,

  -- Counts
  emails_sent       INTEGER DEFAULT 0,
  emails_delivered  INTEGER DEFAULT 0,
  emails_bounced    INTEGER DEFAULT 0,
  emails_opened     INTEGER DEFAULT 0,
  emails_clicked    INTEGER DEFAULT 0,

  -- Limit info (snapshot from plan at period start)
  plan_limit        INTEGER NOT NULL,
  overage_count     INTEGER DEFAULT 0,
  overage_cost      INTEGER DEFAULT 0,          -- cents

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE(organization_id, period_start)
);

-- Daily usage for real-time metering
CREATE TABLE IF NOT EXISTS daily_usage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  usage_date        DATE NOT NULL DEFAULT CURRENT_DATE,

  emails_sent       INTEGER DEFAULT 0,
  emails_delivered  INTEGER DEFAULT 0,
  emails_bounced    INTEGER DEFAULT 0,
  api_calls         INTEGER DEFAULT 0,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),

  UNIQUE(organization_id, usage_date)
);

-- ─── Invoices ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id   UUID REFERENCES subscriptions(id),

  stripe_invoice_id VARCHAR(100),

  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),

  subtotal      INTEGER NOT NULL DEFAULT 0,       -- cents
  tax           INTEGER DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  amount_paid   INTEGER DEFAULT 0,
  amount_due    INTEGER DEFAULT 0,

  currency      VARCHAR(3) DEFAULT 'usd',

  period_start  TIMESTAMPTZ,
  period_end    TIMESTAMPTZ,
  due_date      TIMESTAMPTZ,
  paid_at       TIMESTAMPTZ,

  invoice_url   TEXT,
  invoice_pdf   TEXT,

  line_items JSONB DEFAULT '[]',

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_usage_records_org_period ON usage_records(organization_id, period_start);
CREATE INDEX IF NOT EXISTS idx_daily_usage_org_date ON daily_usage(organization_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe ON invoices(stripe_invoice_id);

-- ─── Seed Plans ──────────────────────────────────────────────────────────────

INSERT INTO plans (slug, name, description, monthly_price, yearly_price, emails_per_month, emails_per_day, max_domains, max_api_keys, max_webhooks, max_templates, max_team_members, max_contacts, features, overage_rate, overage_enabled, sort_order)
VALUES
  (
    'free', 'Free', 'Get started with transactional email',
    0, NULL,
    3000, 100, 1, 2, 1, 5, 1, 100,
    '{"analytics": "basic", "webhooks": false, "custom_tracking_domain": false, "dedicated_ip": false, "email_validation": false, "priority_support": false, "sla": false, "template_editor": true, "inbound_parse": false}',
    0, false, 0
  ),
  (
    'pro', 'Pro', 'For growing applications and startups',
    2000, 19200,
    50000, 2000, 5, 10, 5, 50, 5, 10000,
    '{"analytics": "full", "webhooks": true, "custom_tracking_domain": true, "dedicated_ip": false, "email_validation": true, "priority_support": false, "sla": false, "template_editor": true, "inbound_parse": false}',
    100, true, 1
  ),
  (
    'business', 'Business', 'For scaling businesses with high volume',
    7500, 72000,
    200000, 10000, 25, 50, 25, 200, 20, 100000,
    '{"analytics": "full", "webhooks": true, "custom_tracking_domain": true, "dedicated_ip": true, "email_validation": true, "priority_support": true, "sla": false, "template_editor": true, "inbound_parse": true}',
    75, true, 2
  ),
  (
    'enterprise', 'Enterprise', 'Custom solutions for large organizations',
    0, NULL,
    0, 0, 0, 0, 0, 0, 0, 0,
    '{"analytics": "full", "webhooks": true, "custom_tracking_domain": true, "dedicated_ip": true, "email_validation": true, "priority_support": true, "sla": true, "template_editor": true, "inbound_parse": true}',
    0, false, 3
  )
ON CONFLICT (slug) DO NOTHING;
