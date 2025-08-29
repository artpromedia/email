import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";

// Basic rule structure for now
const RuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
  conditions: z.array(z.any()).min(1),
  actions: z.array(z.any()).min(1),
  triggers: z
    .array(z.enum(["on-receive", "on-send", "manual"]))
    .default(["on-receive"]),
});

// Temporary in-memory storage for rules (for demo purposes)
const rulesStore = new Map<string, any>();
const jobsStore = new Map<string, any>();

export async function rulesRoutes(fastify: FastifyInstance) {
  // GET /settings/rules - List all rules for user
  fastify.get(
    "/",
    {
      schema: {
        summary: "List user rules",
        description: "Get all rules for the authenticated user",
        tags: ["rules"],
        response: {
          200: z.object({
            rules: z.array(z.any()),
            total: z.number(),
          }),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // For demo purposes, return empty array
        const rules = Array.from(rulesStore.values());

        reply.send({
          rules,
          total: rules.length,
        });
      } catch (error) {
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
        body: RuleSchema,
        response: {
          201: z.object({
            id: z.string(),
            message: z.string(),
          }),
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof RuleSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        // Validate rule data
        const validatedRule = RuleSchema.parse(request.body);

        // Generate ID and store rule
        const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const rule = {
          id: ruleId,
          ...validatedRule,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        rulesStore.set(ruleId, rule);

        reply.code(201).send({
          id: ruleId,
          message: "Rule created successfully",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          reply.code(400).send({ error: "Invalid rule data" });
        } else {
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
        params: z.object({
          id: z.string(),
        }),
        response: {
          200: z.any(),
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

      try {
        const rule = rulesStore.get(id);

        if (!rule) {
          reply.code(404).send({ error: "Rule not found" });
          return;
        }

        reply.send(rule);
      } catch (error) {
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
        params: z.object({
          id: z.string(),
        }),
        body: RuleSchema.partial(),
        response: {
          200: z.object({
            message: z.string(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Partial<z.infer<typeof RuleSchema>>;
      }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const updates = request.body;

      try {
        const existingRule = rulesStore.get(id);

        if (!existingRule) {
          reply.code(404).send({ error: "Rule not found" });
          return;
        }

        // Update rule
        const updatedRule = {
          ...existingRule,
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        rulesStore.set(id, updatedRule);

        reply.send({ message: "Rule updated successfully" });
      } catch (error) {
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

      try {
        if (!rulesStore.has(id)) {
          reply.code(404).send({ error: "Rule not found" });
          return;
        }

        rulesStore.delete(id);
        reply.code(204).send();
      } catch (error) {
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
        body: z.object({
          folder: z.string().optional(),
          labelId: z.string().optional(),
          dateFrom: z.string().datetime().optional(),
          dateTo: z.string().datetime().optional(),
          limit: z.number().int().min(1).max(10000).optional(),
          dryRun: z.boolean().default(false),
        }),
        response: {
          202: z.object({
            jobId: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          folder?: string;
          labelId?: string;
          dateFrom?: string;
          dateTo?: string;
          limit?: number;
          dryRun?: boolean;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        // Generate job ID
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create job record
        const job = {
          id: jobId,
          status: "pending",
          progress: 0,
          totalItems: 0,
          processedItems: 0,
          failedItems: 0,
          result: null,
          error: null,
          createdAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
        };

        jobsStore.set(jobId, job);

        // Simulate job processing
        setTimeout(() => {
          const job = jobsStore.get(jobId);
          if (job) {
            job.status = "completed";
            job.progress = 100;
            job.completedAt = new Date().toISOString();
            job.result = { summary: "Rules executed successfully" };
            jobsStore.set(jobId, job);
          }
        }, 2000);

        reply.code(202).send({
          jobId,
          message: "Rule execution job started",
        });
      } catch (error) {
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
        params: z.object({
          jobId: z.string(),
        }),
        response: {
          200: z.object({
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
          }),
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

      try {
        const job = jobsStore.get(jobId);

        if (!job) {
          reply.code(404).send({ error: "Job not found" });
          return;
        }

        reply.send(job);
      } catch (error) {
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
        response: {
          200: z.object({
            metrics: z.object({
              totalRules: z.number(),
              activeRules: z.number(),
              totalExecutions: z.number(),
              averageExecutionTime: z.number(),
            }),
          }),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = {
          totalRules: rulesStore.size,
          activeRules: Array.from(rulesStore.values()).filter(
            (r) => r.isEnabled,
          ).length,
          totalExecutions: 0,
          averageExecutionTime: 0,
        };

        reply.send({ metrics });
      } catch (error) {
        reply.code(500).send({ error: "Failed to get rules metrics" });
      }
    },
  );
}
