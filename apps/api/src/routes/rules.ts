import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { RuleSchema } from "../services/rules/types";
import { RulesEngine } from "../services/rules/engine";

// Request schemas
const CreateRuleSchema = RuleSchema.omit({ id: true });
const UpdateRuleSchema = RuleSchema.partial().required({ id: true });

const RunRulesSchema = z.object({
  folder: z.string().optional(),
  labelId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(10000).optional(),
  dryRun: z.boolean().default(false),
});

// Response schemas
const RuleResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
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

const JobStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  progress: z.number(),
  totalItems: z.number(),
  processedItems: z.number(),
  failedItems: z.number(),
  result: z.any().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export async function rulesRoutes(fastify: FastifyInstance) {
  const rulesEngine = new RulesEngine(fastify.prisma);

  // Middleware to ensure authentication
  fastify.addHook("preHandler", async (request, reply) => {
    await request.jwtVerify();
    if (
      !request.user ||
      typeof request.user !== "object" ||
      !("id" in request.user)
    ) {
      reply.code(401).send({ error: "Authentication required" });
      return;
    }
  });

  // GET /settings/rules - List all rules for user
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
          trigger: z.enum(["on-receive", "on-send", "manual"]).optional(),
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).default(0),
        }),
        response: {
          200: z.object({
            rules: z.array(RuleResponseSchema),
            total: z.number(),
          }),
        },
      },
    },
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      const { enabled, trigger, limit = 50, offset = 0 } = request.query as any;
      const userId = (request.user as any).id;

      try {
        const where: any = { userId };
        if (enabled !== undefined) where.isEnabled = enabled;
        if (trigger) where.triggers = { has: trigger };

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
        request.log.error("Failed to list rules:", error);
        reply.code(500).send({ error: "Failed to list rules" });
      }
    },
  );

  // POST /settings/rules - Create new rule
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
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof CreateRuleSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const userId = (request.user as any).id;
      const ruleData = { ...request.body, userId };

      try {
        // Validate rule data
        const validatedRule = CreateRuleSchema.parse(ruleData);

        // Create rule
        const rule = await fastify.prisma.rule.create({
          data: {
            ...validatedRule,
            userId,
          },
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
        if (error instanceof z.ZodError) {
          reply
            .code(400)
            .send({ error: "Invalid rule data", details: error.errors });
        } else {
          request.log.error("Failed to create rule:", error);
          reply.code(500).send({ error: "Failed to create rule" });
        }
      }
    },
  );

  // GET /settings/rules/:id - Get specific rule
  fastify.get(
    "/:id",
    {
      schema: {
        summary: "Get rule",
        description: "Get a specific rule by ID",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string(),
        }),
        response: {
          200: RuleResponseSchema,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const userId = (request.user as any).id;

      try {
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
        request.log.error("Failed to get rule:", error);
        reply.code(500).send({ error: "Failed to get rule" });
      }
    },
  );

  // PUT /settings/rules/:id - Update rule
  fastify.put(
    "/:id",
    {
      schema: {
        summary: "Update rule",
        description: "Update an existing rule",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string(),
        }),
        body: UpdateRuleSchema.omit({ id: true, userId: true }),
        response: {
          200: RuleResponseSchema,
          404: z.object({ error: z.string() }),
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Partial<z.infer<typeof CreateRuleSchema>>;
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const userId = (request.user as any).id;
      const updates = request.body;

      try {
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
        request.log.error("Failed to update rule:", error);
        reply.code(500).send({ error: "Failed to update rule" });
      }
    },
  );

  // DELETE /settings/rules/:id - Delete rule
  fastify.delete(
    "/:id",
    {
      schema: {
        summary: "Delete rule",
        description: "Delete a rule",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        params: z.object({
          id: z.string(),
        }),
        response: {
          204: z.object({}),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const userId = (request.user as any).id;

      try {
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
        request.log.error("Failed to delete rule:", error);
        reply.code(500).send({ error: "Failed to delete rule" });
      }
    },
  );

  // POST /settings/rules/run - Run rules on existing mail
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
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof RunRulesSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const userId = (request.user as any).id;
      const options = request.body;

      try {
        // Convert date strings to Date objects
        const processedOptions = {
          ...options,
          dateFrom: options.dateFrom ? new Date(options.dateFrom) : undefined,
          dateTo: options.dateTo ? new Date(options.dateTo) : undefined,
        };

        // Start background job
        const jobId = await rulesEngine.runOnExistingMail(
          userId,
          processedOptions,
        );

        reply.code(202).send({
          jobId,
          message: "Rule execution job started",
        });
      } catch (error) {
        request.log.error("Failed to start rules job:", error);
        reply.code(500).send({ error: "Failed to start rules job" });
      }
    },
  );

  // GET /settings/rules/jobs/:jobId - Get job status
  fastify.get(
    "/jobs/:jobId",
    {
      schema: {
        summary: "Get job status",
        description: "Get the status of a rules execution job",
        tags: ["rules"],
        security: [{ bearerAuth: [] }],
        params: z.object({
          jobId: z.string(),
        }),
        response: {
          200: JobStatusSchema,
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { jobId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { jobId } = request.params;
      const userId = (request.user as any).id;

      try {
        const job = await rulesEngine.getJobStatus(jobId, userId);

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
        request.log.error("Failed to get job status:", error);
        reply.code(500).send({ error: "Failed to get job status" });
      }
    },
  );

  // GET /settings/rules/metrics - Get rules execution metrics
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
            metrics: z.any(),
          }),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = rulesEngine.getMetrics();
        reply.send({ metrics });
      } catch (error) {
        request.log.error("Failed to get rules metrics:", error);
        reply.code(500).send({ error: "Failed to get rules metrics" });
      }
    },
  );
}
