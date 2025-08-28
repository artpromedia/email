import Redis from 'ioredis';
import { loadEnv } from '../config/env';

const env = loadEnv();

export const redis = new Redis(env.REDIS_URL);

export async function connectRedis() {
  try {
    await redis.ping();
    console.log('✅ Redis connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    return false;
  }
}

export async function disconnectRedis() {
  try {
    await redis.quit();
    console.log('✅ Redis disconnected successfully');
  } catch (error) {
    console.error('❌ Redis disconnection failed:', error);
  }
}

export async function healthCheckRedis() {
  try {
    const result = await redis.ping();
    if (result === 'PONG') {
      return { status: 'healthy', message: 'Redis connection OK' };
    }
    return { status: 'unhealthy', message: 'Redis ping failed' };
  } catch (error) {
    return { status: 'unhealthy', message: 'Redis connection failed' };
  }
}

// Session management
export async function setSession(sessionId: string, data: any, ttl: number = 3600) {
  await redis.setex(`session:${sessionId}`, ttl, JSON.stringify(data));
}

export async function getSession(sessionId: string) {
  const data = await redis.get(`session:${sessionId}`);
  return data ? JSON.parse(data) : null;
}

export async function deleteSession(sessionId: string) {
  await redis.del(`session:${sessionId}`);
}

// Blacklist management for JWT tokens
export async function blacklistToken(jti: string, exp: number) {
  const ttl = Math.max(1, exp - Math.floor(Date.now() / 1000));
  await redis.setex(`blacklist:${jti}`, ttl, '1');
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const result = await redis.get(`blacklist:${jti}`);
  return result === '1';
}

// Rate limiting
export async function incrementRateLimit(key: string, windowMs: number, max: number) {
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, Math.ceil(windowMs / 1000));
  }
  return { current, remaining: Math.max(0, max - current) };
}

// Account lockout
export async function incrementFailedAttempts(email: string): Promise<number> {
  const key = `failed_attempts:${email}`;
  const attempts = await redis.incr(key);
  if (attempts === 1) {
    await redis.expire(key, 900); // 15 minutes
  }
  return attempts;
}

export async function resetFailedAttempts(email: string) {
  await redis.del(`failed_attempts:${email}`);
}

export async function lockAccount(email: string, durationSeconds: number = 900) {
  await redis.setex(`locked:${email}`, durationSeconds, '1');
}

export async function isAccountLocked(email: string): Promise<boolean> {
  const result = await redis.get(`locked:${email}`);
  return result === '1';
}
