import type { ApiErrorBody } from "./types.js";

/**
 * Error thrown when the OonruMail API returns an error response.
 */
export class OonruMailError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: string | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || body.error || `API error ${status}`);
    this.name = "OonruMailError";
    this.status = status;
    this.code = body.error || "unknown_error";
    this.details = body.details ?? undefined;
  }

  /** True for 429 / 5xx errors that may succeed on retry */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/**
 * Error thrown when a request times out.
 */
export class OonruMailTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "OonruMailTimeoutError";
  }
}
