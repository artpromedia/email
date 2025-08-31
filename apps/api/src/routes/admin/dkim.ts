import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../../auth/middleware";
import { logAudit, AuditLogger } from "../../utils/audit-logger";
import { generateKeyPair } from "crypto";
import { promisify } from "util";

const generateKeyPairAsync = promisify(generateKeyPair);

// Schema definitions
const domainSchema = z.object({
  domain: z
    .string()
    .min(1)
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\..*$/,
      "Invalid domain format",
    ),
});

const dkimKeySchema = z.object({
  selector: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/,
      "Invalid selector format",
    ),
  keySize: z.number().optional().default(2048),
});

export async function adminDKIMRoutes(fastify: FastifyInstance) {
  // Add admin auth middleware to all routes
  fastify.addHook("preHandler", requireAdmin);

  // GET /admin/dkim/domains - List DKIM configurations
  fastify.get(
    "/admin/dkim/domains",
    {
      schema: {

        summary: "List DKIM configurations",
        description: "Get all domains with DKIM configuration status",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;

      try {
        // TODO: Replace with actual DKIM configuration query
        // This would typically query a dkim_keys table or similar
        const mockDomains = [
          {
            domain: "company.com",
            selector: "default",
            keyBits: 2048,
            status: "active",
            createdAt: new Date(Date.now() - 86400000 * 30),
            lastRotated: new Date(Date.now() - 86400000 * 7),
            dnsRecord: "default._domainkey.company.com",
          },
          {
            domain: "mail.company.com",
            selector: "mail",
            keyBits: 2048,
            status: "active",
            createdAt: new Date(Date.now() - 86400000 * 15),
            lastRotated: new Date(Date.now() - 86400000 * 2),
            dnsRecord: "mail._domainkey.mail.company.com",
          },
        ];

        // Log audit event for viewing DKIM configs
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "dkim.view",
          resourceType: AuditLogger.ResourceTypes.DKIM,
          resourceId: "all",
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            domainsCount: mockDomains.length,
          },
        });

        return {
          domains: mockDomains,
          total: mockDomains.length,
        };
      } catch (error: any) {
        fastify.log.error("Failed to fetch DKIM domains", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to fetch DKIM configurations",
        );
      }
    },
  );

  // POST /admin/dkim/domains/:domain/rotate - Rotate DKIM keys
  fastify.post(
    "/admin/dkim/domains/:domain/rotate",
    {
      schema: {

        summary: "Rotate DKIM keys",
        description: "Generate new DKIM key pair for a domain",
        params: {
          type: "object",
          required: ["domain"],
          properties: {
            domain: { type: "string" },
          },
        },
        body: {
          type: "object",
          properties: {
            selector: {
              type: "string",
              pattern: "^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$",
            },
            keySize: { type: "number", enum: [1024, 2048, 4096] },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { domain: string };
        Body: {
          selector?: string;
          keySize?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { domain } = request.params;
      const { selector = "default", keySize = 2048 } = request.body;
      const currentUser = request.user!;

      try {
        // Validate domain format
        domainSchema.parse({ domain });
        dkimKeySchema.parse({ selector, keySize });

        // Generate new DKIM key pair
        const { publicKey, privateKey } = await generateKeyPairAsync("rsa", {
          modulusLength: keySize,
          publicKeyEncoding: {
            type: "spki",
            format: "pem",
          },
          privateKeyEncoding: {
            type: "pkcs8",
            format: "pem",
          },
        });

        // Extract public key for DNS record
        const publicKeyData = publicKey
          .replace(/-----BEGIN PUBLIC KEY-----\n/, "")
          .replace(/\n-----END PUBLIC KEY-----/, "")
          .replace(/\n/g, "");

        // TODO: Store in database/configuration
        // await storeDKIMKey(domain, selector, privateKey, publicKey);

        const dnsRecord = `${selector}._domainkey.${domain}`;
        const txtRecord = `v=DKIM1; k=rsa; p=${publicKeyData}`;

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: AuditLogger.Actions.DKIM_ROTATE,
          resourceType: AuditLogger.ResourceTypes.DKIM,
          resourceId: domain,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            domain,
            selector,
            keySize,
            dnsRecord,
            rotationTimestamp: new Date().toISOString(),
          },
        });

        return {
          message: "DKIM keys rotated successfully",
          domain,
          selector,
          keySize,
          dnsRecord,
          txtRecord,
          publicKey: publicKeyData,
          rotatedAt: new Date(),
        };
      } catch (error: any) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: AuditLogger.Actions.DKIM_ROTATE,
          resourceType: AuditLogger.ResourceTypes.DKIM,
          resourceId: domain,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error?.message || "Unknown error",
            domain,
            selector,
            keySize,
          },
        });

        if (error?.name === "ZodError") {
          throw fastify.httpErrors.badRequest(
            "Invalid domain or selector format",
          );
        }

        fastify.log.error("Failed to rotate DKIM keys", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to rotate DKIM keys",
        );
      }
    },
  );

  // GET /admin/dkim/domains/:domain/dns - Get DNS records for DKIM
  fastify.get(
    "/admin/dkim/domains/:domain/dns",
    {
      schema: {

        summary: "Get DKIM DNS records",
        description: "Get the DNS TXT records needed for DKIM setup",
        params: {
          type: "object",
          required: ["domain"],
          properties: {
            domain: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { domain: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { domain } = request.params;
      const currentUser = request.user!;

      try {
        // TODO: Fetch actual DKIM configuration from database
        const mockDkimConfig = {
          domain,
          selector: "default",
          publicKey: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...",
          status: "active",
        };

        const dnsRecords = [
          {
            type: "TXT",
            name: `${mockDkimConfig.selector}._domainkey.${domain}`,
            value: `v=DKIM1; k=rsa; p=${mockDkimConfig.publicKey}`,
            ttl: 3600,
          },
          {
            type: "TXT",
            name: `_dmarc.${domain}`,
            value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
            ttl: 3600,
          },
        ];

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "dkim.dns_view",
          resourceType: AuditLogger.ResourceTypes.DKIM,
          resourceId: domain,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            domain,
            recordsCount: dnsRecords.length,
          },
        });

        return {
          domain,
          dnsRecords,
          instructions:
            "Add these DNS records to your domain's DNS configuration",
        };
      } catch (error: any) {
        fastify.log.error("Failed to fetch DKIM DNS records", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to fetch DNS records",
        );
      }
    },
  );

  // DELETE /admin/dkim/domains/:domain - Remove DKIM configuration
  fastify.delete(
    "/admin/dkim/domains/:domain",
    {
      schema: {

        summary: "Remove DKIM configuration",
        description: "Remove DKIM keys and configuration for a domain",
        params: {
          type: "object",
          required: ["domain"],
          properties: {
            domain: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { domain: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { domain } = request.params;
      const currentUser = request.user!;

      try {
        // TODO: Remove DKIM configuration from database
        // await removeDKIMConfiguration(domain);

        // Log audit event
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "dkim.remove",
          resourceType: AuditLogger.ResourceTypes.DKIM,
          resourceId: domain,
          result: "SUCCESS",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            domain,
            removedAt: new Date().toISOString(),
          },
        });

        return {
          message: `DKIM configuration removed for ${domain}`,
          domain,
          removedAt: new Date(),
        };
      } catch (error: any) {
        // Log audit failure
        await logAudit({
          actorId: currentUser.sub,
          actorEmail: currentUser.email,
          action: "dkim.remove",
          resourceType: AuditLogger.ResourceTypes.DKIM,
          resourceId: domain,
          result: "FAILURE",
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          metadata: {
            error: error?.message || "Unknown error",
            domain,
          },
        });

        fastify.log.error("Failed to remove DKIM configuration", error);
        throw fastify.httpErrors.internalServerError(
          "Failed to remove DKIM configuration",
        );
      }
    },
  );
}
