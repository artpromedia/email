import { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Health check endpoint
  fastify.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Health check endpoint',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            version: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // Legacy endpoint for compatibility
  fastify.get('/healthz', {
    schema: {
      tags: ['Health'],
      summary: 'Legacy health check endpoint',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' },
          },
        },
      },
    },
    handler: async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      };
    },
  });

  // Readiness check endpoint (includes database and Redis connectivity)
  fastify.get('/readiness', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness check endpoint',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            services: {
              type: 'object',
              properties: {
                database: { type: 'string' },
                redis: { type: 'string' },
              },
            },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            services: {
              type: 'object',
              properties: {
                database: { type: 'string' },
                redis: { type: 'string' },
              },
            },
            errors: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const errors: string[] = [];
    let dbStatus = 'healthy';
    let redisStatus = 'healthy';

    // Check database connectivity
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      dbStatus = 'unhealthy';
      errors.push(`Database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check Redis connectivity
    try {
      await fastify.redis.ping();
    } catch (error) {
      redisStatus = 'unhealthy';
      errors.push(`Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const isHealthy = dbStatus === 'healthy' && redisStatus === 'healthy';
    const status = isHealthy ? 'ready' : 'not ready';
    const statusCode = isHealthy ? 200 : 503;

    const response = {
      status,
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
      ...(errors.length > 0 && { errors }),
    };

    return reply.code(statusCode).send(response);
  });
};
