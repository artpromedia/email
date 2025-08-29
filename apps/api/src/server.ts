import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { loadEnv } from './config/env';
import { initTelemetry, getTelemetry } from '@ceerion/observability';

const env = loadEnv();

// Initialize telemetry before other imports
const telemetry = initTelemetry({
  serviceName: 'ceerion-api',
  serviceVersion: '1.0.0',
  environment: env.NODE_ENV,
  otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  prometheusEnabled: true,
});

import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { mailRoutes } from './routes/mail';
import prismaPlugin from './plugins/prisma';
import redisPlugin from './plugins/redis';
import databasePlugin from './plugins/database';
import { authMiddleware } from './auth/middleware';
import './types'; // Import type declarations

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

async function start() {
  try {
    // Register plugins
    await fastify.register(helmet, {
      contentSecurityPolicy: false,
    });

    await fastify.register(cors, {
      origin: env.NODE_ENV === 'production' ? [env.BASE_DOMAIN] : true,
    });

    // Register sensible plugin for HTTP errors
    await fastify.register(sensible);

    // Register database and cache plugins
    await fastify.register(prismaPlugin);
    await fastify.register(redisPlugin);
    await fastify.register(databasePlugin);

    // Register authentication middleware
    await fastify.register(authMiddleware);

    // Swagger documentation
    await fastify.register(swagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'CEERION Mail API',
          description: 'Backend API for CEERION Mail application',
          version: '1.0.0',
        },
        servers: [
          {
            url: `http://${env.API_HOST}:${env.API_PORT}`,
            description: 'Development server',
          },
        ],
        tags: [
          { name: 'Health', description: 'Health check endpoints' },
          { name: 'Authentication', description: 'User authentication endpoints' },
        ],
      },
    });

    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'full',
        deepLinking: false,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });

    // Register routes
    await fastify.register(healthRoutes);
    await fastify.register(authRoutes, { prefix: '/auth' });
    await fastify.register(mailRoutes, { prefix: '/mail' });

    // Serve OpenAPI JSON
    fastify.get('/openapi.json', async () => {
      return fastify.swagger();
    });

    const address = await fastify.listen({
      port: env.API_PORT,
      host: env.API_HOST,
    });

    console.log(`🚀 CEERION Mail API server ready at ${address}`);
    console.log(`📖 API Documentation: ${address}/docs`);
    console.log(`📋 OpenAPI Spec: ${address}/openapi.json`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  try {
    await fastify.close();
    console.log('✅ Server closed');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

start();
