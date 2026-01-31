import { NextResponse } from "next/server";

/**
 * GET /api/health/live
 * Liveness probe - checks if the application is running
 * Returns 200 if alive, 503 if dead
 */
export function GET() {
  try {
    // Basic liveness check - just verify the service is responding
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Check if memory usage is within acceptable limits (e.g., < 90% of heap limit)
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
        service: "web-app",
        version: process.env['APP_VERSION'] || "unknown",
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
        service: "web-app",
      },
      { status: 503 }
    );
  }
}
