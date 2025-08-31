import { FastifyRequest, FastifyReply } from "fastify";

export interface RateLimitConfig {
  max: number;
  timeWindow: number; // in seconds
  keyGenerator?: (req: FastifyRequest) => string;
}

// Simple in-memory rate limiter for development
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function createEnhancedRateLimiter(config: RateLimitConfig) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const key = config.keyGenerator ? config.keyGenerator(request) : request.ip;
    const now = Date.now();
    const windowMs = config.timeWindow * 1000;

    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      // Reset or create new entry
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return;
    }

    if (entry.count >= config.max) {
      return reply.code(429).send({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
    }

    entry.count++;
    rateLimitStore.set(key, entry);
  };
}

export async function trackOtpAttempt(userId: string): Promise<void> {
  // Track OTP attempts - implementation placeholder
  console.log(`Tracking OTP attempt for user: ${userId}`);
}
