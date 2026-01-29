import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Basic health check endpoint
 */
export function GET() {
  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "web-app",
  });
}
