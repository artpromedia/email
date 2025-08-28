import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  createSession,
  verifyRefreshToken,
  blacklistAccessToken,
  blacklistRefreshToken,
  revokeSession,
  revokeAllUserSessions,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  logAuditEvent,
  generateMFACode,
  verifyMFACode,
} from '../auth/auth.service';
import {
  requireAuth,
  createRateLimiter,
  validateBody,
} from '../auth/middleware';
import { isEmailValid, isPasswordStrong } from '@ceerion/shared';

// Validation schemas (for runtime validation)
const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  mfaCode: z.string().length(6).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const resetPasswordRequestSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Rate limiters
  const authRateLimit = createRateLimiter({
    max: 5,
    timeWindow: 900, // 15 minutes
    keyGenerator: (req) => `auth:${req.ip}`,
  });

  const passwordResetRateLimit = createRateLimiter({
    max: 3,
    timeWindow: 3600, // 1 hour
    keyGenerator: (req) => `password_reset:${req.ip}`,
  });

  // Register endpoint
  fastify.post('/auth/register', {
    preHandler: [authRateLimit, validateBody(registerSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Register a new user',
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        409: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { name, email, password } = request.body as z.infer<typeof registerSchema>;

    // Validate email format
    if (!isEmailValid(email)) {
      return reply.code(400).send({
        error: 'Invalid Email',
        message: 'Please provide a valid email address',
      });
    }

    // Validate password strength
    if (!isPasswordStrong(password)) {
      return reply.code(400).send({
        error: 'Weak Password',
        message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character',
      });
    }

    // Check if user already exists
    const existingUser = await fastify.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return reply.code(409).send({
        error: 'User Exists',
        message: 'A user with this email already exists',
      });
    }

    // Create user
    const hashedPassword = await hashPassword(password);
    const user = await fastify.prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        passwordHash: hashedPassword,
      },
    });

    // Log audit event
    await logAuditEvent(
      'user.register',
      'User',
      user.id,
      request.ip,
      request.headers['user-agent'] || null,
      user.id
    );

    return reply.code(201).send({
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    });
  });

  // Login endpoint  
  fastify.post('/auth/login', {
    preHandler: [authRateLimit, validateBody(loginSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Login user',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          mfaCode: { type: 'string', minLength: 6, maxLength: 6 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                mfaEnabled: { type: 'boolean' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, mfaCode } = request.body as z.infer<typeof loginSchema>;

    // Check if account is locked
    const lockKey = `account_lock:${email.toLowerCase()}`;
    const isLocked = await fastify.redis.get(lockKey);
    if (isLocked) {
      return reply.code(423).send({
        error: 'Account Locked',
        message: 'Account is temporarily locked due to multiple failed login attempts',
      });
    }

    // Find user
    const user = await fastify.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || user.isDeleted || user.isSuspended) {
      // Track failed attempt
      await fastify.redis.incr(`failed_attempts:${email.toLowerCase()}`);
      await fastify.redis.expire(`failed_attempts:${email.toLowerCase()}`, 900); // 15 minutes

      return reply.code(401).send({
        error: 'Invalid Credentials',
        message: 'Invalid email or password',
      });
    }

    // Verify password
    if (!user.passwordHash) {
      return reply.code(401).send({
        error: 'Invalid Credentials',
        message: 'Invalid email or password',
      });
    }

    const isPasswordValid = await verifyPassword(user.passwordHash, password);
    if (!isPasswordValid) {
      // Track failed attempt
      const failedAttempts = await fastify.redis.incr(`failed_attempts:${email.toLowerCase()}`);
      await fastify.redis.expire(`failed_attempts:${email.toLowerCase()}`, 900);

      if (failedAttempts >= 5) {
        await fastify.redis.setex(lockKey, 1800, 'locked'); // 30 minutes lock
      }

      await logAuditEvent(
        'auth.login_failed',
        'User',
        user.id,
        request.ip,
        request.headers['user-agent'] || null,
        user.id
      );

      return reply.code(401).send({
        error: 'Invalid Credentials',
        message: 'Invalid email or password',
      });
    }

    // Check MFA if enabled
    if (user.mfaEnabled) {
      if (!mfaCode) {
        return reply.code(403).send({
          error: 'MFA Required',
          message: 'Multi-factor authentication code required',
        });
      }

      const isMFAValid = verifyMFACode(user.mfaSecret!, mfaCode);
      if (!isMFAValid) {
        return reply.code(401).send({
          error: 'Invalid MFA Code',
          message: 'Invalid multi-factor authentication code',
        });
      }

      // Update MFA verification timestamp
      await fastify.prisma.user.update({
        where: { id: user.id },
        data: { mfaVerifiedAt: new Date() },
      });
    }

    // Clear failed attempts
    await fastify.redis.del(`failed_attempts:${email.toLowerCase()}`);

    // Create session
    const { session, refreshToken } = await createSession(
      user.id,
      request.ip,
      request.headers['user-agent'],
      `${request.headers['user-agent']} - ${request.ip}`
    );

    // Generate access token
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    // Log successful login
    await logAuditEvent(
      'auth.login_success',
      'User',
      user.id,
      request.ip,
      request.headers['user-agent'] || null,
      user.id
    );

    return reply.send({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mfaEnabled: user.mfaEnabled,
      },
    });
  });

  // Legacy login endpoint for backwards compatibility
  fastify.post('/login', {
    schema: {
      tags: ['Authentication'],
      summary: 'User login (legacy)',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    handler: async (request) => {
      const { email, password } = request.body as { email: string; password: string };
      
      // TODO: Implement actual authentication logic
      if (email === 'demo@ceerion.com' && password === 'demo') {
        return {
          token: 'demo-jwt-token',
          user: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            email: 'demo@ceerion.com',
            name: 'Demo User',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
      }

      throw fastify.httpErrors.unauthorized('Invalid credentials');
    },
  });

  // Refresh token endpoint
  fastify.post('/auth/refresh', {
    preHandler: [validateBody(refreshSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Refresh access token',
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { refreshToken } = request.body as z.infer<typeof refreshSchema>;

    const payload = await verifyRefreshToken(refreshToken);
    if (!payload) {
      return reply.code(401).send({
        error: 'Invalid Token',
        message: 'Invalid or expired refresh token',
      });
    }

    // Get user
    const user = await fastify.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.isDeleted || user.isSuspended) {
      return reply.code(401).send({
        error: 'User Not Found',
        message: 'User account not found or suspended',
      });
    }

    // Blacklist old refresh token
    await blacklistRefreshToken(refreshToken);

    // Create new session
    const { session, refreshToken: newRefreshToken } = await createSession(
      user.id,
      request.ip,
      request.headers['user-agent'],
      `${request.headers['user-agent']} - ${request.ip}`
    );

    // Generate new access token
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    return reply.send({
      accessToken,
      refreshToken: newRefreshToken,
    });
  });

  // Logout endpoint
  fastify.post('/auth/logout', {
    preHandler: [requireAuth],
    schema: {
      tags: ['Authentication'],
      summary: 'Logout user',
      headers: {
        type: 'object',
        properties: {
          authorization: { type: 'string' },
        },
        required: ['authorization'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const token = request.headers.authorization?.split(' ')[1];
    if (token) {
      await blacklistAccessToken(token);
    }

    // Log logout
    await logAuditEvent(
      'auth.logout',
      'User',
      request.user!.sub,
      request.ip,
      request.headers['user-agent'] || null,
      request.user!.sub
    );

    return reply.send({
      message: 'Logout successful',
    });
  });
};
