import { NextResponse } from "next/server";

/**
 * GET /api/v1/organization/sso
 * Return SSO configuration (defaults for now).
 */
export function GET() {
  return NextResponse.json({
    enabled: false,
    enforced: false,
    providers: [],
  });
}
