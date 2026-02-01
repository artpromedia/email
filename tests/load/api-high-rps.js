/**
 * API High RPS (Requests Per Second) Test
 * Tests API server under 2000+ RPS load
 *
 * Targets:
 * - 2000 RPS sustained throughput
 * - Low latency under load
 * - Error rate monitoring
 * - Resource utilization assessment
 *
 * Run with:
 *   k6 run api-high-rps.js
 */

import http from "k6/http";
import { check } from "k6";
import { Trend, Counter, Rate, Gauge } from "k6/metrics";

// Custom metrics
const apiLatency = new Trend("api_latency");
const endpointLatency = {};
const requestsTotal = new Counter("requests_total");
const requestsFailed = new Counter("requests_failed");
const requestSuccessRate = new Rate("request_success_rate");
const rps = new Gauge("current_rps");

// Per-status counters
const status2xx = new Counter("status_2xx");
const status4xx = new Counter("status_4xx");
const status5xx = new Counter("status_5xx");

// Configuration
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const API_URL = `${BASE_URL}/api`;
const TARGET_RPS = Number.parseInt(__ENV.TARGET_RPS || "2000", 10);

export const options = {
  scenarios: {
    // Constant RPS test
    constant_rps: {
      executor: "constant-arrival-rate",
      rate: TARGET_RPS,
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: 200,
      maxVUs: 500,
    },

    // Ramping RPS test
    ramping_rps: {
      executor: "ramping-arrival-rate",
      startRate: 100,
      timeUnit: "1s",
      stages: [
        { duration: "2m", target: 500 }, // Warm up
        { duration: "2m", target: 1000 }, // Ramp to 1k RPS
        { duration: "2m", target: 1500 }, // Ramp to 1.5k RPS
        { duration: "3m", target: 2000 }, // Target: 2k RPS
        { duration: "3m", target: 2000 }, // Sustain
        { duration: "2m", target: 500 }, // Cool down
      ],
      preAllocatedVUs: 200,
      maxVUs: 1000,
      startTime: "5m", // After constant test
    },

    // Spike RPS test
    spike_rps: {
      executor: "ramping-arrival-rate",
      startRate: 500,
      timeUnit: "1s",
      stages: [
        { duration: "30s", target: 3000 }, // Spike to 3k RPS
        { duration: "1m", target: 3000 }, // Hold spike
        { duration: "30s", target: 500 }, // Recover
      ],
      preAllocatedVUs: 300,
      maxVUs: 1500,
      startTime: "19m", // After ramping test
    },
  },
  thresholds: {
    api_latency: ["p(50)<100", "p(95)<500", "p(99)<1000"],
    request_success_rate: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

// Initialize per-endpoint latency metrics
const endpoints = [
  { name: "health", path: "/health", method: "GET", weight: 15, auth: false },
  { name: "health_ready", path: "/health/ready", method: "GET", weight: 10, auth: false },
  { name: "auth_session", path: "/auth/session", method: "GET", weight: 10, auth: true },
  { name: "emails_list", path: "/emails?limit=20", method: "GET", weight: 20, auth: true },
  { name: "emails_unread", path: "/emails?status=unread", method: "GET", weight: 15, auth: true },
  { name: "folders_list", path: "/folders", method: "GET", weight: 10, auth: true },
  { name: "user_profile", path: "/users/me", method: "GET", weight: 10, auth: true },
  { name: "domains_list", path: "/domains", method: "GET", weight: 5, auth: true },
  { name: "search", path: "/emails/search?q=test", method: "GET", weight: 5, auth: true },
];

for (const endpoint of endpoints) {
  endpointLatency[endpoint.name] = new Trend(`latency_${endpoint.name}`);
}

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

// Token management
const tokenCache = new Map();
const TOKEN_TTL = 300000; // 5 minutes

function getAuthToken(vuId) {
  const userId = vuId % 500;
  const cacheKey = `user_${userId}`;
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiry > Date.now()) {
    return cached.token;
  }

  // Perform login
  const loginRes = http.post(
    `${API_URL}/auth/login`,
    JSON.stringify({
      email: `user_${userId}@test.example.com`,
      password: "testpassword123",
    }),
    {
      headers: { "Content-Type": "application/json" },
      timeout: "10s",
    }
  );

  if (loginRes.status === 200) {
    const body = loginRes.json();
    const token = body.accessToken || body.token;
    tokenCache.set(cacheKey, {
      token: token,
      expiry: Date.now() + TOKEN_TTL,
    });
    return token;
  }

  return null;
}

function makeRequest(endpoint, authToken) {
  const url = `${API_URL}${endpoint.path}`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (endpoint.auth && authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const params = {
    headers: headers,
    timeout: "10s",
    tags: {
      endpoint: endpoint.name,
      method: endpoint.method,
    },
  };

  const start = Date.now();
  let res;

  switch (endpoint.method) {
    case "GET":
      res = http.get(url, params);
      break;
    case "POST":
      res = http.post(url, null, params);
      break;
    default:
      res = http.get(url, params);
  }

  const duration = Date.now() - start;

  // Record metrics
  apiLatency.add(duration);
  endpointLatency[endpoint.name].add(duration);
  requestsTotal.add(1);

  // Status classification
  if (res.status >= 200 && res.status < 300) {
    status2xx.add(1);
    requestSuccessRate.add(1);
    return { success: true, status: res.status, duration };
  } else if (res.status >= 400 && res.status < 500) {
    status4xx.add(1);
    requestsFailed.add(1);
    requestSuccessRate.add(0);
    return { success: false, status: res.status, error: "client_error" };
  } else if (res.status >= 500) {
    status5xx.add(1);
    requestsFailed.add(1);
    requestSuccessRate.add(0);
    return { success: false, status: res.status, error: "server_error" };
  } else {
    requestsFailed.add(1);
    requestSuccessRate.add(0);
    return { success: false, status: res.status, error: "unknown" };
  }
}

export default function apiHighRpsTest() {
  const vuId = __VU;
  // Removed unused iteration variable

  // Track RPS
  rps.add(1);

  // Select endpoint
  const endpoint = selectEndpoint();

  // Get auth token if needed
  let authToken = null;
  if (endpoint.auth) {
    authToken = getAuthToken(vuId);
    if (!authToken) {
      // Skip if can't authenticate - but count as failure
      requestsFailed.add(1);
      requestSuccessRate.add(0);
      return;
    }
  }

  // Make request
  const result = makeRequest(endpoint, authToken);

  // Verify response
  check(result, {
    "request successful": (r) => r.success === true,
    "response time ok": (r) => r.duration < 1000,
  });

  // No sleep for maximum RPS
}

export function handleSummary(data) {
  return {
    "results/api-high-rps-summary.json": JSON.stringify(data, null, 2),
    stdout: generateRPSReport(data),
  };
}

function generateRPSReport(data) {
  const { metrics } = data;

  let report = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                    API HIGH RPS TEST RESULTS                                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
`;

  // Overall metrics
  if (metrics.http_reqs) {
    const reqs = metrics.http_reqs.values;
    report += `
║ THROUGHPUT                                                                   ║
║   Total Requests:  ${reqs.count}
║   Average RPS:     ${reqs.rate?.toFixed(2) || "N/A"}
`;
  }

  // Latency metrics
  if (metrics.api_latency) {
    const al = metrics.api_latency.values;
    report += `
║ LATENCY (ms)                                                                 ║
║   Average:         ${al.avg?.toFixed(2) || "N/A"}
║   Median (P50):    ${al.med?.toFixed(2) || "N/A"}
║   P90:             ${al["p(90)"]?.toFixed(2) || "N/A"}
║   P95:             ${al["p(95)"]?.toFixed(2) || "N/A"}
║   P99:             ${al["p(99)"]?.toFixed(2) || "N/A"}
║   Max:             ${al.max?.toFixed(2) || "N/A"}
`;
  }

  // Per-endpoint latency
  report += `
╠══════════════════════════════════════════════════════════════════════════════╣
║ PER-ENDPOINT LATENCY (P95 ms)                                                ║
`;

  for (const endpoint of endpoints) {
    const metricName = `latency_${endpoint.name}`;
    if (metrics[metricName]) {
      const p95 = metrics[metricName].values["p(95)"]?.toFixed(2) || "N/A";
      const avg = metrics[metricName].values.avg?.toFixed(2) || "N/A";
      report += `║   ${endpoint.name.padEnd(20)} Avg: ${avg.padStart(8)} | P95: ${p95.padStart(8)}
`;
    }
  }

  // Status breakdown
  report += `
╠══════════════════════════════════════════════════════════════════════════════╣
║ STATUS BREAKDOWN                                                             ║
`;

  if (metrics.status_2xx) {
    report += `║   2xx (Success):   ${metrics.status_2xx.values.count}
`;
  }
  if (metrics.status_4xx) {
    report += `║   4xx (Client):    ${metrics.status_4xx.values.count}
`;
  }
  if (metrics.status_5xx) {
    report += `║   5xx (Server):    ${metrics.status_5xx.values.count}
`;
  }

  // Success rate
  if (metrics.request_success_rate) {
    const rate = (metrics.request_success_rate.values.rate * 100).toFixed(4);
    report += `
║ SUCCESS RATE:      ${rate}%
`;
  }

  // Thresholds
  report += `
╠══════════════════════════════════════════════════════════════════════════════╣
║ THRESHOLDS                                                                   ║
`;

  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    const status = threshold.ok ? "✓ PASS" : "✗ FAIL";
    report += `║   ${name.substring(0, 40).padEnd(40)} ${status}
`;
  }

  report += `
╚══════════════════════════════════════════════════════════════════════════════╝
`;

  return report;
}
