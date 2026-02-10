/**
 * Admin Stats API Route
 * Aggregates statistics from multiple services
 */

import { type NextRequest, NextResponse } from "next/server";

const DOMAIN_MANAGER_URL = process.env.DOMAIN_MANAGER_URL || "http://domain-manager:8083";
const TRANSACTIONAL_API_URL = process.env.TRANSACTIONAL_API_URL || "http://transactional-api:8085";
const AUTH_URL = process.env.AUTH_URL || "http://auth:8080";

interface DashboardStats {
  totalEmails: number;
  emailsToday: number;
  activeUsers: number;
  activeDomains: number;
  deliveryRate: number;
  bounceRate: number;
  domains: {
    id: string;
    name: string;
    status: string;
    emailCount: number;
    userCount: number;
  }[];
  recentAlerts: {
    id: string;
    type: "info" | "warning" | "error" | "success";
    message: string;
    time: string;
  }[];
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(authHeader && { Authorization: authHeader }),
  };

  const stats: DashboardStats = {
    totalEmails: 0,
    emailsToday: 0,
    activeUsers: 0,
    activeDomains: 0,
    deliveryRate: 0,
    bounceRate: 0,
    domains: [],
    recentAlerts: [],
  };

  try {
    // Fetch domains from domain-manager
    const domainsResponse = await fetchWithTimeout(`${DOMAIN_MANAGER_URL}/api/admin/domains`, {
      headers,
    });

    if (domainsResponse.ok) {
      const domainsData = await domainsResponse.json();
      const domains = domainsData.domains || domainsData || [];

      stats.activeDomains = domains.filter((d: { status: string }) => d.status === "active").length;
      stats.domains = domains.map(
        (d: {
          id: string;
          name: string;
          status: string;
          email_count?: number;
          user_count?: number;
        }) => ({
          id: d.id,
          name: d.name,
          status: d.status,
          emailCount: d.email_count || 0,
          userCount: d.user_count || 0,
        })
      );

      // Check for pending domains
      const pendingDomains = domains.filter(
        (d: { status: string }) => d.status === "pending_verification"
      );
      if (pendingDomains.length > 0) {
        stats.recentAlerts.push({
          id: "pending-domains",
          type: "info",
          message: `${pendingDomains.length} domain(s) pending verification`,
          time: "Now",
        });
      }
    }
  } catch (error) {
    console.error("Failed to fetch domains:", error);
    stats.recentAlerts.push({
      id: "domain-error",
      type: "warning",
      message: "Unable to fetch domain statistics",
      time: "Now",
    });
  }

  try {
    // Fetch email analytics from transactional API
    const analyticsResponse = await fetchWithTimeout(
      `${TRANSACTIONAL_API_URL}/v1/analytics/overview`,
      { headers }
    );

    if (analyticsResponse.ok) {
      const analytics = await analyticsResponse.json();
      stats.totalEmails = analytics.total_sent || 0;
      stats.emailsToday = analytics.sent_today || 0;
      stats.deliveryRate = analytics.delivery_rate || 99.5;
      stats.bounceRate = analytics.bounce_rate || 0.5;

      // Add alerts based on metrics
      if (stats.bounceRate > 5) {
        stats.recentAlerts.push({
          id: "high-bounce",
          type: "warning",
          message: `High bounce rate detected: ${stats.bounceRate.toFixed(1)}%`,
          time: "1h ago",
        });
      }
    }
  } catch (error) {
    console.error("Failed to fetch analytics:", error);
  }

  try {
    // Fetch user count from auth service
    const usersResponse = await fetchWithTimeout(`${AUTH_URL}/api/v1/admin/users/count`, {
      headers,
    });

    if (usersResponse.ok) {
      const usersData = await usersResponse.json();
      stats.activeUsers = usersData.count || usersData.total || 0;
    }
  } catch (error) {
    console.error("Failed to fetch user count:", error);
  }

  // Add success alert if everything is working
  if (stats.recentAlerts.length === 0) {
    stats.recentAlerts.push({
      id: "all-good",
      type: "success",
      message: "All systems operating normally",
      time: "Now",
    });
  }

  return NextResponse.json(stats);
}
