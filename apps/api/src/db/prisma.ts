import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../config/env';

const env = loadEnv();

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
});

export async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    console.log('✅ Database disconnected successfully');
  } catch (error) {
    console.error('❌ Database disconnection failed:', error);
  }
}

export async function healthCheckDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', message: 'Database connection OK' };
  } catch (error) {
    return { status: 'unhealthy', message: 'Database connection failed' };
  }
}
