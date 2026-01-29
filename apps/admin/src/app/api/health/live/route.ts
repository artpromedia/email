import { NextResponse } from "next/server";

/**
 * GET /api/health/live
 * Liveness probe for admin dashboard
 */
export function GET() {
  try {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    const heapUsedPercentage = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    const isHealthy = heapUsedPercentage < 90;

    return NextResponse.json(
      {
        status: isHealthy ? "alive" : "unhealthy",
        uptime: Math.floor(uptime),
        memory: {
          heapUsed: Math.floor(memoryUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.floor(memoryUsage.heapTotal / 1024 / 1024), // MB
          heapUsedPercentage: Math.floor(heapUsedPercentage),
        },
        timestamp: new Date().toISOString(),
        service: "admin-app",
        version: process.env.APP_VERSION || "unknown",
      },
      { status: isHealthy ? 200 : 503 }
    );
  } catch (error) {
    console.error("Liveness check failed:", error);
    return NextResponse.json(
      {
        status: "dead",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        service: "admin-app",
      },
      { status: 503 }
    );
  }
}
