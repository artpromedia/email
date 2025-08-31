import { FastifyInstance } from "fastify";

export async function metricsRoutes(fastify: FastifyInstance) {
  // Metrics routes can be added here for additional custom metrics
  // Note: /metrics endpoint is handled in health.ts
}
