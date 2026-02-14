import { OonruMailError, OonruMailTimeoutError } from "./errors.js";
import type { ApiErrorBody, OonruMailConfig } from "./types.js";

const DEFAULT_BASE_URL = "https://api.oonrumail.com";
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Low-level HTTP client with auth, retries, and error handling.
 * Used internally by all resource modules.
 */
export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly _fetch: typeof fetch;

  constructor(config: OonruMailConfig) {
    if (!config.apiKey) {
      throw new Error("OonruMail: apiKey is required");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error(
        "OonruMail: fetch is not available. Pass a custom fetch implementation or use Node.js >= 18."
      );
    }
    this._fetch = fetchImpl;
  }

  // ── Public helpers ───────────────────────────────────────────────────────

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>("GET", url);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", this.buildUrl(path), body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", this.buildUrl(path), body);
  }

  async delete(path: string): Promise<undefined> {
    await this.request<undefined>("DELETE", this.buildUrl(path));
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(`/api/v1${path}`, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(
            key,
            typeof value === "object"
              ? JSON.stringify(value)
              : String(value as string | number | boolean)
          );
        }
      }
    }
    return url.toString();
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * delay * 0.25;
        await sleep(delay + jitter);
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        };

        if (body !== undefined) {
          headers["Content-Type"] = "application/json";
        }

        const response = await this._fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : null,
          signal: controller.signal,
        });

        clearTimeout(timer);

        // 204 No Content
        if (response.status === 204) {
          return undefined as T;
        }

        // Parse response
        const contentType = response.headers.get("content-type") ?? "";
        const isJson = contentType.includes("application/json");

        if (!response.ok) {
          const errorBody: ApiErrorBody = isJson
            ? ((await response.json()) as ApiErrorBody)
            : { error: "api_error", message: await response.text() };

          const error = new OonruMailError(response.status, errorBody);

          if (error.retryable && attempt < this.maxRetries) {
            // Check Retry-After header for 429
            if (response.status === 429) {
              const retryAfter = response.headers.get("Retry-After");
              if (retryAfter) {
                await sleep(parseInt(retryAfter, 10) * 1000);
              }
            }
            lastError = error;
            continue;
          }

          throw error;
        }

        if (!isJson) {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (err) {
        if (err instanceof OonruMailError) {
          throw err;
        }

        if (err instanceof DOMException && err.name === "AbortError") {
          lastError = new OonruMailTimeoutError(this.timeout);
          if (attempt < this.maxRetries) continue;
          throw lastError;
        }

        // Network error — retryable
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) continue;
        throw lastError;
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
