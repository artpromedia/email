/**
 * API Load Test
 * Tests web API performance under load
 *
 * Run with:
 *   k6 run --vus 500 --duration 5m api-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// Custom metrics
const apiLatency = new Trend('api_latency');
const authLatency = new Trend('auth_latency');
const emailListLatency = new Trend('email_list_latency');
const emailFetchLatency = new Trend('email_fetch_latency');
const searchLatency = new Trend('search_latency');
const requestsTotal = new Counter('requests_total');
const requestsFailed = new Counter('requests_failed');
const requestSuccessRate = new Rate('request_success_rate');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api`;

export const options = {
  scenarios: {
    // Mixed API load
    api_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },   // Warm up
        { duration: '2m', target: 300 },   // Ramp up
        { duration: '5m', target: 500 },   // Full load
        { duration: '2m', target: 500 },   // Sustain
        { duration: '1m', target: 0 },     // Ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],      // 95% of requests under 500ms
    api_latency: ['p(95)<500'],
    auth_latency: ['p(95)<200'],
    email_list_latency: ['p(95)<300'],
    email_fetch_latency: ['p(95)<200'],
    search_latency: ['p(95)<1000'],
    request_success_rate: ['rate>0.99'],   // 99% success rate
  },
};

// Simulated user session
class UserSession {
  constructor(vuId) {
    this.vuId = vuId;
    this.userId = `user_${vuId % 1000}`;
    this.authToken = null;
    this.csrfToken = null;
  }

  // Login and get tokens
  authenticate() {
    const startTime = Date.now();

    // Get CSRF token first
    const csrfRes = http.get(`${API_URL}/auth/csrf`);
    this.csrfToken = csrfRes.json('token');

    // Login
    const loginRes = http.post(
      `${API_URL}/auth/login`,
      JSON.stringify({
        email: `${this.userId}@test.example.com`,
        password: 'testpassword123',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': this.csrfToken,
        },
      }
    );

    authLatency.add(Date.now() - startTime);

    const success = check(loginRes, {
      'login successful': (r) => r.status === 200,
      'has auth token': (r) => r.json('token') !== undefined,
    });

    if (success) {
      this.authToken = loginRes.json('token');
    }

    return success;
  }

  // Get authorization headers
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken}`,
      'X-CSRF-Token': this.csrfToken,
    };
  }

  // List emails in inbox
  listEmails(page = 1, limit = 20) {
    const startTime = Date.now();

    const res = http.get(
      `${API_URL}/emails?page=${page}&limit=${limit}&folder=inbox`,
      { headers: this.getHeaders() }
    );

    emailListLatency.add(Date.now() - startTime);
    apiLatency.add(Date.now() - startTime);
    requestsTotal.add(1);

    const success = check(res, {
      'email list success': (r) => r.status === 200,
      'has emails array': (r) => Array.isArray(r.json('emails')),
    });

    if (success) {
      requestSuccessRate.add(1);
      return res.json('emails');
    } else {
      requestsFailed.add(1);
      requestSuccessRate.add(0);
      return [];
    }
  }

  // Fetch single email
  fetchEmail(emailId) {
    const startTime = Date.now();

    const res = http.get(
      `${API_URL}/emails/${emailId}`,
      { headers: this.getHeaders() }
    );

    emailFetchLatency.add(Date.now() - startTime);
    apiLatency.add(Date.now() - startTime);
    requestsTotal.add(1);

    const success = check(res, {
      'email fetch success': (r) => r.status === 200,
      'has email body': (r) => r.json('body') !== undefined,
    });

    if (success) {
      requestSuccessRate.add(1);
    } else {
      requestsFailed.add(1);
      requestSuccessRate.add(0);
    }

    return success;
  }

  // Search emails
  searchEmails(query) {
    const startTime = Date.now();

    const res = http.get(
      `${API_URL}/emails/search?q=${encodeURIComponent(query)}`,
      { headers: this.getHeaders() }
    );

    searchLatency.add(Date.now() - startTime);
    apiLatency.add(Date.now() - startTime);
    requestsTotal.add(1);

    const success = check(res, {
      'search success': (r) => r.status === 200,
    });

    if (success) {
      requestSuccessRate.add(1);
    } else {
      requestsFailed.add(1);
      requestSuccessRate.add(0);
    }

    return success;
  }

  // Send email
  sendEmail(to, subject, body) {
    const startTime = Date.now();

    const res = http.post(
      `${API_URL}/emails/send`,
      JSON.stringify({
        to: [to],
        subject: subject,
        body: body,
      }),
      { headers: this.getHeaders() }
    );

    apiLatency.add(Date.now() - startTime);
    requestsTotal.add(1);

    const success = check(res, {
      'send success': (r) => r.status === 200 || r.status === 201,
    });

    if (success) {
      requestSuccessRate.add(1);
    } else {
      requestsFailed.add(1);
      requestSuccessRate.add(0);
    }

    return success;
  }

  // Mark email as read
  markAsRead(emailId) {
    const res = http.patch(
      `${API_URL}/emails/${emailId}`,
      JSON.stringify({ read: true }),
      { headers: this.getHeaders() }
    );

    requestsTotal.add(1);

    const success = check(res, {
      'mark read success': (r) => r.status === 200,
    });

    if (success) {
      requestSuccessRate.add(1);
    } else {
      requestsFailed.add(1);
      requestSuccessRate.add(0);
    }

    return success;
  }

  // Delete email
  deleteEmail(emailId) {
    const res = http.del(
      `${API_URL}/emails/${emailId}`,
      null,
      { headers: this.getHeaders() }
    );

    requestsTotal.add(1);

    const success = check(res, {
      'delete success': (r) => r.status === 200 || r.status === 204,
    });

    if (success) {
      requestSuccessRate.add(1);
    } else {
      requestsFailed.add(1);
      requestSuccessRate.add(0);
    }

    return success;
  }
}

// User behavior weights
const actions = [
  { name: 'list_emails', weight: 40, fn: (session) => session.listEmails() },
  { name: 'fetch_email', weight: 25, fn: (session) => session.fetchEmail('test-email-id') },
  { name: 'search', weight: 15, fn: (session) => session.searchEmails('test query') },
  { name: 'send_email', weight: 10, fn: (session) => session.sendEmail('recipient@test.com', 'Test', 'Body') },
  { name: 'mark_read', weight: 7, fn: (session) => session.markAsRead('test-email-id') },
  { name: 'delete_email', weight: 3, fn: (session) => session.deleteEmail('test-email-id') },
];

function selectAction() {
  const rand = Math.random() * 100;
  let cumulative = 0;

  for (const action of actions) {
    cumulative += action.weight;
    if (rand < cumulative) {
      return action;
    }
  }

  return actions[0];
}

export default function () {
  const session = new UserSession(__VU);

  // Authenticate
  group('authentication', function () {
    if (!session.authenticate()) {
      console.error(`Authentication failed for VU ${__VU}`);
      sleep(1);
      return;
    }
  });

  // Perform random actions
  group('api_operations', function () {
    const numActions = 3 + Math.floor(Math.random() * 5);

    for (let i = 0; i < numActions; i++) {
      const action = selectAction();

      group(action.name, function () {
        action.fn(session);
      });

      // Small delay between actions
      sleep(0.1 + Math.random() * 0.3);
    }
  });

  // Think time
  sleep(1 + Math.random() * 2);
}

export function handleSummary(data) {
  return {
    'results/api-load-test-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const { metrics } = data;

  let output = `
╔══════════════════════════════════════════════════════════════╗
║                     API LOAD TEST RESULTS                    ║
╠══════════════════════════════════════════════════════════════╣
`;

  if (metrics.http_req_duration) {
    output += `
║ HTTP Request Duration                                        ║
║   Avg: ${metrics.http_req_duration.values.avg.toFixed(2)}ms
║   P95: ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms
║   Max: ${metrics.http_req_duration.values.max.toFixed(2)}ms
`;
  }

  if (metrics.api_latency) {
    output += `
║ API Latency                                                  ║
║   Avg: ${metrics.api_latency.values.avg.toFixed(2)}ms
║   P95: ${metrics.api_latency.values['p(95)'].toFixed(2)}ms
`;
  }

  if (metrics.requests_total) {
    output += `
║ Request Statistics                                           ║
║   Total: ${metrics.requests_total.values.count}
║   Failed: ${metrics.requests_failed?.values.count || 0}
║   Success Rate: ${((metrics.request_success_rate?.values.rate || 0) * 100).toFixed(2)}%
`;
  }

  output += `
╚══════════════════════════════════════════════════════════════╝
`;

  return output;
}
