import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import { DatabaseAdapter } from '../db/adapter';

class PrismaAdapter implements DatabaseAdapter {
  constructor(private prisma: PrismaClient) {}

  async query(text: string, params?: any[]) {
    // For now, we'll use raw queries since our mail service expects SQL
    // In a real implementation, you'd want to use Prisma's type-safe queries
    const result = await this.prisma.$queryRawUnsafe(text, ...(params || []));
    return {
      rows: Array.isArray(result) ? result : [result],
      rowCount: Array.isArray(result) ? result.length : 1
    };
  }

  async transaction<T>(fn: (client: DatabaseAdapter) => Promise<T>): Promise<T> {
    return await this.prisma.$transaction(async (tx) => {
      const adapter = new PrismaAdapter(tx as PrismaClient);
      return await fn(adapter);
    });
  }
}

async function databasePlugin(fastify: any) {
  // Use existing Prisma instance from prisma plugin
  const db = new PrismaAdapter(fastify.prisma);

  // Register as decorator
  fastify.decorate('db', db);
}

export default fp(databasePlugin, {
  name: 'database-plugin',
  dependencies: ['prisma-plugin']
});
