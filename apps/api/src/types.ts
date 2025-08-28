import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { JWTPayload } from './auth/auth.service';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
  }
  
  interface FastifyRequest {
    user?: JWTPayload;
  }
}
