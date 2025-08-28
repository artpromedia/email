import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { loadEnv } from './config/env';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';

const env = loadEnv();

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
    await fastify.register(authRoutes, { prefix: '/api/v1/auth' });

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
