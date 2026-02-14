import type { HttpClient } from "../http.js";
import type {
  Suppression,
  CreateSuppressionRequest,
  BulkSuppressionRequest,
  BulkSuppressionResponse,
  CheckSuppressionRequest,
  CheckSuppressionResponse,
  SuppressionStats,
  ListSuppressionsParams,
  SuppressionListResponse,
} from "../types.js";

/**
 * Manage email suppression lists — bounced, unsubscribed, and manually blocked addresses.
 *
 * @example
 * ```ts
 * // Check if an email is suppressed before sending
 * const check = await mail.suppressions.check(["user@example.com"]);
 * if (check.results["user@example.com"].suppressed) {
 *   console.log("Skipping — email is suppressed");
 * }
 * ```
 */
export class SuppressionsResource {
  constructor(private readonly http: HttpClient) {}

  /** List suppressions with optional filters. */
  async list(params?: ListSuppressionsParams): Promise<SuppressionListResponse> {
    return this.http.get<SuppressionListResponse>(
      "/suppressions",
      params as Record<string, unknown>
    );
  }

  /** Get a single suppression by ID. */
  async get(id: string): Promise<Suppression> {
    return this.http.get<Suppression>(`/suppressions/${id}`);
  }

  /** Add an email to the suppression list. */
  async create(data: CreateSuppressionRequest): Promise<Suppression> {
    return this.http.post<Suppression>("/suppressions", data);
  }

  /** Remove a suppression by ID. */
  async delete(id: string): Promise<void> {
    return this.http.delete(`/suppressions/${id}`);
  }

  /** Bulk-add emails to the suppression list (up to 1000). */
  async bulkCreate(data: BulkSuppressionRequest): Promise<BulkSuppressionResponse> {
    return this.http.post<BulkSuppressionResponse>("/suppressions/bulk", data);
  }

  /**
   * Check if one or more emails are suppressed (up to 100).
   * Returns a map of email → suppression status.
   */
  async check(emails: string[]): Promise<CheckSuppressionResponse> {
    const body: CheckSuppressionRequest = { emails };
    return this.http.post<CheckSuppressionResponse>("/suppressions/check", body);
  }

  /** Get suppression statistics (counts by reason, recent activity). */
  async stats(): Promise<SuppressionStats> {
    return this.http.get<SuppressionStats>("/suppressions/stats");
  }
}
