/**
 * Admin Service Health Check API Route
 * Server-side health checks for backend services (avoids browser CORS/localhost issues)
 */

import { NextResponse } from "next/server";

interface ServiceHealth {
  name: string;
  status: "healthy" | "degraded" | "down";
  responseTime: number;
}

const SERVICES = [
  { name: "Auth Service", url: process.env["AUTH_URL"] || "http://auth:8080", path: "/health" },
  {
    name: "Domain Manager",
    url: process.env["DOMAIN_MANAGER_URL"] || "http://domain-manager:8083",
    path: "/health",
  },
  {
    name: "SMTP Server",
    url: process.env["SMTP_URL"] || "http://smtp:9025",
    path: "/health",
  },
  {
    name: "IMAP Server",
    url: process.env["IMAP_URL"] || "http://imap:9143",
    path: "/health",
  },
  {
    name: "Transactional API",
    url: process.env["TRANSACTIONAL_API_URL"] || "http://transactional-api:8085",
    path: "/health",
  },
];

export async function GET() {
  const results: ServiceHealth[] = [];

  for (const service of SERVICES) {
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${service.url}${service.path}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const responseTime = Date.now() - start;
      results.push({
        name: service.name,
        status: res.ok ? "healthy" : "degraded",
        responseTime,
      });
    } catch {
      results.push({
        name: service.name,
        status: "down",
        responseTime: 0,
      });
    }
  }

  return NextResponse.json({ services: results });
}
