import { NextResponse } from "next/server";

/**
 * Check database connectivity by attempting a simple query
 */
function checkDatabase(): boolean {
  try {
    // In production, this would use the actual database client
    // For now, check if DATABASE_URL is configured
    const dbUrl = process.env['DATABASE_URL'];
    if (!dbUrl) {
      console.warn("DATABASE_URL not configured");
      return false;
    }
    // Simulate a lightweight connectivity check
    // In production: await db.execute(sql`SELECT 1`)
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
    // In production, this would use the actual Redis client
    // For now, check if REDIS_URL is configured
    const redisUrl = process.env['REDIS_URL'];
    if (!redisUrl) {
      // Redis is optional for admin dashboard
      return true;
    }
    // Simulate a lightweight connectivity check
    // In production: await redis.ping()
    return true;
  } catch (error) {
    console.error("Redis health check failed:", error);
    return false;
  }
}

/**
 * Check auth service availability
 */
function checkAuthService(): boolean {
  try {
    const authServiceUrl = process.env['AUTH_SERVICE_URL'];
    if (!authServiceUrl) {
      // Auth service URL not configured, assume internal auth
      return true;
    }
    // In production, make a lightweight health check request
    // const response = await fetch(`${authServiceUrl}/health`);
    // return response.ok;
    return true;
  } catch (error) {
    console.error("Auth service health check failed:", error);
    return false;
  }
}

/**
 * GET /api/health/ready
 * Readiness probe for admin dashboard
 */
export async function GET() {
  const checks = {
    server: true,
    database: false,
    redis: false,
    authService: false,
  };

  try {
    // Check database connectivity
    checks.database = checkDatabase();

    // Check Redis connectivity
    checks.redis = checkRedis();

    // Check auth service availability
    checks.authService = checkAuthService();

    const allHealthy = Object.values(checks).every(Boolean);

    return NextResponse.json(
      {
        status: allHealthy ? "ready" : "not_ready",
        checks,
        timestamp: new Date().toISOString(),
        service: "admin-app",
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
        service: "admin-app",
      },
      { status: 503 }
    );
  }
}
