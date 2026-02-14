// ─── Common ──────────────────────────────────────────────────────────────────

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface DateRangeParams {
  start_date?: string;
  end_date?: string;
}

// ─── Send ────────────────────────────────────────────────────────────────────

export interface Attachment {
  filename: string;
  content: string;
  content_type: string;
  content_id?: string;
  disposition?: "attachment" | "inline";
}

export interface SendRequest {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  subject?: string;
  html?: string;
  text?: string;
  template_id?: string;
  substitutions?: Record<string, string>;
  categories?: string[];
  custom_args?: Record<string, string>;
  headers?: Record<string, string>;
  attachments?: Attachment[];
  send_at?: string;
  track_opens?: boolean;
  track_clicks?: boolean;
  asm_group_id?: number;
  ip_pool_name?: string;
  batch_id?: string;
}

export interface RejectedRecipient {
  email: string;
  reason: string;
  code: string;
}

export interface SendResponse {
  message_id: string;
  status: string;
  accepted: string[];
  rejected: RejectedRecipient[];
  queued_at: string;
  estimated_delivery: string;
}

export interface BatchSendRequest {
  messages: SendRequest[];
  batch_id?: string;
}

export interface BatchSendResponse {
  batch_id: string;
  total_queued: number;
  results: SendResponse[];
}

// ─── Templates ───────────────────────────────────────────────────────────────

export interface TemplateVariable {
  name: string;
  description?: string;
  type?: "string" | "number" | "date" | "array" | "object";
  required?: boolean;
  default_value?: string;
  example?: string;
}

