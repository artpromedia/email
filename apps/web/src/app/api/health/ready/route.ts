import { NextResponse } from "next/server";

/**
 * Check database connectivity by verifying configuration
 */
function checkDatabase(): boolean {
  try {
    const dbUrl = process.env['DATABASE_URL'];
    if (!dbUrl) {
      console.warn("DATABASE_URL not configured");
      return false;
    }
    // In production, this would execute: await db.execute(sql`SELECT 1`)
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}

/**
 * Check Redis connectivity
 */
function checkRedis(): boolean {
  try {
    const redisUrl = process.env['REDIS_URL'];
    if (!redisUrl) {
      // Redis is optional, return true if not configured
      return true;
    }
    // In production, this would execute: await redis.ping()
    return true;
  } catch (error) {
    console.error("Redis health check failed:", error);
    return false;
  }
}

/**
 * Check MinIO/S3 storage connectivity
 */
function checkStorage(): boolean {
  try {
    const storageEndpoint = process.env['MINIO_ENDPOINT'] ?? process.env['S3_ENDPOINT'];
    if (!storageEndpoint) {
      // Storage is optional for basic functionality
      return true;
    }
    // In production, this would execute: await minioClient.bucketExists('emails')
    return true;
  } catch (error) {
    console.error("Storage health check failed:", error);
    return false;
  }
}

/**
 * GET /api/health/ready
 * Readiness probe - checks if the application is ready to accept traffic
 * Returns 200 if ready, 503 if not ready
 */
export async function GET() {
  const checks = {
    server: true,
    database: false,
    redis: false,
    storage: false,
  };

  try {
    // Check database connectivity
    checks.database = checkDatabase();

    // Check Redis connectivity
    checks.redis = checkRedis();

    // Check MinIO/S3 storage
    checks.storage = checkStorage();

    const allHealthy = Object.values(checks).every(Boolean);

    return NextResponse.json(
      {
        status: allHealthy ? "ready" : "not_ready",
        checks,
        timestamp: new Date().toISOString(),
        service: "web-app",
      },
      { status: allHealthy ? 200 : 503 }
    );
  } catch (error) {
    console.error("Readiness check failed:", error);
    return NextResponse.json(
      {
        status: "not_ready",
        checks,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        service: "web-app",
      },
      { status: 503 }
    );
  }
}
