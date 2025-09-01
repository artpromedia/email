import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../../auth/middleware";
import { logAudit, AuditLogger } from "../../utils/audit-logger";

// Schema definitions
const analyticsQuerySchema = z.object({
  timeRange: z.enum(["1h", "24h", "7d", "30d", "90d"]).default("24h"),
  granularity: z.enum(["minute", "hour", "day"]).default("hour"),
});

const alertQuerySchema = z.object({
  status: z.enum(["active", "resolved", "acknowledged"]).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Response schemas
const timeSeriesDataSchema = z.object({
  timestamp: z.string().datetime(),
  value: z.number(),
});

const performanceMetricsSchema = z.object({
  emailsSent: z.array(timeSeriesDataSchema),
  emailsReceived: z.array(timeSeriesDataSchema),
  bounceRate: z.array(timeSeriesDataSchema),
  deliveryRate: z.array(timeSeriesDataSchema),
  responseTime: z.array(timeSeriesDataSchema),
  errorRate: z.array(timeSeriesDataSchema),
});

const systemResourcesSchema = z.object({
  cpu: z.object({
    current: z.number(),
    history: z.array(timeSeriesDataSchema),
  }),
  memory: z.object({
    current: z.number(),
    history: z.array(timeSeriesDataSchema),
  }),
  disk: z.object({
    current: z.number(),
    history: z.array(timeSeriesDataSchema),
  }),
  network: z.object({
    inbound: z.array(timeSeriesDataSchema),
    outbound: z.array(timeSeriesDataSchema),
  }),
});

const alertSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["active", "resolved", "acknowledged"]),
  triggeredAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  acknowledgedAt: z.string().datetime().nullable(),
  acknowledgedBy: z.string().nullable(),
  source: z.string(),
  category: z.string(),
  metadata: z.record(z.any()),
});

const realTimeStatsSchema = z.object({
  activeUsers: z.number(),
  queuedEmails: z.number(),
  processingEmails: z.number(),
  systemLoad: z.number(),
  uptime: z.string(),
  version: z.string(),
  lastUpdated: z.string().datetime(),
});

const detailedAnalyticsSchema = z.object({
  summary: z.object({
    totalUsers: z.number(),
    activeUsers: z.number(),
    totalDomains: z.number(),
    emailsToday: z.number(),
    bounceRateToday: z.number(),
    deliveryRateToday: z.number(),
    storageUsed: z.number(),
    storageQuota: z.number(),
  }),
  performance: performanceMetricsSchema,
  resources: systemResourcesSchema,
  topDomains: z.array(
    z.object({
      domain: z.string(),
      emails: z.number(),
      users: z.number(),
      bounceRate: z.number(),
    }),
  ),
  recentActivity: z.array(
    z.object({
      timestamp: z.string().datetime(),
      action: z.string(),
      user: z.string(),
      details: z.string(),
    }),
  ),
});

