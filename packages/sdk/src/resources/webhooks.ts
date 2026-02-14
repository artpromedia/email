import type { HttpClient } from "../http.js";
import type {
  Webhook,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  TestWebhookResponse,
  RotateSecretResponse,
  WebhookDeliveryListResponse,
  ListWebhookDeliveriesParams,
  WebhookListResponse,
  WebhookPayload,
} from "../types.js";

/**
 * Manage webhook endpoints for delivery notifications.
 *
 * @example
 * ```ts
 * const wh = await mail.webhooks.create({
 *   url: "https://myapp.com/hooks/email",
 *   events: ["delivered", "bounced", "opened"],
 * });
 * console.log(wh.secret); // save this for signature verification
 * ```
 */
export class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  /** List all webhook endpoints. */
  async list(): Promise<WebhookListResponse> {
    return this.http.get<WebhookListResponse>("/webhooks");
  }

  /** Get a webhook by ID. */
  async get(id: string): Promise<Webhook> {
    return this.http.get<Webhook>(`/webhooks/${id}`);
  }

  /** Create a new webhook endpoint. Returns the secret (only shown once). */
  async create(data: CreateWebhookRequest): Promise<Webhook> {
    return this.http.post<Webhook>("/webhooks", data);
  }

  /** Update a webhook. */
  async update(id: string, data: UpdateWebhookRequest): Promise<Webhook> {
    return this.http.put<Webhook>(`/webhooks/${id}`, data);
  }

  /** Delete a webhook. */
  async delete(id: string): Promise<void> {
    return this.http.delete(`/webhooks/${id}`);
  }

  /** Send a test event to a webhook endpoint. */
  async test(id: string, eventType?: string): Promise<TestWebhookResponse> {
    return this.http.post<TestWebhookResponse>(`/webhooks/${id}/test`, {
      event_type: eventType ?? "delivered",
    });
  }

  /** Rotate the webhook signing secret. */
  async rotateSecret(id: string): Promise<RotateSecretResponse> {
    return this.http.post<RotateSecretResponse>(`/webhooks/${id}/rotate-secret`);
  }

  /** List recent deliveries for a webhook. */
  async listDeliveries(
    id: string,
    params?: ListWebhookDeliveriesParams
  ): Promise<WebhookDeliveryListResponse> {
    return this.http.get<WebhookDeliveryListResponse>(
      `/webhooks/${id}/deliveries`,
      params as Record<string, unknown>
    );
  }

  // ── Signature verification helper ──────────────────────────────────────

  /**
   * Verify the HMAC signature of an incoming webhook payload.
   *
   * @param payload   - The raw request body (string)
   * @param signature - The value of the X-Webhook-Signature header
   * @param secret    - Your webhook secret
   * @returns true if the signature is valid
   *
   * @example
   * ```ts
   * // In your Express/Fastify/Next.js webhook handler:
   * const isValid = await OonruMail.webhooks.verifySignature(
   *   rawBody,
   *   req.headers["x-webhook-signature"],
   *   process.env.WEBHOOK_SECRET
   * );
   * ```
   */
  static async verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean> {
    // Use SubtleCrypto (works in Node 18+ and all modern browsers)
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time comparison
    if (computed.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  }

  /**
   * Parse and type-narrow a webhook payload from your handler.
   */
  static parsePayload(body: string | Record<string, unknown>): WebhookPayload {
    if (typeof body === "string") {
      return JSON.parse(body) as WebhookPayload;
    }
    return body as unknown as WebhookPayload;
  }
}
