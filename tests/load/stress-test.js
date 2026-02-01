/**
 * High-Concurrency Stress Test
 * Tests system behavior under extreme load conditions
 *
 * This test pushes the system to its limits to identify:
 * - Breaking points
 * - Resource exhaustion thresholds
 * - Recovery characteristics
 * - Error handling under stress
 *
 * Run with:
 *   k6 run --vus 100 --duration 15m stress-test.js
 */

import http from "k6/http";
import { sleep } from "k6";
import { Trend, Counter, Rate, Gauge } from "k6/metrics";

// Custom metrics
const apiLatency = new Trend("api_latency");
const errorLatency = new Trend("error_latency");
const requestsTotal = new Counter("requests_total");
const requestsFailed = new Counter("requests_failed");
const requestsTimedOut = new Counter("requests_timed_out");
const requestSuccessRate = new Rate("request_success_rate");
const connectionErrors = new Counter("connection_errors");
const serverErrors = new Counter("server_errors");
const clientErrors = new Counter("client_errors");
const activeConnections = new Gauge("active_connections");

// Configuration
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const API_URL = `${BASE_URL}/api`;
const MAX_TIMEOUT = __ENV.MAX_TIMEOUT || "30s";

export const options = {
  scenarios: {
    // Stress test: gradually increase to breaking point
    stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 100 }, // Warm up
        { duration: "3m", target: 500 }, // Ramp to normal load
        { duration: "3m", target: 1000 }, // Ramp to stress
        { duration: "3m", target: 2000 }, // Push to limit
        { duration: "2m", target: 2000 }, // Hold at limit
        { duration: "2m", target: 0 }, // Recovery
      ],
      gracefulRampDown: "1m",
    },

    // Soak test: sustained load for longer period
    soak: {
      executor: "constant-vus",
      vus: 100,
      duration: "30m",
      startTime: "15m", // Start after stress test
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<5000"], // Allow higher latency under stress
    api_latency: ["p(95)<5000"],
    request_success_rate: ["rate>0.80"], // Lower threshold for stress
    http_req_failed: ["rate<0.20"], // Allow up to 20% failures
  },
};

// API endpoints to test
const endpoints = [
  { method: "GET", path: "/health", weight: 20, requiresAuth: false },
  { method: "GET", path: "/health/ready", weight: 10, requiresAuth: false },
  { method: "POST", path: "/auth/login", weight: 15, requiresAuth: false },
  { method: "GET", path: "/emails", weight: 20, requiresAuth: true },
  { method: "GET", path: "/folders", weight: 10, requiresAuth: true },
  { method: "POST", path: "/emails/send", weight: 10, requiresAuth: true },
  { method: "GET", path: "/users/me", weight: 10, requiresAuth: true },
  { method: "GET", path: "/domains", weight: 5, requiresAuth: true },
];

function selectEndpoint() {
  const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
  const rand = Math.random() * totalWeight;
  let cumulative = 0;

  for (const endpoint of endpoints) {
    cumulative += endpoint.weight;
    if (rand < cumulative) {
      return endpoint;
    }
  }

  return endpoints[0];
}

// Token cache to reduce auth overhead
const tokenCache = {};

function getAuthToken(vuId) {
  const userId = vuId % 1000;

  if (tokenCache[userId] && tokenCache[userId].expiry > Date.now()) {
    return tokenCache[userId].token;
  }

  const res = http.post(
    `${API_URL}/auth/login`,
    JSON.stringify({
      email: `user_${userId}@test.example.com`,
      password: "testpassword123",
    }),
    {
      headers: { "Content-Type": "application/json" },
      timeout: MAX_TIMEOUT,
    }
  );

  if (res.status === 200) {
    const body = res.json();
    const token = body.accessToken || body.token;
    tokenCache[userId] = {
      token: token,
      expiry: Date.now() + 300000, // 5 min cache
    };
    return token;
  }

  return null;
}

