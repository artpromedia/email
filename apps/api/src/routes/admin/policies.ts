import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../../auth/middleware";
import { logAudit, AuditLogger } from "../../utils/audit-logger";

// Schema definitions
const createPolicySchema = z.object({
  type: z.enum(["trusted_sender", "block_sender", "spam_filter"]),
  value: z.string().min(1),
  action: z.enum(["allow", "block", "mark_as_spam"]),
});

const updatePolicySchema = z.object({
  type: z.enum(["trusted_sender", "block_sender", "spam_filter"]).optional(),
  value: z.string().min(1).optional(),
  action: z.enum(["allow", "block", "mark_as_spam"]).optional(),
});

const passwordPolicySchema = z.object({
  minLength: z.number().min(8),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireNumbers: z.boolean(),
  requireSpecialChars: z.boolean(),
  maxAge: z.number().optional(),
});

const mfaPolicySchema = z.object({
  required: z.boolean(),
  allowSMS: z.boolean(),
  allowTOTP: z.boolean(),
  backupCodes: z.boolean(),
});

const bannerPolicySchema = z.object({
  enabled: z.boolean(),
  message: z.string(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
});

const trustedSenderSchema = z.object({
  email: z.string().email(),
  domain: z.string().optional(),
});

export async function adminPolicyRoutes(fastify: FastifyInstance) {
  // Add admin auth middleware to all routes
  fastify.addHook("preHandler", requireAdmin);

  // POST /admin/policies - Create new policy
  fastify.post(
    "/admin/policies",
    {
      schema: {
        tags: ["Admin", "Policies"],
        summary: "Create new policy",
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof createPolicySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const { type, value, action } = request.body;
      const currentUser = request.user!;

      try {
        // Create the policy
        const policy = await fastify.prisma.policy.create({
          data: {
            userId: currentUser.id,
            type,
            value,
            action,
          },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: AuditLogger.Actions.POLICY_CREATE,
          resourceType: AuditLogger.ResourceTypes.POLICY,
          resourceId: policy.id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            policyType: type,
            policyValue: value,
            policyAction: action,
          },
        });

        return reply.code(201).send({
          message: "Policy created successfully",
          policy: {
            id: policy.id,
            type: policy.type,
            value: policy.value,
            action: policy.action,
            createdAt: policy.createdAt.toISOString(),
          },
        });
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: AuditLogger.Actions.POLICY_CREATE,
          resourceType: AuditLogger.ResourceTypes.POLICY,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
            policyType: type,
            policyValue: value,
            policyAction: action,
          },
        });

        throw error;
      }
    },
  );

  // PUT /admin/policies/:id - Update policy
  fastify.put(
    "/admin/policies/:id",
    {
      schema: {
        tags: ["Admin", "Policies"],
        summary: "Update policy",
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof updatePolicySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const { id: policyId } = request.params;
      const updateData = request.body;
      const currentUser = request.user!;

      try {
        // Get the existing policy
        const existingPolicy = await fastify.prisma.policy.findUnique({
          where: { id: policyId },
        });

        if (!existingPolicy) {
          throw fastify.httpErrors.notFound("Policy not found");
        }

        // Update the policy
        const updatedPolicy = await fastify.prisma.policy.update({
          where: { id: policyId },
          data: updateData,
        });

        // Log audit event with changes
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: AuditLogger.Actions.POLICY_SAVE,
          resourceType: AuditLogger.ResourceTypes.POLICY,
          resourceId: policyId,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            changes: updateData,
            previousValues: {
              type: existingPolicy.type,
              value: existingPolicy.value,
              action: existingPolicy.action,
            },
          },
        });

        return {
          message: "Policy updated successfully",
          policy: {
            id: updatedPolicy.id,
            type: updatedPolicy.type,
            value: updatedPolicy.value,
            action: updatedPolicy.action,
            updatedAt: updatedPolicy.updatedAt.toISOString(),
          },
        };
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: AuditLogger.Actions.POLICY_SAVE,
          resourceType: AuditLogger.ResourceTypes.POLICY,
          resourceId: policyId,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
            changes: updateData,
          },
        });

        throw error;
      }
    },
  );

  // DELETE /admin/policies/:id - Delete policy
  fastify.delete(
    "/admin/policies/:id",
    {
      schema: {
        tags: ["Admin", "Policies"],
        summary: "Delete policy",
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: policyId } = request.params;
      const currentUser = request.user!;

      try {
        // Get the policy before deletion
        const policy = await fastify.prisma.policy.findUnique({
          where: { id: policyId },
        });

        if (!policy) {
          throw fastify.httpErrors.notFound("Policy not found");
        }

        // Delete the policy
        await fastify.prisma.policy.delete({
          where: { id: policyId },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: AuditLogger.Actions.POLICY_DELETE,
          resourceType: AuditLogger.ResourceTypes.POLICY,
          resourceId: policyId,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            deletedPolicy: {
              type: policy.type,
              value: policy.value,
              action: policy.action,
            },
          },
        });

        return {
          message: "Policy deleted successfully",
        };
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: AuditLogger.Actions.POLICY_DELETE,
          resourceType: AuditLogger.ResourceTypes.POLICY,
          resourceId: policyId,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
          },
        });

        throw error;
      }
    },
  );

  // PUT /admin/policies/password - Update password policy
  fastify.put(
    "/admin/policies/password",
    {
      schema: {
        tags: ["Admin", "Policies"],
        summary: "Update password policy",
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof passwordPolicySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const policyData = request.body;
      const currentUser = request.user!;

      try {
        // Update or create password policy
        const policy = await fastify.prisma.systemPolicy.upsert({
          where: { type: "password" },
          update: { settings: policyData },
          create: {
            type: "password",
            settings: policyData,
            createdById: currentUser.id,
          },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "policy.password.save",
          resourceType: AuditLogger.ResourceTypes.POLICY,
          resourceId: policy.id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            policySettings: policyData,
          },
        });

        return {
          message: "Password policy saved successfully",
          policy: {
            id: policy.id,
            settings: policy.settings,
          },
        };
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "policy.password.save",
          resourceType: AuditLogger.ResourceTypes.POLICY,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
            attemptedSettings: policyData,
          },
        });

        throw error;
      }
    },
  );

  // PUT /admin/policies/mfa - Update MFA policy
  fastify.put(
    "/admin/policies/mfa",
    {
      schema: {
        tags: ["Admin", "Policies"],
        summary: "Update MFA policy",
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof mfaPolicySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const policyData = request.body;
      const currentUser = request.user!;

      try {
        // Update or create MFA policy
        const policy = await fastify.prisma.systemPolicy.upsert({
          where: { type: "mfa" },
          update: { settings: policyData },
          create: {
            type: "mfa",
            settings: policyData,
            createdById: currentUser.id,
          },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "policy.mfa.save",
          resourceType: AuditLogger.ResourceTypes.POLICY,
          resourceId: policy.id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            policySettings: policyData,
          },
        });

        return {
          message: "MFA policy saved successfully",
          policy: {
            id: policy.id,
            settings: policy.settings,
          },
        };
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "policy.mfa.save",
          resourceType: AuditLogger.ResourceTypes.POLICY,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
            attemptedSettings: policyData,
          },
        });

        throw error;
      }
    },
  );

  // PUT /admin/policies/external-banner - Update external banner policy
  fastify.put(
    "/admin/policies/external-banner",
    {
      schema: {
        tags: ["Admin", "Policies"],
        summary: "Update external banner policy",
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof bannerPolicySchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const policyData = request.body;
      const currentUser = request.user!;

      try {
        // Update or create banner policy
        const policy = await fastify.prisma.systemPolicy.upsert({
          where: { type: "external-banner" },
          update: { settings: policyData },
          create: {
            type: "external-banner",
            settings: policyData,
            createdById: currentUser.id,
          },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "policy.banner.save",
          resourceType: AuditLogger.ResourceTypes.POLICY,
          resourceId: policy.id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            policySettings: policyData,
          },
        });

        return {
          message: "External banner policy saved successfully",
          policy: {
            id: policy.id,
            settings: policy.settings,
          },
        };
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "policy.banner.save",
          resourceType: AuditLogger.ResourceTypes.POLICY,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
            attemptedSettings: policyData,
          },
        });

        throw error;
      }
    },
  );

  // POST /admin/policies/trusted-senders - Add trusted sender
  fastify.post(
    "/admin/policies/trusted-senders",
    {
      schema: {
        tags: ["Admin", "Policies"],
        summary: "Add trusted sender",
      },
    },
    async (
      request: FastifyRequest<{
        Body: z.infer<typeof trustedSenderSchema>;
      }>,
      reply: FastifyReply,
    ) => {
      const senderData = request.body;
      const currentUser = request.user!;

      try {
        // Add trusted sender
        const trustedSender = await fastify.prisma.trustedSender.create({
          data: {
            email: senderData.email,
            domain: senderData.domain,
            createdById: currentUser.id,
          },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "policy.trusted_senders.change",
          resourceType: AuditLogger.ResourceTypes.POLICY,
          resourceId: trustedSender.id,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            operation: "add",
            senderData: senderData,
          },
        });

        return reply.code(201).send({
          message: "Trusted sender added successfully",
          sender: {
            id: trustedSender.id,
            email: trustedSender.email,
            domain: trustedSender.domain,
          },
        });
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "policy.trusted_senders.change",
          resourceType: AuditLogger.ResourceTypes.POLICY,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
            operation: "add",
            attemptedData: senderData,
          },
        });

        throw error;
      }
    },
  );

  // DELETE /admin/policies/trusted-senders/:id - Remove trusted sender
  fastify.delete(
    "/admin/policies/trusted-senders/:id",
    {
      schema: {
        tags: ["Admin", "Policies"],
        summary: "Remove trusted sender",
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: senderId } = request.params;
      const currentUser = request.user!;

      try {
        // Get the trusted sender before deletion
        const trustedSender = await fastify.prisma.trustedSender.findUnique({
          where: { id: senderId },
        });

        if (!trustedSender) {
          throw fastify.httpErrors.notFound("Trusted sender not found");
        }

        // Delete the trusted sender
        await fastify.prisma.trustedSender.delete({
          where: { id: senderId },
        });

        // Log audit event
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "policy.trusted_senders.change",
          resourceType: AuditLogger.ResourceTypes.POLICY,
          resourceId: senderId,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            operation: "remove",
            deletedSender: {
              email: trustedSender.email,
              domain: trustedSender.domain,
            },
          },
        });

        return {
          message: "Trusted sender removed successfully",
        };
      } catch (error) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.id,
          actorEmail: currentUser.email,
          action: "policy.trusted_senders.change",
          resourceType: AuditLogger.ResourceTypes.POLICY,
          resourceId: senderId,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error.message,
            operation: "remove",
          },
        });

        throw error;
      }
    },
  );
}
