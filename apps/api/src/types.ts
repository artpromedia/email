import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { JWTPayload } from './auth/auth.service';
import { DatabaseAdapter } from './db/adapter';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    db: DatabaseAdapter;
  }
  
  interface FastifyRequest {
    user?: JWTPayload;
  }
}
