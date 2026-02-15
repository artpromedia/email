import { type NextRequest, NextResponse } from "next/server";

const TRANSACTIONAL_API = process.env["TRANSACTIONAL_API_URL"] ?? "http://transactional-api:8085";
const DOMAIN_MANAGER = process.env["DOMAIN_MANAGER_URL"] ?? "http://domain-manager:8083";
const AUTH_SERVICE = process.env["AUTH_SERVICE_URL"] ?? "http://auth:8081";

// Route mapping: console API path prefix → backend service
const ROUTE_MAP: Record<string, { baseUrl: string; pathPrefix: string }> = {
  "api-keys": {
    baseUrl: TRANSACTIONAL_API,
    pathPrefix: "/api/v1/api-keys",
  },
  templates: {
    baseUrl: TRANSACTIONAL_API,
    pathPrefix: "/api/v1/templates",
  },
  webhooks: {
    baseUrl: TRANSACTIONAL_API,
    pathPrefix: "/api/v1/webhooks",
  },
  suppressions: {
    baseUrl: TRANSACTIONAL_API,
    pathPrefix: "/api/v1/suppressions",
  },
  analytics: {
    baseUrl: TRANSACTIONAL_API,
    pathPrefix: "/api/v1/analytics",
  },
  activity: {
    baseUrl: TRANSACTIONAL_API,
    pathPrefix: "/api/v1/messages",
  },
  domains: {
    baseUrl: DOMAIN_MANAGER,
    pathPrefix: "/api/v1/domains",
  },
  settings: {
    baseUrl: AUTH_SERVICE,
    pathPrefix: "/api/v1/organizations",
  },
  usage: {
    baseUrl: TRANSACTIONAL_API,
    pathPrefix: "/api/v1/analytics/usage",
  },
  dashboard: {
    baseUrl: TRANSACTIONAL_API,
    pathPrefix: "/api/v1/analytics/overview",
  },
};

async function verifyAuth(
  token: string
): Promise<{ id: string; email: string; organization_id: string } | null> {
  try {
    const res = await fetch(`${AUTH_SERVICE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await (res.json() as Promise<{
      id: string;
      email: string;
      organization_id: string;
    }>);
  } catch {
    return null;
  }
}

async function proxyRequest(req: NextRequest, params: { path: string[] }): Promise<NextResponse> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await verifyAuth(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [resource, ...rest] = params.path;
  if (!resource) {
    return NextResponse.json({ error: "Invalid console path" }, { status: 400 });
  }

  const route = ROUTE_MAP[resource];
  if (!route) {
    return NextResponse.json({ error: `Unknown resource: ${resource}` }, { status: 404 });
  }

  // Build target URL
  const subPath = rest.length > 0 ? `/${rest.join("/")}` : "";
  const targetUrl = `${route.baseUrl}${route.pathPrefix}${subPath}`;

  // Forward the request
  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("content-type") ?? "application/json",
    Authorization: `Bearer ${token}`,
    "X-Org-ID": user.organization_id,
    "X-User-ID": user.id,
  };

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
  };

  // Forward body for non-GET requests
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      fetchOptions.body = await req.text();
    } catch {
      // No body
    }
  }

  // Forward query params
  const url = new URL(req.url);
  const queryString = url.search;
  const finalUrl = queryString ? `${targetUrl}${queryString}` : targetUrl;

  try {
    const upstream = await fetch(finalUrl, fetchOptions);
    const body = await upstream.text();

    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    console.error(`Console proxy error [${resource}]:`, error);
    return NextResponse.json({ error: "Service unavailable" }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, await params);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, await params);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, await params);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, await params);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, await params);
}
