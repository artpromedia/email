import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/v1/mail/compose/branding/[domainId]
 * Return empty branding for a domain (branding not yet configured).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ domainId: string }> }
) {
  const { domainId } = await params;

  // Return empty branding — domain branding not yet implemented in backend
  return NextResponse.json({
    domainId,
    domainName: "",
    headerHtml: undefined,
    footerHtml: undefined,
    logoUrl: undefined,
    brandColor: undefined,
    enabled: false,
  });
}
