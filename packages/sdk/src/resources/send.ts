import type { HttpClient } from "../http.js";
import type { SendRequest, SendResponse, BatchSendRequest, BatchSendResponse } from "../types.js";

/**
 * Send transactional emails — single or batch.
 *
 * @example
 * ```ts
 * const result = await mail.send({
 *   from: "noreply@myapp.com",
 *   to: ["user@example.com"],
 *   subject: "Welcome!",
 *   html: "<h1>Welcome aboard</h1>",
 * });
 * console.log(result.message_id);
 * ```
 */
export class SendResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Send a single email.
   * Returns 202 with message ID and queue status.
   */
  async send(request: SendRequest): Promise<SendResponse> {
    return this.http.post<SendResponse>("/send", request);
  }

  /**
   * Send multiple emails in a single request (up to 1000).
   */
  async batch(request: BatchSendRequest): Promise<BatchSendResponse> {
    return this.http.post<BatchSendResponse>("/send/batch", request);
  }

  /**
   * Convenience: send a simple email with minimal params.
   */
  async simple(params: {
    from: string;
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
  }): Promise<SendResponse> {
    const req: SendRequest = {
      from: params.from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
    };
    if (params.html !== undefined) req.html = params.html;
    if (params.text !== undefined) req.text = params.text;
    return this.send(req);
  }

  /**
   * Convenience: send using a template.
   */
  async withTemplate(params: {
    from: string;
    to: string | string[];
    template_id: string;
    substitutions?: Record<string, string>;
    subject?: string;
  }): Promise<SendResponse> {
    const req: SendRequest = {
      from: params.from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      template_id: params.template_id,
    };
    if (params.substitutions !== undefined) req.substitutions = params.substitutions;
    if (params.subject !== undefined) req.subject = params.subject;
    return this.send(req);
  }
}
