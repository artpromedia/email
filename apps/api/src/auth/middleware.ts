import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { verifyAccessToken, JWTPayload } from "./auth.service";
import { ZodError } from "zod";
import "../types"; // Import type declarations

declare module "fastify" {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export interface AuthPluginOptions {
  optional?: boolean;
}

const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  fastify,
  options,
) => {
  fastify.decorateRequest("user", null);

  fastify.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip auth for health endpoints
      if (
        request.url.startsWith("/health") ||
        request.url.startsWith("/readiness")
      ) {
        return;
      }

      // Skip auth for login/register endpoints
      if (
        request.url.startsWith("/auth/login") ||
        request.url.startsWith("/auth/register")
      ) {
        return;
      }

      // Skip auth for OpenAPI docs
      if (
        request.url.startsWith("/docs") ||
        request.url.startsWith("/openapi")
      ) {
        return;
      }

      const authorization = request.headers.authorization;

      console.log("🔍 Authorization header:", authorization);

      if (!authorization) {
        if (options.optional) {
          return;
        }
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Missing authorization header",
        });
      }

      const [scheme, token] = authorization.split(" ");

      console.log(
        "🔍 Token scheme:",
        scheme,
        "Token:",
        token?.substring(0, 20) + "...",
      );

      if (scheme !== "Bearer" || !token) {
        if (options.optional) {
          return;
        }
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid authorization header format",
        });
      }

      const payload = await verifyAccessToken(token);

      console.log(
        "🔍 Token verification result:",
        payload ? "SUCCESS" : "FAILED",
      );

      if (!payload) {
        // Temporary demo token bypass for development
        console.log(
          '🔍 Checking demo token bypass, token contains "demo":',
          token.includes("demo"),
        );
        if (token.includes("demo")) {
          console.log("✅ Demo token bypass activated");
          request.user = {
            sub: "1",
            email: "demo@ceerion.com",
            name: "Demo User",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
            jti: "demo-token",
            amr: ["pwd"],
            mfa_level: "none",
          };
          return;
        }

        if (options.optional) {
          return;
        }
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid or expired token",
        });
      }

      // Check if user still exists
      const user = await fastify.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.isDeleted || user.isSuspended) {
        if (options.optional) {
          return;
        }
        return reply.code(401).send({
          error: "Unauthorized",
          message: "User account not found or suspended",
        });
      }

      request.user = payload;
    },
  );
};

export const authMiddleware = fp(authPlugin, {
  name: "auth-middleware",
});

// Helper to require authentication
export const requireAuth = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!request.user) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required",
    });
  }
};

// Helper to require admin role
export const requireAdmin = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!request.user) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required",
    });
  }

  const user = await request.server.prisma.user.findUnique({
    where: { id: request.user.sub },
  });

  if (!user || !user.isAdmin) {
    return reply.code(403).send({
      error: "Forbidden",
      message: "Admin access required",
    });
  }
};

// Helper to check MFA requirement
export const requireMFA = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!request.user) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required",
    });
  }

  const user = await request.server.prisma.user.findUnique({
    where: { id: request.user.sub },
  });

  if (user?.mfaEnabled && !user.mfaVerifiedAt) {
    return reply.code(403).send({
      error: "MFA Required",
      message: "Multi-factor authentication verification required",
    });
  }
};

// Rate limiting middleware
export const createRateLimiter = (options: {
  max: number;
  timeWindow: number;
  keyGenerator?: (request: FastifyRequest) => string;
}) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const key = options.keyGenerator
      ? options.keyGenerator(request)
      : `rate_limit:${request.ip}`;

    const current = await request.server.redis.incr(key);

    if (current === 1) {
      await request.server.redis.expire(key, options.timeWindow);
    }

    if (current > options.max) {
      const ttl = await request.server.redis.ttl(key);
      reply.header("Retry-After", ttl.toString());
      return reply.code(429).send({
        error: "Too Many Requests",
        message: "Rate limit exceeded",
        retryAfter: ttl,
      });
    }

    reply.header("X-Rate-Limit-Limit", options.max.toString());
    reply.header(
      "X-Rate-Limit-Remaining",
      Math.max(0, options.max - current).toString(),
    );
  };
};

// Validation middleware using Zod
export const validateBody = (schema: any) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      request.body = schema.parse(request.body);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: "Validation Error",
          message: "Invalid request body",
          details: error.errors,
        });
      }
      throw error;
    }
  };
};

export const validateQuery = (schema: any) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      request.query = schema.parse(request.query);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: "Validation Error",
          message: "Invalid query parameters",
          details: error.errors,
        });
      }
      throw error;
    }
  };
};

export const validateParams = (schema: any) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      request.params = schema.parse(request.params);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({
          error: "Validation Error",
          message: "Invalid path parameters",
          details: error.errors,
        });
      }
      throw error;
    }
  };
};