export interface Template {
  id: string;
  domain_id: string;
  name: string;
  description: string;
  subject: string;
  html_content: string;
  text_content: string;
  variables: TemplateVariable[];
  category: string;
  tags: string[];
  metadata: Record<string, string>;
  active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateRequest {
  name: string;
  subject: string;
  description?: string;
  html_content?: string;
  text_content?: string;
  html_body?: string;
  text_body?: string;
  variables?: TemplateVariable[];
  category?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  active?: boolean;
}

export interface UpdateTemplateRequest {
  name?: string;
  subject?: string;
  description?: string;
  html_content?: string;
  text_content?: string;
  variables?: TemplateVariable[];
  category?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  active?: boolean;
}

export interface CloneTemplateRequest {
  name: string;
  description?: string;
}

export interface RenderTemplateResponse {
  subject: string;
  html: string;
  text: string;
}

export interface PreviewTemplateRequest {
  subject: string;
  html_content?: string;
  text_content?: string;
  substitutions?: Record<string, string>;
}

export interface ListTemplatesParams extends PaginationParams {
  category?: string;
  search?: string;
  active?: boolean;
}

export interface TemplateListResponse extends PaginatedResponse {
  templates: Template[];
}

export interface TemplateVersion {
  id: string;
  template_id: string;
  version: number;
  subject: string;
  html_content: string;
  text_content: string;
  variables: TemplateVariable[];
  created_at: string;
}

export interface TemplateVersionListResponse {
  versions: TemplateVersion[];
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

export type WebhookEventType =
  | "delivered"
  | "bounced"
  | "deferred"
  | "dropped"
  | "opened"
  | "clicked"
  | "spam_report"
  | "unsubscribed"
  | "processed";

export interface RetryPolicy {
  max_retries?: number;
  retry_interval?: number;
  backoff_multiplier?: number;
  max_interval?: number;
}

export interface Webhook {
  id: string;
  domain_id: string;
  url: string;
  events: WebhookEventType[];
  description: string;
  headers: Record<string, string>;
  retry_policy: RetryPolicy;
  active: boolean;
  secret?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookRequest {
  url: string;
  events: WebhookEventType[];
  description?: string;
  headers?: Record<string, string>;
  retry_policy?: RetryPolicy;
  active?: boolean;
}

export interface UpdateWebhookRequest {
  url?: string;
  events?: WebhookEventType[];
  description?: string;
  headers?: Record<string, string>;
  retry_policy?: RetryPolicy;
  active?: boolean;
}

export interface TestWebhookResponse {
  success: boolean;
  status_code: number;
  response_body: string;
  latency_ms: number;
}

export interface RotateSecretResponse {
  secret: string;
  secret_prefix: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  response_code: number;
  response_body: string;
  success: boolean;
  latency_ms: number;
  attempt: number;
  created_at: string;
}

export interface WebhookDeliveryListResponse extends PaginatedResponse {
  deliveries: WebhookDelivery[];
}

export interface ListWebhookDeliveriesParams extends PaginationParams {
  success?: boolean;
}

export interface WebhookListResponse {
  webhooks: Webhook[];
}

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  message_id: string;
  recipient: string;
  categories?: string[];
  custom_args?: Record<string, string>;
  smtp_response?: string;
  bounce_type?: string;
  bounce_code?: string;
  user_agent?: string;
  ip_address?: string;
  url?: string;
  reason?: string;
}

// ─── Suppressions ────────────────────────────────────────────────────────────

export type SuppressionReason = "bounce" | "unsubscribe" | "spam_complaint" | "manual" | "invalid";

export type BounceClass = "hard" | "soft" | "block";

export interface Suppression {
  id: string;
  domain_id: string;
  email: string;
  reason: SuppressionReason;
  bounce_class?: BounceClass;
  description?: string;
  expires_at?: string;
  created_at: string;
}

export interface CreateSuppressionRequest {
  email: string;
  reason: SuppressionReason;
  bounce_class?: BounceClass;
  description?: string;
  expires_at?: string;
}

export interface BulkSuppressionRequest {
  emails: string[];
  reason: SuppressionReason;
  description?: string;
}

export interface BulkSuppressionResponse {
  added: number;
  existing: number;
  errors: { email: string; error: string }[];
}

export interface CheckSuppressionRequest {
  emails: string[];
}

export interface SuppressionCheckResult {
  suppressed: boolean;
  reason?: SuppressionReason;
  since?: string;
  expires_at?: string | null;
}

export interface CheckSuppressionResponse {
  results: Record<string, SuppressionCheckResult>;
}

export interface SuppressionStats {
  total: number;
  bounces: number;
  unsubscribes: number;
  spam_complaints: number;
  manual: number;
  invalid: number;
  last_24_hours: number;
  last_7_days: number;
  last_30_days: number;
}

export interface ListSuppressionsParams extends PaginationParams {
  search?: string;
  reason?: SuppressionReason;
}

export interface SuppressionListResponse extends PaginatedResponse {
  suppressions: Suppression[];
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  domain_id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  status: string;
  categories?: string[];
  custom_args?: Record<string, string>;
  created_at: string;
  updated_at: string;
  sent_at?: string;
  delivered_at?: string;
}

export interface MessageTimelineEvent {
  event_type: string;
  timestamp: string;
  details: string;
}

export interface MessageTimeline {
  message_id: string;
  status: string;
  events: MessageTimelineEvent[];
}

export interface ListMessagesParams extends PaginationParams {
  status?: string;
  from?: string;
  to?: string;
}

export interface MessageListResponse extends PaginatedResponse {
  messages: Message[];
}

// ─── Events ──────────────────────────────────────────────────────────────────

export interface EmailEvent {
  id: string;
  message_id: string;
  event_type: string;
  timestamp: string;
  recipient: string;
  details?: Record<string, unknown>;
}

export interface ListEventsParams extends PaginationParams {
  event_type?: string;
}

export interface EventListResponse extends PaginatedResponse {
  events: EmailEvent[];
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface OverviewStats {
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  spam_reports: number;
  unsubscribes: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
}

export interface TimeSeriesStats {
  data: TimeSeriesPoint[];
  interval: string;
}

export interface BounceStats {
  total: number;
  hard: number;
  soft: number;
  block: number;
  by_domain: { domain: string; count: number }[];
}

export interface CategoryStats {
  category: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
}

export interface DomainStats {
  domain: string;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
}

export interface GeoStats {
  country: string;
  opens: number;
  clicks: number;
}

export interface DeviceStats {
  device_type: string;
  count: number;
  percentage: number;
}

export interface LinkStats {
  url: string;
  clicks: number;
  unique_clicks: number;
}

export interface EngagementStats {
  avg_open_time_seconds: number;
  avg_clicks_per_open: number;
  peak_hours: { hour: number; count: number }[];
}

export interface RealTimeStats {
  sent_last_minute: number;
  sent_last_hour: number;
  delivered_last_hour: number;
  bounced_last_hour: number;
  active_sends: number;
}

export interface ComparisonStats {
  current_period: OverviewStats;
  previous_period: OverviewStats;
  changes: Record<string, number>;
}

export interface ReputationStats {
  score: number;
  bounce_rate: number;
  spam_rate: number;
  unsubscribe_rate: number;
}

export interface TimeSeriesParams extends DateRangeParams {
  interval?: "hour" | "day" | "week" | "month";
}

export interface TopParams extends DateRangeParams {
  limit?: number;
}

// ─── API Keys ────────────────────────────────────────────────────────────────

export type ApiKeyScope =
  | "send"
  | "read"
  | "templates"
  | "webhooks"
  | "analytics"
  | "suppressions"
  | "admin";

export interface ApiKey {
  id: string;
  domain_id: string;
  name: string;
  key_prefix: string;
  scopes: ApiKeyScope[];
  rate_limit: number;
  daily_limit: number;
  is_active: boolean;
  expires_at?: string;
  revoked_at?: string;
  metadata?: Record<string, string>;
  created_at: string;
  updated_at: string;
  last_used_at?: string;
}

export interface CreateApiKeyRequest {
  domain_id: string;
  name: string;
  scopes: ApiKeyScope[];
  rate_limit?: number;
  daily_limit?: number;
  expires_at?: string;
  metadata?: Record<string, string>;
}

export interface UpdateApiKeyRequest {
  name?: string;
  scopes?: ApiKeyScope[];
  rate_limit?: number;
  daily_limit?: number;
  expires_at?: string;
  metadata?: Record<string, string>;
}

export interface CreateApiKeyResponse {
  api_key: ApiKey;
  key: string;
}

export interface ApiKeyUsage {
  date: string;
  requests: number;
  sends: number;
}

export interface ApiKeyUsageResponse {
  key_id: string;
  days: number;
  usage: ApiKeyUsage[];
}

export interface ListApiKeysParams extends PaginationParams {
  include_revoked?: boolean;
}

export interface ApiKeyListResponse {
  api_keys: ApiKey[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Unsubscribe Groups ──────────────────────────────────────────────────────

export interface UnsubscribeGroup {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUnsubscribeGroupRequest {
  name: string;
  description?: string;
  is_default?: boolean;
}

export interface UnsubscribeGroupListResponse {
  groups: UnsubscribeGroup[];
}

// ─── Error ───────────────────────────────────────────────────────────────────

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: string;
}

// ─── Client Config ───────────────────────────────────────────────────────────

export interface OonruMailConfig {
  /** API key (starts with em_live_ or em_test_) */
  apiKey: string;
  /** Base URL of the API (default: https://api.oonrumail.com) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Max retry attempts for retryable errors (default: 3) */
  maxRetries?: number;
  /** Custom fetch implementation (for Node 18+ or testing) */
  fetch?: typeof fetch;
}
