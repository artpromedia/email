import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Basic health check endpoint for admin dashboard
 */
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "admin-app",
  });
}