function makeRequest(endpoint, authToken) {
  const url = `${API_URL}${endpoint.path}`;
  const headers = { "Content-Type": "application/json" };

  if (endpoint.requiresAuth && authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const params = {
    headers: headers,
    timeout: MAX_TIMEOUT,
    tags: { endpoint: endpoint.path },
  };

  let body = null;
  if (endpoint.method === "POST") {
    if (endpoint.path === "/auth/login") {
      body = JSON.stringify({
        email: `user_${__VU % 1000}@test.example.com`,
        password: "testpassword123",
      });
    } else if (endpoint.path === "/emails/send") {
      body = JSON.stringify({
        to: ["recipient@test.example.com"],
        subject: `Stress Test ${__VU}-${__ITER}`,
        body: "Stress test email content",
      });
    }
  }

  const start = Date.now();
  let res;

  try {
    activeConnections.add(1);

    switch (endpoint.method) {
      case "GET":
        res = http.get(url, params);
        break;
      case "POST":
        res = http.post(url, body, params);
        break;
      case "PUT":
        res = http.put(url, body, params);
        break;
      case "DELETE":
        res = http.del(url, null, params);
        break;
    }

    activeConnections.add(-1);
  } catch (error) {
    activeConnections.add(-1);
    connectionErrors.add(1);
    requestsFailed.add(1);
    requestSuccessRate.add(0);
    return { error: error.message };
  }

  const duration = Date.now() - start;
  apiLatency.add(duration);
  requestsTotal.add(1);

  // Categorize response
  if (res.status >= 200 && res.status < 300) {
    requestSuccessRate.add(1);
    return { success: true, status: res.status, duration: duration };
  } else if (res.status >= 400 && res.status < 500) {
    clientErrors.add(1);
    requestsFailed.add(1);
    requestSuccessRate.add(0);
    errorLatency.add(duration);
    return { error: "client_error", status: res.status };
  } else if (res.status >= 500) {
    serverErrors.add(1);
    requestsFailed.add(1);
    requestSuccessRate.add(0);
    errorLatency.add(duration);
    return { error: "server_error", status: res.status };
  } else if (res.status === 0) {
    requestsTimedOut.add(1);
    requestsFailed.add(1);
    requestSuccessRate.add(0);
    return { error: "timeout", status: 0 };
  }

  return { unknown: true, status: res.status };
}

export default function stressTest() {
  const vuId = __VU;
  // Removed unused iteration variable

  // Select random endpoint
  const endpoint = selectEndpoint();

  // Get auth token if needed
  let authToken = null;
  if (endpoint.requiresAuth) {
    authToken = getAuthToken(vuId);
    if (!authToken) {
      // Skip authenticated requests if can't get token
      requestsFailed.add(1);
      requestSuccessRate.add(0);
      sleep(0.1);
      return;
    }
  }

  // Make request
  const result = makeRequest(endpoint, authToken);

  // Log failures for debugging (sampled)
  if (result.error && Math.random() < 0.01) {
    console.log(`[VU ${vuId}] ${endpoint.method} ${endpoint.path}: ${JSON.stringify(result)}`);
  }

  // Variable delay to simulate realistic traffic patterns
  const delay = 0.05 + Math.random() * 0.1;
  sleep(delay);
}

// Spike injection function
export function spike() {
  const burstSize = 50;

  for (let i = 0; i < burstSize; i++) {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const authToken = endpoint.requiresAuth ? getAuthToken(__VU) : null;
    makeRequest(endpoint, authToken);
  }
}

export function handleSummary(data) {
  return {
    "results/stress-test-summary.json": JSON.stringify(data, null, 2),
    stdout: generateStressReport(data),
  };
}

function generateStressReport(data) {
  const { metrics } = data;

  let report = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                         STRESS TEST RESULTS                                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
`;

  // Request metrics
  if (metrics.http_reqs) {
    report += `
║ REQUEST VOLUME                                                               ║
║   Total Requests:    ${metrics.http_reqs.values.count}
║   Requests/sec:      ${metrics.http_reqs.values.rate?.toFixed(2) || "N/A"}
`;
  }

  // Latency metrics
  if (metrics.api_latency) {
    const al = metrics.api_latency.values;
    report += `
║ LATENCY (ms)                                                                 ║
║   Average:           ${al.avg?.toFixed(2) || "N/A"}
║   Median:            ${al.med?.toFixed(2) || "N/A"}
║   P95:               ${al["p(95)"]?.toFixed(2) || "N/A"}
║   P99:               ${al["p(99)"]?.toFixed(2) || "N/A"}
║   Max:               ${al.max?.toFixed(2) || "N/A"}
`;
  }

  // Error breakdown
  report += `
╠══════════════════════════════════════════════════════════════════════════════╣
║ ERROR BREAKDOWN                                                              ║
`;

  if (metrics.requests_total) {
    report += `║   Total Requests:    ${metrics.requests_total.values.count}
`;
  }
  if (metrics.requests_failed) {
    report += `║   Failed Requests:   ${metrics.requests_failed.values.count}
`;
  }
  if (metrics.connection_errors) {
    report += `║   Connection Errors: ${metrics.connection_errors.values.count}
`;
  }
  if (metrics.server_errors) {
    report += `║   Server Errors:     ${metrics.server_errors.values.count}
`;
  }
  if (metrics.client_errors) {
    report += `║   Client Errors:     ${metrics.client_errors.values.count}
`;
  }
  if (metrics.requests_timed_out) {
    report += `║   Timeouts:          ${metrics.requests_timed_out.values.count}
`;
  }

  // Success rate
  if (metrics.request_success_rate) {
    const rate = (metrics.request_success_rate.values.rate * 100).toFixed(2);
    report += `
╠══════════════════════════════════════════════════════════════════════════════╣
║ SUCCESS RATE:        ${rate}%
`;
  }

  // Thresholds status
  report += `
╠══════════════════════════════════════════════════════════════════════════════╣
║ THRESHOLD STATUS                                                             ║
`;

  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    const status = threshold.ok ? "✓ PASS" : "✗ FAIL";
    report += `║   ${name}: ${status}
`;
  }

  report += `
╚══════════════════════════════════════════════════════════════════════════════╝
`;

  return report;
}
