import type { HttpClient } from "../http.js";
import type {
  OverviewStats,
  TimeSeriesStats,
  BounceStats,
  CategoryStats,
  DomainStats,
  GeoStats,
  DeviceStats,
  LinkStats,
  EngagementStats,
  RealTimeStats,
  ComparisonStats,
  ReputationStats,
  DateRangeParams,
  TimeSeriesParams,
  TopParams,
} from "../types.js";

/**
 * Query email analytics — delivery rates, engagement, bounces, and more.
 *
 * @example
 * ```ts
 * const stats = await mail.analytics.overview({
 *   start_date: "2026-01-01",
 *   end_date: "2026-01-31",
 * });
 * console.log(`Delivery rate: ${stats.delivery_rate}%`);
 * ```
 */
export class AnalyticsResource {
  constructor(private readonly http: HttpClient) {}

  /** High-level stats: sent, delivered, bounced, opened, clicked, rates. */
  async overview(params?: DateRangeParams): Promise<OverviewStats> {
    return this.http.get<OverviewStats>("/analytics/overview", params as Record<string, unknown>);
  }

  /** Time-series data bucketed by hour, day, week, or month. */
  async timeseries(params?: TimeSeriesParams): Promise<TimeSeriesStats> {
    return this.http.get<TimeSeriesStats>(
      "/analytics/timeseries",
      params as Record<string, unknown>
    );
  }

  /** Bounce breakdown: hard, soft, block, by domain. */
  async bounces(params?: DateRangeParams): Promise<BounceStats> {
    return this.http.get<BounceStats>("/analytics/bounces", params as Record<string, unknown>);
  }

  /** Stats grouped by email category. */
  async categories(params?: DateRangeParams): Promise<{ categories: CategoryStats[] }> {
    return this.http.get<{ categories: CategoryStats[] }>(
      "/analytics/categories",
      params as Record<string, unknown>
    );
  }

  /** Stats grouped by sending domain. */
  async domains(params?: TopParams): Promise<{ domains: DomainStats[] }> {
    return this.http.get<{ domains: DomainStats[] }>(
      "/analytics/domains",
      params as Record<string, unknown>
    );
  }

  /** Geographic distribution of opens/clicks. */
  async geo(params?: TopParams): Promise<{ geo_distribution: GeoStats[] }> {
    return this.http.get<{ geo_distribution: GeoStats[] }>(
      "/analytics/geo",
      params as Record<string, unknown>
    );
  }

  /** Device type breakdown for opens. */
  async devices(params?: DateRangeParams): Promise<{ devices: DeviceStats[] }> {
    return this.http.get<{ devices: DeviceStats[] }>(
      "/analytics/devices",
      params as Record<string, unknown>
    );
  }

  /** Top clicked links. */
  async links(params?: TopParams): Promise<{ links: LinkStats[] }> {
    return this.http.get<{ links: LinkStats[] }>(
      "/analytics/links",
      params as Record<string, unknown>
    );
  }

  /** Engagement metrics: avg open time, clicks per open, peak hours. */
  async engagement(params?: DateRangeParams): Promise<EngagementStats> {
    return this.http.get<EngagementStats>(
      "/analytics/engagement",
      params as Record<string, unknown>
    );
  }

  /** Real-time sending activity (last minute/hour). */
  async realtime(): Promise<RealTimeStats> {
    return this.http.get<RealTimeStats>("/analytics/realtime");
  }

  /** Compare current period vs previous period. */
  async comparison(params?: DateRangeParams): Promise<ComparisonStats> {
    return this.http.get<ComparisonStats>(
      "/analytics/comparison",
      params as Record<string, unknown>
    );
  }

  /** Sender reputation score and rates. */
  async reputation(params?: DateRangeParams): Promise<ReputationStats> {
    return this.http.get<ReputationStats>(
      "/analytics/reputation",
      params as Record<string, unknown>
    );
  }
}
