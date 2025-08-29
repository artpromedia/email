import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { JWTPayload } from "../auth/auth.service";
import "../types"; // Import type declarations

// Type-safe authentication helper
const getAuthenticatedUser = (request: FastifyRequest): JWTPayload => {
  if (!request.user) {
    throw new Error("Authentication required");
  }
  return request.user;
};

export default async function rulesRoutes(fastify: FastifyInstance) {
  // List rules endpoint
  fastify.get(
    "/rules",
    {
      schema: {
        summary: "List user rules",
        description: "Get all rules for the authenticated user",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            priority: { type: "integer" },
            search: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              rules: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string" },
                    isEnabled: { type: "boolean" },
                    priority: { type: "number" },
                    conditions: { type: "array" },
                    actions: { type: "array" },
                    triggers: { type: "array" },
                    createdAt: { type: "string" },
                    updatedAt: { type: "string" },
                  },
                },
              },
              total: { type: "number" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedUser(request);
        const query = request.query as any;

        const where: any = {
          userId: user.sub,
        };

        if (query.enabled !== undefined) {
          where.isEnabled = query.enabled;
        }

        if (query.priority !== undefined) {
          where.priority = query.priority;
        }

        if (query.search) {
          where.OR = [
            { name: { contains: query.search, mode: "insensitive" } },
            { description: { contains: query.search, mode: "insensitive" } },
          ];
        }

        const [rules, total] = await Promise.all([
          // Use any type to bypass Prisma client type issues
          (fastify.prisma as any).rule.findMany({
            where,
            orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
            take: query.limit || 20,
            skip: query.offset || 0,
          }),
          (fastify.prisma as any).rule.count({ where }),
        ]);

        reply.code(200).send({
          rules,
          total,
        });
      } catch (error) {
        fastify.log.error("Failed to list rules");
        reply.code(500).send({
          error: "Failed to list rules",
          message: "Internal server error",
        });
      }
    },
  );

  // Create rule endpoint
  fastify.post(
    "/rules",
    {
      schema: {
        summary: "Create rule",
        description: "Create a new email rule",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["name", "priority", "conditions", "actions", "triggers"],
          properties: {
            name: { type: "string", minLength: 1 },
            description: { type: "string" },
            isEnabled: { type: "boolean", default: true },
            priority: { type: "integer", minimum: 1, maximum: 100 },
            conditions: { type: "array" },
            actions: { type: "array" },
            triggers: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
        response: {
          201: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              isEnabled: { type: "boolean" },
              priority: { type: "number" },
              conditions: { type: "array" },
              actions: { type: "array" },
              triggers: { type: "array" },
              createdAt: { type: "string" },
              updatedAt: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedUser(request);
        const body = request.body as any;

        const rule = await (fastify.prisma as any).rule.create({
          data: {
            ...body,
            userId: user.sub,
          },
        });

        await (fastify.prisma as any).ruleAuditLog.create({
          data: {
            ruleId: rule.id,
            userId: user.sub,
            action: "CREATE",
            changes: JSON.stringify(body),
            metadata: JSON.stringify({
              userAgent: request.headers["user-agent"],
            }),
          },
        });

        reply.code(201).send(rule);
      } catch (error) {
        fastify.log.error("Failed to create rule");
        reply.code(500).send({
          error: "Failed to create rule",
          message: "Internal server error",
        });
      }
    },
  );

  // Get single rule endpoint
  fastify.get(
    "/rules/:id",
    {
      schema: {
        summary: "Get rule",
        description: "Get a specific rule by ID",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              isEnabled: { type: "boolean" },
              priority: { type: "number" },
              conditions: { type: "array" },
              actions: { type: "array" },
              triggers: { type: "array" },
              createdAt: { type: "string" },
              updatedAt: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedUser(request);
        const params = request.params as any;

        const rule = await (fastify.prisma as any).rule.findFirst({
          where: {
            id: params.id,
            userId: user.sub,
          },
        });

        if (!rule) {
          return reply.code(404).send({
            error: "Rule not found",
            message:
              "The requested rule does not exist or you don't have access to it",
          });
        }

        reply.code(200).send(rule);
      } catch (error) {
        fastify.log.error("Failed to get rule");
        reply.code(500).send({
          error: "Failed to get rule",
          message: "Internal server error",
        });
      }
    },
  );

  // Update rule endpoint
  fastify.put(
    "/rules/:id",
    {
      schema: {
        summary: "Update rule",
        description: "Update an existing rule",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1 },
            description: { type: "string" },
            isEnabled: { type: "boolean" },
            priority: { type: "integer", minimum: 1, maximum: 100 },
            conditions: { type: "array" },
            actions: { type: "array" },
            triggers: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              isEnabled: { type: "boolean" },
              priority: { type: "number" },
              conditions: { type: "array" },
              actions: { type: "array" },
              triggers: { type: "array" },
              createdAt: { type: "string" },
              updatedAt: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedUser(request);
        const params = request.params as any;
        const body = request.body as any;

        // Check if rule exists and belongs to user
        const existingRule = await (fastify.prisma as any).rule.findFirst({
          where: {
            id: params.id,
            userId: user.sub,
          },
        });

        if (!existingRule) {
          return reply.code(404).send({
            error: "Rule not found",
            message:
              "The requested rule does not exist or you don't have access to it",
          });
        }

        const rule = await (fastify.prisma as any).rule.update({
          where: { id: params.id },
          data: body,
        });

        await (fastify.prisma as any).ruleAuditLog.create({
          data: {
            ruleId: rule.id,
            userId: user.sub,
            action: "UPDATE",
            changes: JSON.stringify(body),
            metadata: JSON.stringify({
              userAgent: request.headers["user-agent"],
            }),
          },
        });

        reply.code(200).send(rule);
      } catch (error) {
        fastify.log.error("Failed to update rule");
        reply.code(500).send({
          error: "Failed to update rule",
          message: "Internal server error",
        });
      }
    },
  );

  // Delete rule endpoint
  fastify.delete(
    "/rules/:id",
    {
      schema: {
        summary: "Delete rule",
        description: "Delete a rule",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
        response: {
          204: {
            type: "null",
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const user = getAuthenticatedUser(request);
        const params = request.params as any;

        // Check if rule exists and belongs to user
        const existingRule = await (fastify.prisma as any).rule.findFirst({
          where: {
            id: params.id,
            userId: user.sub,
          },
        });

        if (!existingRule) {
          return reply.code(404).send({
            error: "Rule not found",
            message:
              "The requested rule does not exist or you don't have access to it",
          });
        }

        await (fastify.prisma as any).rule.delete({
          where: { id: params.id },
        });

        await (fastify.prisma as any).ruleAuditLog.create({
          data: {
            ruleId: params.id,
            userId: user.sub,
            action: "DELETE",
            changes: JSON.stringify({ deleted: true }),
            metadata: JSON.stringify({
              userAgent: request.headers["user-agent"],
            }),
          },
        });

        reply.code(204).send();
      } catch (error) {
        fastify.log.error("Failed to delete rule");
        reply.code(500).send({
          error: "Failed to delete rule",
          message: "Internal server error",
        });
      }
    },
  );
}
