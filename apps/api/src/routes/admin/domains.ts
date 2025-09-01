import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../../auth/middleware";
import { logAudit, AuditLogger } from "../../utils/audit-logger";

// Schema definitions
const domainQuerySchema = z.object({
  q: z.string().optional(),
  status: z
    .enum(["active", "pending", "suspended", "failed", "configuring"])
    .optional(),
  type: z.enum(["primary", "alias", "subdomain", "external"]).optional(),
  verification: z
    .enum(["verified", "pending", "failed", "not_started"])
    .optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const createDomainSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["primary", "alias", "subdomain", "external"]),
  description: z.string().optional(),
});

const updateDomainSchema = z.object({
  status: z
    .enum(["active", "pending", "suspended", "failed", "configuring"])
    .optional(),
  description: z.string().optional(),
  mailSettings: z
    .object({
      maxMessageSize: z.number().min(1),
      retentionDays: z.number().min(1),
      quotaPerUser: z.number().min(1),
      allowExternalForwarding: z.boolean(),
      requireTls: z.boolean(),
      enableSpamFilter: z.boolean(),
      customBounceMessage: z.string().optional(),
    })
    .optional(),
  security: z
    .object({
      spfPolicy: z.enum(["none", "soft_fail", "fail"]),
      dkimEnabled: z.boolean(),
      dmarcPolicy: z.enum(["none", "quarantine", "reject"]),
      mtaStsEnabled: z.boolean(),
      tlsReportingEnabled: z.boolean(),
      requireSecureAuth: z.boolean(),
      allowedIpRanges: z.array(z.string()),
    })
    .optional(),
});

// Response schemas
const dnsRecordSchema = z.object({
  id: z.string(),
  type: z.enum(["MX", "TXT", "CNAME", "A", "AAAA", "SPF", "DKIM", "DMARC"]),
  name: z.string(),
  value: z.string(),
  priority: z.number().optional(),
  ttl: z.number(),
  status: z.enum(["active", "pending", "failed"]),
  description: z.string(),
  required: z.boolean(),
});

const domainSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["active", "pending", "suspended", "failed", "configuring"]),
  type: z.enum(["primary", "alias", "subdomain", "external"]),
  description: z.string().optional(),
  verification: z.object({
    status: z.enum(["verified", "pending", "failed", "not_started"]),
    verifiedAt: z.string().datetime().nullable(),
    lastChecked: z.string().datetime().nullable(),
    errors: z.array(z.string()),
  }),
  dnsRecords: z.array(dnsRecordSchema),
  mailSettings: z.object({
    maxMessageSize: z.number(),
    retentionDays: z.number(),
    quotaPerUser: z.number(),
    allowExternalForwarding: z.boolean(),
    requireTls: z.boolean(),
    enableSpamFilter: z.boolean(),
    customBounceMessage: z.string().optional(),
  }),
  security: z.object({
    spfPolicy: z.enum(["none", "soft_fail", "fail"]),
    dkimEnabled: z.boolean(),
    dmarcPolicy: z.enum(["none", "quarantine", "reject"]),
    mtaStsEnabled: z.boolean(),
    tlsReportingEnabled: z.boolean(),
    requireSecureAuth: z.boolean(),
    allowedIpRanges: z.array(z.string()),
  }),
  statistics: z.object({
    totalUsers: z.number(),
    activeUsers: z.number(),
    messagesPerDay: z.number(),
    storageUsed: z.number(),
    lastActivity: z.string().datetime(),
    bounceRate: z.number(),
    spamRate: z.number(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string(),
  lastModifiedBy: z.string(),
  isDefault: z.boolean(),
  aliases: z.array(z.string()),
});

const domainStatsSchema = z.object({
  totalDomains: z.number(),
  activeDomains: z.number(),
  pendingVerification: z.number(),
  totalUsers: z.number(),
  dailyMessages: z.number(),
  storageUsed: z.number(),
  topDomains: z.array(
    z.object({
      domain: z.string(),
      users: z.number(),
      messages: z.number(),
    }),
  ),
});

export async function adminDomainRoutes(fastify: FastifyInstance) {
  // Add admin auth middleware to all routes
  fastify.addHook("preHandler", requireAdmin);

  // GET /admin/domains - List domains
  fastify.get(
    "/admin/domains",
    {
      schema: {
        querystring: domainQuerySchema,
        response: {
          200: {
            type: "object",
            properties: {
              items: { type: "array", items: domainSchema },
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
        tags: ["Admin", "Domains"],
        summary: "List domains",
        description: "Retrieve domains with filtering and pagination",
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: z.infer<typeof domainQuerySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const { q, status, type, verification, page, limit } = request.query;
      const currentUser = request.user!;

      try {
        // TODO: Implement actual database query
        const mockDomains = [
          {
            id: "domain-001",
            name: "ceerion.com",
            status: "active" as const,
            type: "primary" as const,
            description: "Primary company domain",
            verification: {
              status: "verified" as const,
              verifiedAt: new Date().toISOString(),
              lastChecked: new Date().toISOString(),
              errors: [],
            },
            dnsRecords: [
              {
                id: "dns-001",
                type: "MX" as const,
                name: "ceerion.com",
                value: "mail.ceerion.com",
                priority: 10,
                ttl: 3600,
                status: "active" as const,
                description: "Primary mail server",
                required: true,
              },
            ],
            mailSettings: {
              maxMessageSize: 50,
              retentionDays: 2555,
              quotaPerUser: 50,
              allowExternalForwarding: true,
              requireTls: true,
              enableSpamFilter: true,
            },
            security: {
              spfPolicy: "fail" as const,
              dkimEnabled: true,
              dmarcPolicy: "quarantine" as const,
              mtaStsEnabled: true,
              tlsReportingEnabled: true,
              requireSecureAuth: true,
              allowedIpRanges: ["192.168.1.0/24"],
            },
            statistics: {
              totalUsers: 1250,
              activeUsers: 1180,
              messagesPerDay: 8950,
              storageUsed: 45.7,
              lastActivity: new Date().toISOString(),
              bounceRate: 2.1,
              spamRate: 0.8,
            },
            createdAt: new Date("2025-06-01").toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: "admin@ceerion.com",
            lastModifiedBy: "admin@ceerion.com",
            isDefault: true,
            aliases: [],
          },
        ];

        const totalItems = 4; // Mock total
        const totalPages = Math.ceil(totalItems / limit);

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "domain.list",
          resourceType: AuditLogger.ResourceTypes.DOMAIN,
          resourceId: null,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            filters: { q, status, type, verification },
            pagination: { page, limit },
            resultCount: mockDomains.length,
          },
        });

        return {
          items: mockDomains,
          pagination: {
            page,
            limit,
            total: totalItems,
            totalPages,
          },
        };
      } catch (error: unknown) {
        console.error("Domain error:", error);
        throw fastify.httpErrors.internalServerError("Failed to fetch domains");
      }
    },
  );

  // GET /admin/domains/stats - Get domain statistics
  fastify.get(
    "/admin/domains/stats",
    {
      schema: {
        response: {
          200: domainStatsSchema,
        },
        tags: ["Admin", "Domains"],
        summary: "Get domain statistics",
        description: "Retrieve domain statistics and metrics",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;

      try {
        // TODO: Implement actual statistics calculation
        const stats = {
          totalDomains: 4,
          activeDomains: 2,
          pendingVerification: 1,
          totalUsers: 1285,
          dailyMessages: 9425,
          storageUsed: 47.0,
          topDomains: [
            { domain: "ceerion.com", users: 1250, messages: 8950 },
            { domain: "support.ceerion.com", users: 25, messages: 450 },
            { domain: "demo.ceerion.com", users: 10, messages: 25 },
          ],
        };

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "domain.stats_view",
          resourceType: AuditLogger.ResourceTypes.DOMAIN,
          resourceId: "statistics",
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            statsAccessed: new Date().toISOString(),
          },
        });

        return stats;
      } catch (error: unknown) {
        console.error("Domain error:", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to fetch domain statistics",
        );
      }
    },
  );

  // POST /admin/domains - Create new domain
  fastify.post(
    "/admin/domains",
    {
      schema: {
        body: createDomainSchema,
        response: {
          201: domainSchema,
        },
        tags: ["Admin", "Domains"],
        summary: "Create new domain",
        description: "Add a new domain to the system",
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof createDomainSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const { name, type, description } = request.body;
      const currentUser = request.user!;

      try {
        // TODO: Implement actual domain creation
        const newDomain = {
          id: `domain-${Date.now()}`,
          name,
          status: "configuring" as const,
          type,
          description,
          verification: {
            status: "not_started" as const,
            verifiedAt: null,
            lastChecked: null,
            errors: [],
          },
          dnsRecords: [],
          mailSettings: {
            maxMessageSize: 25,
            retentionDays: 365,
            quotaPerUser: 10,
            allowExternalForwarding: false,
            requireTls: true,
            enableSpamFilter: true,
          },
          security: {
            spfPolicy: "none" as const,
            dkimEnabled: false,
            dmarcPolicy: "none" as const,
            mtaStsEnabled: false,
            tlsReportingEnabled: false,
            requireSecureAuth: true,
            allowedIpRanges: [],
          },
          statistics: {
            totalUsers: 0,
            activeUsers: 0,
            messagesPerDay: 0,
            storageUsed: 0,
            lastActivity: new Date().toISOString(),
            bounceRate: 0,
            spamRate: 0,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: currentUser.email,
          lastModifiedBy: currentUser.email,
          isDefault: false,
          aliases: [],
        };

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "domain.create",
          resourceType: AuditLogger.ResourceTypes.DOMAIN,
          resourceId: newDomain.id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            domainName: name,
            domainType: type,
            description: description || null,
          },
        });

        reply.status(201);
        return newDomain;
      } catch (error: unknown) {
        console.error("Domain error:", error);
        throw fastify.httpErrors.internalServerError("Failed to create domain");
      }
    },
  );

  // GET /admin/domains/:id - Get domain details
  fastify.get(
    "/admin/domains/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        response: {
          200: domainSchema,
        },
        tags: ["Admin", "Domains"],
        summary: "Get domain details",
        description: "Retrieve detailed information about a domain",
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
        // TODO: Implement actual database lookup
        // Mock domain data (would come from database)
        throw fastify.httpErrors.notFound("Domain not found");
      } catch (error: unknown) {
        console.error("Domain error:", error);
        throw fastify.httpErrors.notFound("Domain not found");
      }
    },
  );

  // PUT /admin/domains/:id - Update domain
  fastify.put(
    "/admin/domains/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        body: updateDomainSchema,
        response: {
          200: domainSchema,
        },
        tags: ["Admin", "Domains"],
        summary: "Update domain",
        description: "Update domain configuration",
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof updateDomainSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const updates = request.body;
      const currentUser = request.user!;

      try {
        // TODO: Implement actual domain update

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "domain.update",
          resourceType: AuditLogger.ResourceTypes.DOMAIN,
          resourceId: id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            updatedFields: Object.keys(updates),
            updates,
          },
        });

        throw fastify.httpErrors.notFound("Domain not found");
      } catch (error: unknown) {
        console.error("Domain error:", error);
        throw fastify.httpErrors.internalServerError("Failed to update domain");
      }
    },
  );

  // POST /admin/domains/:id/verify - Verify domain
  fastify.post(
    "/admin/domains/:id/verify",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        tags: ["Admin", "Domains"],
        summary: "Verify domain",
        description: "Trigger domain verification process",
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
        // TODO: Implement actual domain verification

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "domain.verify",
          resourceType: AuditLogger.ResourceTypes.DOMAIN,
          resourceId: id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            verificationTriggered: new Date().toISOString(),
          },
        });

        return {
          success: true,
          message: "Domain verification started",
          domainId: id,
        };
      } catch (error: unknown) {
        console.error("Domain error:", error);
        throw fastify.httpErrors.internalServerError("Failed to verify domain");
      }
    },
  );

  // DELETE /admin/domains/:id - Delete domain
  fastify.delete(
    "/admin/domains/:id",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        tags: ["Admin", "Domains"],
        summary: "Delete domain",
        description: "Remove domain from the system",
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
        // TODO: Implement actual domain deletion with safety checks

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "domain.delete",
          resourceType: AuditLogger.ResourceTypes.DOMAIN,
          resourceId: id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            deletedAt: new Date().toISOString(),
          },
        });

        return {
          success: true,
          message: "Domain deleted successfully",
          domainId: id,
        };
      } catch (error: unknown) {
        console.error("Domain error:", error);
        throw fastify.httpErrors.internalServerError("Failed to delete domain");
      }
    },
  );
}
