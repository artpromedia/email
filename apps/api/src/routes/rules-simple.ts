import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";

// Extend Fastify types to include JWT functionality
declare module "fastify" {
  interface FastifyRequest {
    jwtVerify(): Promise<void>;
    user?: {
      id: string;
      email: string;
      [key: string]: any;
    };
  }
}

// Basic rule schemas for API validation
const CreateRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
  conditions: z.array(z.any()).min(1),
  actions: z.array(z.any()).min(1),
  triggers: z.array(z.string()).default(["on-receive"]),
});

const UpdateRuleSchema = CreateRuleSchema.partial();

const RunRulesSchema = z.object({
  folder: z.string().optional(),
  labelId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  dryRun: z.boolean().default(false),
});

// Basic response schemas
const RuleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isEnabled: z.boolean(),
  priority: z.number(),
  conditions: z.array(z.any()),
  actions: z.array(z.any()),
  triggers: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ListRulesResponseSchema = z.object({
  rules: z.array(RuleResponseSchema),
  total: z.number(),
});

const JobStatusSchema = z.object({
  id: z.string(),
  status: z.string(),
  progress: z.number(),
  totalItems: z.number(),
  processedItems: z.number(),
  failedItems: z.number(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export async function rulesRoutes(fastify: FastifyInstance) {
  // Simple authentication check
  const checkAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      if (
        !request.user ||
        typeof request.user !== "object" ||
        !("id" in request.user)
      ) {
        reply.code(401).send({ error: "Authentication required" });
        return;
      }
    } catch (error) {
      reply.code(401).send({ error: "Authentication required" });
      return;
    }
  };

  // GET /rules - List all rules for user
  fastify.get(
    "/",
    {
      schema: {
        summary: "List user rules",
        description: "Get all rules for the authenticated user",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          enabled: z.boolean().optional(),
          priority: z.number().int().optional(),
          search: z.string().optional(),
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
        }),
        response: {
          200: ListRulesResponseSchema,
          401: z.object({ error: z.string() }),
        },
      },
      preHandler: checkAuth,
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          enabled?: boolean;
          priority?: number;
          search?: string;
          limit?: number;
          offset?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = (request.user as any).id;
        const {
          enabled,
          priority,
          search,
          limit = 20,
          offset = 0,
        } = request.query;

        const where: any = { userId };

        if (enabled !== undefined) where.isEnabled = enabled;
        if (priority !== undefined) where.priority = priority;
        if (search) {
          where.OR = [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ];
        }

        const [rules, total] = await Promise.all([
          fastify.prisma.rule.findMany({
            where,
            orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
            take: limit,
            skip: offset,
          }),
          fastify.prisma.rule.count({ where }),
        ]);

        reply.send({
          rules: rules.map((rule: any) => ({
            ...rule,
            createdAt: rule.createdAt.toISOString(),
            updatedAt: rule.updatedAt.toISOString(),
          })),
          total,
        });
      } catch (error) {
        fastify.log.error("Failed to list rules", error);
        reply.code(500).send({ error: "Failed to list rules" });
      }
    },
  );

  // POST /rules - Create new rule
  fastify.post(
    "/",
    {
      schema: {
        summary: "Create rule",
        description: "Create a new email rule",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        body: CreateRuleSchema,
        response: {
          201: RuleResponseSchema,
          400: z.object({ error: z.string() }),
          401: z.object({ error: z.string() }),
        },
      },
      preHandler: checkAuth,
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof CreateRuleSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = (request.user as any).id;
        const ruleData = { ...request.body, userId };

        const rule = await fastify.prisma.rule.create({
          data: ruleData,
        });

        // Log rule creation
        await fastify.prisma.ruleAuditLog.create({
          data: {
            ruleId: rule.id,
            userId,
            action: "created",
            changes: rule,
          },
        });

        reply.code(201).send({
          ...rule,
          createdAt: rule.createdAt.toISOString(),
          updatedAt: rule.updatedAt.toISOString(),
        });
      } catch (error) {
        fastify.log.error("Failed to create rule", error);
        reply.code(500).send({ error: "Failed to create rule" });
      }
    },
  );

  // GET /rules/:id - Get specific rule
  fastify.get(
    "/:id",
    {
      schema: {
        summary: "Get rule",
        description: "Get a specific rule by ID",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: {
          200: RuleResponseSchema,
          401: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
      preHandler: checkAuth,
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;
        const userId = (request.user as any).id;

        const rule = await fastify.prisma.rule.findFirst({
          where: { id, userId },
        });

        if (!rule) {
          reply.code(404).send({ error: "Rule not found" });
          return;
        }

        reply.send({
          ...rule,
          createdAt: rule.createdAt.toISOString(),
          updatedAt: rule.updatedAt.toISOString(),
        });
      } catch (error) {
        fastify.log.error("Failed to get rule", error);
        reply.code(500).send({ error: "Failed to get rule" });
      }
    },
  );

  // PUT /rules/:id - Update rule
  fastify.put(
    "/:id",
    {
      schema: {
        summary: "Update rule",
        description: "Update an existing rule",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: UpdateRuleSchema,
        response: {
          200: RuleResponseSchema,
          401: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
      preHandler: checkAuth,
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof UpdateRuleSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;
        const userId = (request.user as any).id;
        const updates = request.body;

        // Check if rule exists and belongs to user
        const existingRule = await fastify.prisma.rule.findFirst({
          where: { id, userId },
        });

        if (!existingRule) {
          reply.code(404).send({ error: "Rule not found" });
          return;
        }

        // Update rule
        const rule = await fastify.prisma.rule.update({
          where: { id },
          data: updates,
        });

        // Log rule update
        await fastify.prisma.ruleAuditLog.create({
          data: {
            ruleId: rule.id,
            userId,
            action: "updated",
            changes: updates,
          },
        });

        reply.send({
          ...rule,
          createdAt: rule.createdAt.toISOString(),
          updatedAt: rule.updatedAt.toISOString(),
        });
      } catch (error) {
        fastify.log.error("Failed to update rule", error);
        reply.code(500).send({ error: "Failed to update rule" });
      }
    },
  );

  // DELETE /rules/:id - Delete rule
  fastify.delete(
    "/:id",
    {
      schema: {
        summary: "Delete rule",
        description: "Delete a rule",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: {
          204: z.object({}),
          401: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
      preHandler: checkAuth,
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;
        const userId = (request.user as any).id;

        // Check if rule exists and belongs to user
        const existingRule = await fastify.prisma.rule.findFirst({
          where: { id, userId },
        });

        if (!existingRule) {
          reply.code(404).send({ error: "Rule not found" });
          return;
        }

        // Delete rule
        await fastify.prisma.rule.delete({
          where: { id },
        });

        // Log rule deletion
        await fastify.prisma.ruleAuditLog.create({
          data: {
            ruleId: id,
            userId,
            action: "deleted",
            changes: existingRule,
          },
        });

        reply.code(204).send();
      } catch (error) {
        fastify.log.error("Failed to delete rule", error);
        reply.code(500).send({ error: "Failed to delete rule" });
      }
    },
  );

  // POST /rules/run - Run rules on existing mail (simplified version)
  fastify.post(
    "/run",
    {
      schema: {
        summary: "Run rules on existing mail",
        description: "Start a background job to run rules on existing mail",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        body: RunRulesSchema,
        response: {
          202: z.object({
            jobId: z.string(),
            message: z.string(),
          }),
          401: z.object({ error: z.string() }),
        },
      },
      preHandler: checkAuth,
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof RunRulesSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const userId = (request.user as any).id;
        const options = request.body;

        // Create a simple job record
        const job = await fastify.prisma.ruleJobQueue.create({
          data: {
            userId,
            jobType: "run-on-existing",
            status: "pending",
            parameters: options,
          },
        });

        reply.code(202).send({
          jobId: job.id,
          message: "Rule execution job started",
        });
      } catch (error) {
        fastify.log.error("Failed to start rules job", error);
        reply.code(500).send({ error: "Failed to start rules job" });
      }
    },
  );

  // GET /rules/jobs/:jobId - Get job status
  fastify.get(
    "/jobs/:jobId",
    {
      schema: {
        summary: "Get job status",
        description: "Get the status of a rules execution job",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        params: z.object({ jobId: z.string() }),
        response: {
          200: JobStatusSchema,
          401: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
      preHandler: checkAuth,
    },
    async (
      request: FastifyRequest<{
        Params: { jobId: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { jobId } = request.params;
        const userId = (request.user as any).id;

        const job = await fastify.prisma.ruleJobQueue.findFirst({
          where: { id: jobId, userId },
        });

        if (!job) {
          reply.code(404).send({ error: "Job not found" });
          return;
        }

        reply.send({
          ...job,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString() || null,
          completedAt: job.completedAt?.toISOString() || null,
        });
      } catch (error) {
        fastify.log.error("Failed to get job status", error);
        reply.code(500).send({ error: "Failed to get job status" });
      }
    },
  );

  // GET /rules/metrics - Get rules execution metrics
  fastify.get(
    "/metrics",
    {
      schema: {
        summary: "Get rules metrics",
        description: "Get execution metrics for rules engine",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({
            metrics: z.object({
              totalRules: z.number(),
              enabledRules: z.number(),
              totalExecutions: z.number(),
              successfulExecutions: z.number(),
              failedExecutions: z.number(),
            }),
          }),
          401: z.object({ error: z.string() }),
        },
      },
      preHandler: checkAuth,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request.user as any).id;

        const [
          totalRules,
          enabledRules,
          totalExecutions,
          successfulExecutions,
          failedExecutions,
        ] = await Promise.all([
          fastify.prisma.rule.count({ where: { userId } }),
          fastify.prisma.rule.count({ where: { userId, isEnabled: true } }),
          fastify.prisma.ruleExecution.count({ where: { userId } }),
          fastify.prisma.ruleExecution.count({
            where: { userId, status: "success" },
          }),
          fastify.prisma.ruleExecution.count({
            where: { userId, status: "failure" },
          }),
        ]);

        reply.send({
          metrics: {
            totalRules,
            enabledRules,
            totalExecutions,
            successfulExecutions,
            failedExecutions,
          },
        });
      } catch (error) {
        fastify.log.error("Failed to get rules metrics", error);
        reply.code(500).send({ error: "Failed to get rules metrics" });
      }
    },
  );
}
