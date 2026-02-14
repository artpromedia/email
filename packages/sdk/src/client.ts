import { HttpClient } from "./http.js";
import { AnalyticsResource } from "./resources/analytics.js";
import { ApiKeysResource } from "./resources/api-keys.js";
import { MessagesResource, EventsResource } from "./resources/messages.js";
import { SendResource } from "./resources/send.js";
import { SuppressionsResource } from "./resources/suppressions.js";
import { TemplatesResource } from "./resources/templates.js";
import { WebhooksResource } from "./resources/webhooks.js";
import type {
  OonruMailConfig,
  SendRequest,
  SendResponse,
  BatchSendRequest,
  BatchSendResponse,
  WebhookPayload,
} from "./types.js";

/**
 * OonruMail SDK — Official TypeScript client for the OonruMail Transactional Email API.
 *
 * @example
 * ```ts
 * import { OonruMail } from "@oonrumail/sdk";
 *
 * const mail = new OonruMail({ apiKey: "em_live_..." });
 *
 * // Send an email
 * await mail.send({
 *   from: "noreply@myapp.com",
 *   to: ["user@example.com"],
 *   subject: "Welcome!",
 *   html: "<h1>Welcome aboard</h1>",
 * });
 *
 * // Send with a template
 * await mail.sendWithTemplate({
 *   from: "noreply@myapp.com",
 *   to: "user@example.com",
 *   template_id: "tpl_welcome",
 *   substitutions: { name: "Alice" },
 * });
 *
 * // Check analytics
 * const stats = await mail.analytics.overview();
 * console.log(`Delivery rate: ${stats.delivery_rate}%`);
 * ```
 */
export class OonruMail {
  private readonly _send: SendResource;

  /** Email template management. */
  public readonly templates: TemplatesResource;

  /** Webhook endpoint management + signature verification. */
  public readonly webhooks: WebhooksResource;

  /** Suppression list management. */
  public readonly suppressions: SuppressionsResource;

  /** Query sent messages and delivery timelines. */
  public readonly messages: MessagesResource;

  /** Query raw email events. */
  public readonly events: EventsResource;

  /** Email analytics and statistics. */
  public readonly analytics: AnalyticsResource;

  /** API key management (requires admin scope). */
  public readonly apiKeys: ApiKeysResource;

  /**
   * Create a new OonruMail client.
   *
   * @param config - API key and optional settings
   */
  constructor(config: OonruMailConfig) {
    const http = new HttpClient(config);

    this._send = new SendResource(http);
    this.templates = new TemplatesResource(http);
    this.webhooks = new WebhooksResource(http);
    this.suppressions = new SuppressionsResource(http);
    this.messages = new MessagesResource(http);
    this.events = new EventsResource(http);
    this.analytics = new AnalyticsResource(http);
    this.apiKeys = new ApiKeysResource(http);
  }

  // ── Top-level send shortcuts ──────────────────────────────────────────

  /**
   * Send a single email.
   *
   * @example
   * ```ts
   * await mail.send({
   *   from: "noreply@myapp.com",
   *   to: ["user@example.com"],
   *   subject: "Order confirmed",
   *   html: "<p>Your order #123 is confirmed.</p>",
   * });
   * ```
   */
  async send(request: SendRequest): Promise<SendResponse> {
    return this._send.send(request);
  }

  /**
   * Send a batch of emails (up to 1000).
   */
  async sendBatch(request: BatchSendRequest): Promise<BatchSendResponse> {
    return this._send.batch(request);
  }

  /**
   * Send a simple email with minimal params.
   * Accepts a single `to` string or array.
   */
  async sendSimple(params: {
    from: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
  }): Promise<SendResponse> {
    return this._send.simple(params);
  }

  /**
   * Send an email using a stored template.
   */
  async sendWithTemplate(params: {
    from: string;
    to: string | string[];
    template_id: string;
    substitutions?: Record<string, string>;
    subject?: string;
  }): Promise<SendResponse> {
    return this._send.withTemplate(params);
  }

  // ── Static helpers ─────────────────────────────────────────────────────

  /**
   * Verify the HMAC signature of an incoming webhook payload.
   * Use this in your webhook handler to ensure authenticity.
   */
  static async verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean> {
    return WebhooksResource.verifySignature(payload, signature, secret);
  }

  /**
   * Parse a webhook payload from your handler into a typed object.
   */
  static parseWebhookPayload(body: string | Record<string, unknown>): WebhookPayload {
    return WebhooksResource.parsePayload(body);
  }
}
