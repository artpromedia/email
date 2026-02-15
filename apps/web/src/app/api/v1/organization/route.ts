import { type NextRequest, NextResponse } from "next/server";

const AUTH_API_URL = process.env["AUTH_API_URL"] || "http://auth:8080";

/**
 * GET /api/v1/organization
 * Return organization data from the auth service.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Call auth service to get current user (includes org data)
    const response = await fetch(`${AUTH_API_URL}/api/auth/me`, {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        organization: {
          id: "",
          name: "",
          slug: "",
          description: "",
          logo: "",
          website: "",
          industry: "",
          size: "",
          settings: {
            allowPublicSignup: false,
            requireEmailVerification: true,
            enforceTwoFactor: false,
            allowExternalSharing: true,
          },
        },
      });
    }

    const user = (await response.json()) as {
      organization_id?: string;
      domains?: { id: string; name: string; is_primary: boolean }[];
    };

    const primaryDomain = user.domains?.find((d) => d.is_primary)?.name ?? "";

    return NextResponse.json({
      organization: {
        id: user.organization_id ?? "",
        name: primaryDomain ? primaryDomain.charAt(0).toUpperCase() + primaryDomain.slice(1) : "",
        slug: primaryDomain.replace(/\./g, "-"),
        description: "",
        logo: "",
        website: primaryDomain ? `https://${primaryDomain}` : "",
        industry: "",
        size: "",
        settings: {
          allowPublicSignup: false,
          requireEmailVerification: true,
          enforceTwoFactor: false,
          allowExternalSharing: true,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching organization:", error);
    return NextResponse.json({ error: "Failed to fetch organization" }, { status: 500 });
  }
}
