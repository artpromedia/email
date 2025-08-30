import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../../auth/middleware";
import { getAuditLogger } from "../../utils/audit-logger";

// Query parameters schema for audit list
const auditQuerySchema = z.object({
  q: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  actor: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  result: z.enum(["SUCCESS", "FAILURE"]).optional(),
  ip: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// Response schemas
const auditEventSchema = z.object({
  id: z.string(),
  ts: z.string().datetime(),
  actorId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  result: z.enum(["SUCCESS", "FAILURE"]),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.record(z.any()).nullable(),
  actor: z
    .object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
});

const auditListResponseSchema = z.object({
  items: z.array(auditEventSchema),
  nextCursor: z.string().nullable(),
  totalApprox: z.number(),
});

export async function adminAuditRoutes(fastify: FastifyInstance) {
  // Add admin auth middleware to all routes
  fastify.addHook("preHandler", requireAdmin);

  // GET /admin/audit - List audit events with filtering
  fastify.get(
    "/admin/audit",
    {
      schema: {
        tags: ["Admin", "Audit"],
        summary: "List audit events",
        description:
          "Get paginated list of audit events with optional filtering",
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: z.infer<typeof auditQuerySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const {
        q,
        from,
        to,
        actor,
        action,
        resourceType,
        resourceId,
        result,
        ip,
        page,
        limit,
        cursor,
      } = request.query;

      const whereClause: any = {};

      // Build where clause for filtering
      if (q) {
        whereClause.OR = [
          { actorEmail: { contains: q, mode: "insensitive" } },
          { action: { contains: q, mode: "insensitive" } },
          { resourceType: { contains: q, mode: "insensitive" } },
          { resourceId: { contains: q, mode: "insensitive" } },
        ];
      }

      if (from) whereClause.ts = { ...whereClause.ts, gte: new Date(from) };
      if (to) whereClause.ts = { ...whereClause.ts, lte: new Date(to) };
      if (actor)
        whereClause.actorEmail = { contains: actor, mode: "insensitive" };
      if (action) whereClause.action = action;
      if (resourceType) whereClause.resourceType = resourceType;
      if (resourceId) whereClause.resourceId = resourceId;
      if (result) whereClause.result = result;
      if (ip) whereClause.ip = { contains: ip };

      // Cursor-based pagination
      if (cursor) {
        whereClause.id = { lt: cursor };
      }

      try {
        const [events, totalCount] = await Promise.all([
          fastify.prisma.auditEvent.findMany({
            where: whereClause,
            orderBy: { ts: "desc" },
            take: limit + 1, // Take one extra to determine if there's a next page
            include: {
              actor: {
                select: { id: true, email: true, name: true },
              },
            },
          }),
          fastify.prisma.auditEvent.count({ where: whereClause }),
        ]);

        const hasMore = events.length > limit;
        const items = hasMore ? events.slice(0, -1) : events;
        const nextCursor = hasMore ? items[items.length - 1]?.id : null;

        return {
          items,
          nextCursor,
          totalApprox: totalCount,
        };
      } catch (error) {
        fastify.log.error(error, "Failed to fetch audit events");
        throw fastify.httpErrors.internalServerError(
          "Failed to fetch audit events",
        );
      }
    },
  );

  // GET /admin/audit/:id - Get single audit event
  fastify.get(
    "/admin/audit/:id",
    {
      schema: {
        tags: ["Admin", "Audit"],
        summary: "Get audit event by ID",
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;

      try {
        const event = await fastify.prisma.auditEvent.findUnique({
          where: { id },
          include: {
            actor: {
              select: { id: true, email: true, name: true },
            },
          },
        });

        if (!event) {
          throw fastify.httpErrors.notFound("Audit event not found");
        }

        return event;
      } catch (error) {
        if (error.statusCode === 404) throw error;
        fastify.log.error(error, "Failed to fetch audit event");
        throw fastify.httpErrors.internalServerError(
          "Failed to fetch audit event",
        );
      }
    },
  );

  // GET /admin/audit/export.csv - Export audit events as CSV
  fastify.get(
    "/admin/audit/export.csv",
    {
      schema: {
        tags: ["Admin", "Audit"],
        summary: "Export audit events as CSV",
        description: "Stream audit events matching filters as CSV download",
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: z.infer<typeof auditQuerySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const {
        q,
        from,
        to,
        actor,
        action,
        resourceType,
        resourceId,
        result,
        ip,
      } = request.query;

      const whereClause: any = {};

      // Build where clause (same as list endpoint)
      if (q) {
        whereClause.OR = [
          { actorEmail: { contains: q, mode: "insensitive" } },
          { action: { contains: q, mode: "insensitive" } },
          { resourceType: { contains: q, mode: "insensitive" } },
          { resourceId: { contains: q, mode: "insensitive" } },
        ];
      }

      if (from) whereClause.ts = { ...whereClause.ts, gte: new Date(from) };
      if (to) whereClause.ts = { ...whereClause.ts, lte: new Date(to) };
      if (actor)
        whereClause.actorEmail = { contains: actor, mode: "insensitive" };
      if (action) whereClause.action = action;
      if (resourceType) whereClause.resourceType = resourceType;
      if (resourceId) whereClause.resourceId = resourceId;
      if (result) whereClause.result = result;
      if (ip) whereClause.ip = { contains: ip };

      try {
        // Set CSV headers
        reply.header("Content-Type", "text/csv");
        reply.header(
          "Content-Disposition",
          `attachment; filename="audit-export-${new Date().toISOString().split("T")[0]}.csv"`,
        );

        // Fetch the data
        const events = await fastify.prisma.auditEvent.findMany({
          where: whereClause,
          orderBy: { ts: "desc" },
          take: 10000, // Reasonable limit for CSV export
          include: {
            actor: {
              select: { email: true },
            },
          },
        });

        // Build CSV content
        const csvHeader =
          "ID,Timestamp,Actor Email,Action,Resource Type,Resource ID,Result,IP Address,User Agent,Metadata\n";

        let csvContent = csvHeader;

        for (const event of events) {
          const csvRow =
            [
              event.id,
              event.ts.toISOString(),
              event.actorEmail || "",
              event.action,
              event.resourceType,
              event.resourceId || "",
              event.result,
              event.ip || "",
              (event.userAgent || "").replace(/"/g, '""'), // Escape quotes in CSV
              JSON.stringify(event.metadata || {}).replace(/"/g, '""'),
            ]
              .map((field) => `"${field}"`)
              .join(",") + "\n";

          csvContent += csvRow;
        }

        return csvContent;
      } catch (error) {
        fastify.log.error(error, "Failed to export audit events");
        throw fastify.httpErrors.internalServerError(
          "Failed to export audit events",
        );
      }
    },
  );
}