export async function adminAnalyticsRoutes(fastify: FastifyInstance) {
  // Add admin auth middleware to all routes
  fastify.addHook("preHandler", requireAdmin);

  // GET /admin/analytics/overview - Get analytics overview
  fastify.get(
    "/admin/analytics/overview",
    {
      schema: {
        querystring: analyticsQuerySchema,
        response: {
          200: detailedAnalyticsSchema,
        },
        tags: ["Admin", "Analytics"],
        summary: "Get analytics overview",
        description: "Retrieve comprehensive analytics data and metrics",
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: z.infer<typeof analyticsQuerySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const { timeRange, granularity } = request.query;
      const currentUser = request.user!;

      try {
        // Generate mock time series data
        const generateTimeSeries = (
          baseValue: number,
          variance: number,
          points: number,
        ) => {
          const now = new Date();
          const interval =
            timeRange === "1h"
              ? 60000
              : timeRange === "24h"
                ? 3600000
                : 86400000;

          return Array.from({ length: points }, (_, i) => ({
            timestamp: new Date(
              now.getTime() - (points - i - 1) * interval,
            ).toISOString(),
            value: Math.max(0, baseValue + (Math.random() - 0.5) * variance),
          }));
        };

        const points = timeRange === "1h" ? 60 : timeRange === "24h" ? 24 : 30;

        // TODO: Implement actual analytics calculation
        const analytics = {
          summary: {
            totalUsers: 1247,
            activeUsers: 892,
            totalDomains: 4,
            emailsToday: 8947,
            bounceRateToday: 2.3,
            deliveryRateToday: 97.7,
            storageUsed: 47.3,
            storageQuota: 100.0,
          },
          performance: {
            emailsSent: generateTimeSeries(350, 100, points),
            emailsReceived: generateTimeSeries(280, 80, points),
            bounceRate: generateTimeSeries(2.5, 1.0, points),
            deliveryRate: generateTimeSeries(97.5, 2.0, points),
            responseTime: generateTimeSeries(150, 50, points),
            errorRate: generateTimeSeries(0.5, 0.3, points),
          },
          resources: {
            cpu: {
              current: 23.4,
              history: generateTimeSeries(25, 15, points),
            },
            memory: {
              current: 67.8,
              history: generateTimeSeries(70, 20, points),
            },
            disk: {
              current: 45.2,
              history: generateTimeSeries(45, 5, points),
            },
            network: {
              inbound: generateTimeSeries(1024, 512, points),
              outbound: generateTimeSeries(2048, 1024, points),
            },
          },
          topDomains: [
            {
              domain: "ceerion.com",
              emails: 7245,
              users: 1180,
              bounceRate: 1.8,
            },
            {
              domain: "support.ceerion.com",
              emails: 1456,
              users: 45,
              bounceRate: 3.2,
            },
            {
              domain: "demo.ceerion.com",
              emails: 246,
              users: 22,
              bounceRate: 0.9,
            },
          ],
          recentActivity: [
            {
              timestamp: new Date(Date.now() - 300000).toISOString(),
              action: "User Created",
              user: "admin@ceerion.com",
              details: "Created user: newuser@ceerion.com",
            },
            {
              timestamp: new Date(Date.now() - 600000).toISOString(),
              action: "Domain Verified",
              user: "admin@ceerion.com",
              details: "Verified domain: new.ceerion.com",
            },
          ],
        };

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "analytics.overview_view",
          resourceType: AuditLogger.ResourceTypes.ANALYTICS,
          resourceId: "overview",
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            timeRange,
            granularity,
            dataPointsGenerated: points,
            accessedAt: new Date().toISOString(),
          },
        });

        return analytics;
      } catch (error: unknown) {
        console.error("Analytics error:", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to fetch analytics overview",
        );
      }
    },
  );

  // GET /admin/analytics/real-time - Get real-time statistics
  fastify.get(
    "/admin/analytics/real-time",
    {
      schema: {
        response: {
          200: realTimeStatsSchema,
        },
        tags: ["Admin", "Analytics"],
        summary: "Get real-time statistics",
        description: "Retrieve current real-time system statistics",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;

      try {
        // TODO: Implement actual real-time statistics
        const realTimeStats = {
          activeUsers: 342,
          queuedEmails: 47,
          processingEmails: 12,
          systemLoad: 23.4,
          uptime: "15d 8h 32m",
          version: "1.0.0",
          lastUpdated: new Date().toISOString(),
        };

        // Log audit event (minimal logging for real-time endpoint)
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "analytics.realtime_view",
          resourceType: AuditLogger.ResourceTypes.ANALYTICS,
          resourceId: "realtime",
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            activeUsers: realTimeStats.activeUsers,
            systemLoad: realTimeStats.systemLoad,
          },
        });

        return realTimeStats;
      } catch (error: unknown) {
        console.error("Analytics error:", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to fetch real-time statistics",
        );
      }
    },
  );

  // GET /admin/analytics/alerts - Get system alerts
  fastify.get(
    "/admin/analytics/alerts",
    {
      schema: {
        querystring: alertQuerySchema,
        response: {
          200: {
            type: "object",
            properties: {
              items: { type: "array", items: alertSchema },
              pagination: {
                type: "object",
                properties: {
                  page: { type: "number" },
                  limit: { type: "number" },
                  total: { type: "number" },
                  totalPages: { type: "number" },
                },
              },
            },
          },
        },
        tags: ["Admin", "Analytics"],
        summary: "Get system alerts",
        description: "Retrieve system alerts and notifications",
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: z.infer<typeof alertQuerySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const { status, severity, page, limit } = request.query;
      const currentUser = request.user!;

      try {
        // TODO: Implement actual alerts retrieval
        const mockAlerts = [
          {
            id: "alert-001",
            title: "High CPU Usage",
            description:
              "System CPU usage has exceeded 80% for the last 10 minutes",
            severity: "high" as const,
            status: "active" as const,
            triggeredAt: new Date(Date.now() - 600000).toISOString(),
            resolvedAt: null,
            acknowledgedAt: null,
            acknowledgedBy: null,
            source: "system_monitor",
            category: "performance",
            metadata: {
              currentCpuUsage: 85.4,
              threshold: 80,
              duration: "10m",
            },
          },
          {
            id: "alert-002",
            title: "Bounce Rate Spike",
            description:
              "Email bounce rate has increased to 15% in the last hour",
            severity: "medium" as const,
            status: "acknowledged" as const,
            triggeredAt: new Date(Date.now() - 3600000).toISOString(),
            resolvedAt: null,
            acknowledgedAt: new Date(Date.now() - 1800000).toISOString(),
            acknowledgedBy: "admin@ceerion.com",
            source: "email_monitor",
            category: "delivery",
            metadata: {
              currentBounceRate: 15.2,
              normalBounceRate: 2.3,
              affectedDomain: "external.com",
            },
          },
        ];

        const totalItems = 5; // Mock total
        const totalPages = Math.ceil(totalItems / limit);

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "analytics.alerts_view",
          resourceType: AuditLogger.ResourceTypes.ANALYTICS,
          resourceId: "alerts",
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            filters: { status, severity },
            pagination: { page, limit },
            resultCount: mockAlerts.length,
          },
        });

        return {
          items: mockAlerts,
          pagination: {
            page,
            limit,
            total: totalItems,
            totalPages,
          },
        };
      } catch (error: unknown) {
        console.error("Analytics error:", error);
        throw fastify.httpErrors.internalServerError("Failed to fetch alerts");
      }
    },
  );

  // POST /admin/analytics/alerts/:id/acknowledge - Acknowledge alert
  fastify.post(
    "/admin/analytics/alerts/:id/acknowledge",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        tags: ["Admin", "Analytics"],
        summary: "Acknowledge alert",
        description: "Acknowledge a system alert",
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const currentUser = request.user!;

      try {
        // TODO: Implement actual alert acknowledgment

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "analytics.alert_acknowledge",
          resourceType: AuditLogger.ResourceTypes.ANALYTICS,
          resourceId: id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            alertId: id,
            acknowledgedAt: new Date().toISOString(),
          },
        });

        return {
          success: true,
          message: "Alert acknowledged successfully",
          alertId: id,
          acknowledgedAt: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error("Analytics error:", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to acknowledge alert",
        );
      }
    },
  );

  // POST /admin/analytics/alerts/:id/resolve - Resolve alert
  fastify.post(
    "/admin/analytics/alerts/:id/resolve",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        body: {
          type: "object",
          properties: {
            resolution: { type: "string" },
          },
        },
        tags: ["Admin", "Analytics"],
        summary: "Resolve alert",
        description: "Resolve a system alert",
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { resolution?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { resolution } = request.body;
      const currentUser = request.user!;

      try {
        // TODO: Implement actual alert resolution

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "analytics.alert_resolve",
          resourceType: AuditLogger.ResourceTypes.ANALYTICS,
          resourceId: id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            alertId: id,
            resolution: resolution || "No resolution provided",
            resolvedAt: new Date().toISOString(),
          },
        });

        return {
          success: true,
          message: "Alert resolved successfully",
          alertId: id,
          resolvedAt: new Date().toISOString(),
        };
      } catch (error: unknown) {
        console.error("Analytics error:", error);
        throw fastify.httpErrors.internalServerError("Failed to resolve alert");
      }
    },
  );
}
