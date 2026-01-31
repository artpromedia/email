/**
 * Concurrent Connections Load Test
 * Tests system behavior under many simultaneous connections
 *
 * Run with:
 *   k6 run --vus 1000 --duration 10m concurrent-connections-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter, Rate, Gauge } from 'k6/metrics';
import ws from 'k6/ws';

// Custom metrics
const connectionTime = new Trend('connection_time');
const activeConnections = new Gauge('active_connections');
const connectionErrors = new Counter('connection_errors');
const connectionSuccessRate = new Rate('connection_success_rate');
const websocketLatency = new Trend('websocket_latency');
const websocketErrors = new Counter('websocket_errors');
const longPollingLatency = new Trend('long_polling_latency');
const sessionCreationTime = new Trend('session_creation_time');
const simultaneousUsers = new Gauge('simultaneous_users');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
const API_URL = `${BASE_URL}/api`;

export const options = {
  scenarios: {
    // Gradual connection buildup
    connection_buildup: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 200 },
        { duration: '3m', target: 500 },
        { duration: '3m', target: 1000 },
        { duration: '2m', target: 1000 },
        { duration: '2m', target: 0 },
      ],
      exec: 'connectionBuildup',
      gracefulRampDown: '1m',
    },
    // Sudden connection spike
    connection_spike: {
      executor: 'per-vu-iterations',
      vus: 500,
      iterations: 1,
      maxDuration: '30s',
      startTime: '5m',
      exec: 'connectionSpike',
    },
    // WebSocket connections
    websocket_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '4m', target: 300 },
        { duration: '3m', target: 300 },
        { duration: '2m', target: 0 },
      ],
      exec: 'websocketLoad',
      startTime: '1m',
    },
    // Long-polling connections
    long_polling: {
      executor: 'constant-vus',
      vus: 100,
      duration: '8m',
      exec: 'longPolling',
      startTime: '2m',
    },
  },
  thresholds: {
    connection_time: ['p(95)<500', 'p(99)<1000'],
    connection_success_rate: ['rate>0.99'],
    websocket_latency: ['p(95)<200'],
    long_polling_latency: ['p(95)<5000'],
    session_creation_time: ['p(95)<300'],
  },
};

// Track active connections
let connectionCount = 0;

function incrementConnections() {
  connectionCount++;
  activeConnections.add(connectionCount);
  simultaneousUsers.add(connectionCount);
}

function decrementConnections() {
  connectionCount--;
  activeConnections.add(connectionCount);
  simultaneousUsers.add(connectionCount);
}

// Create HTTP session
function createSession() {
  const startTime = Date.now();

  // Get CSRF token
  const csrfRes = http.get(`${API_URL}/auth/csrf`);
  const csrfToken = csrfRes.json('token');

  // Create session
  const loginRes = http.post(
    `${API_URL}/auth/login`,
    JSON.stringify({
      email: `user_${__VU}@test.example.com`,
      password: 'testpassword123',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
    }
  );

  const duration = Date.now() - startTime;
  sessionCreationTime.add(duration);
  connectionTime.add(duration);

  const success = check(loginRes, {
    'session created': (r) => r.status === 200,
  });

  if (success) {
    connectionSuccessRate.add(1);
    return {
      token: loginRes.json('token'),
      csrfToken: csrfToken,
    };
  } else {
    connectionErrors.add(1);
    connectionSuccessRate.add(0);
    return null;
  }
}

// Keep connection alive with periodic requests
function keepAlive(session, duration) {
  if (!session) return;

  const startTime = Date.now();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.token}`,
    'X-CSRF-Token': session.csrfToken,
  };

  incrementConnections();

  try {
    while (Date.now() - startTime < duration) {
      // Ping every 5-10 seconds
      const pingRes = http.get(`${API_URL}/health`, { headers });

      check(pingRes, {
        'keep-alive success': (r) => r.status === 200,
      });

      sleep(5 + Math.random() * 5);
    }
  } finally {
    decrementConnections();
  }
}

// WebSocket connection
function createWebSocketConnection(duration) {
  const url = `${WS_URL}/ws/notifications`;

  incrementConnections();

  try {
    const res = ws.connect(url, { headers: { 'Authorization': `Bearer test-token-${__VU}` } }, function (socket) {
      socket.on('open', function () {
        const openTime = Date.now();

        // Send ping periodically
        const pingInterval = setInterval(() => {
          const pingStart = Date.now();
          socket.send(JSON.stringify({ type: 'ping' }));
          websocketLatency.add(Date.now() - pingStart);
        }, 10000);

        socket.on('message', function (msg) {
          // Handle incoming messages
          try {
            const data = JSON.parse(msg);
            if (data.type === 'pong') {
              // Pong received
            }
          } catch (e) {
            // Ignore parse errors
          }
        });

        socket.on('close', function () {
          clearInterval(pingInterval);
        });

        socket.on('error', function (e) {
          websocketErrors.add(1);
          clearInterval(pingInterval);
        });

        // Keep connection open for specified duration
        socket.setTimeout(function () {
          socket.close();
        }, duration);
      });
    });

    const success = check(res, {
      'websocket connected': (r) => r && r.status === 101,
    });

    if (success) {
      connectionSuccessRate.add(1);
    } else {
      connectionErrors.add(1);
      connectionSuccessRate.add(0);
    }
  } catch (e) {
    websocketErrors.add(1);
    connectionErrors.add(1);
    connectionSuccessRate.add(0);
  } finally {
    decrementConnections();
  }
}

// Long-polling connection
function createLongPollingConnection(session) {
  if (!session) return;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.token}`,
    'X-CSRF-Token': session.csrfToken,
  };

  incrementConnections();

  try {
    const startTime = Date.now();

    // Long-polling request with 30 second timeout
    const res = http.get(`${API_URL}/notifications/poll?timeout=30000`, {
      headers,
      timeout: 35000,
    });

    const duration = Date.now() - startTime;
    longPollingLatency.add(duration);
    connectionTime.add(duration);

    const success = check(res, {
      'long-poll success': (r) => r.status === 200 || r.status === 204,
    });

    if (success) {
      connectionSuccessRate.add(1);
    } else {
      connectionErrors.add(1);
      connectionSuccessRate.add(0);
    }
  } finally {
    decrementConnections();
  }
}

// Scenarios
export function connectionBuildup() {
  group('connection_buildup', () => {
    const session = createSession();
    if (session) {
      // Keep connection alive for 30-60 seconds
      keepAlive(session, 30000 + Math.random() * 30000);
    } else {
      sleep(1);
    }
  });
}

export function connectionSpike() {
  group('connection_spike', () => {
    // All VUs try to connect simultaneously
    const startTime = Date.now();

    const session = createSession();
    connectionTime.add(Date.now() - startTime);

    if (session) {
      // Make a few requests then disconnect
      const headers = {
        'Authorization': `Bearer ${session.token}`,
      };

      for (let i = 0; i < 3; i++) {
        http.get(`${API_URL}/emails?page=1&limit=10`, { headers });
        sleep(0.1);
      }
    }
  });
}

export function websocketLoad() {
  group('websocket_load', () => {
    // Keep WebSocket open for 30-120 seconds
    createWebSocketConnection(30000 + Math.random() * 90000);
  });
}

export function longPolling() {
  group('long_polling', () => {
    const session = createSession();
    if (session) {
      // Continuous long-polling loop
      for (let i = 0; i < 3; i++) {
        createLongPollingConnection(session);
        sleep(0.5);
      }
    } else {
      sleep(5);
    }
  });
}

export default function () {
  connectionBuildup();
}

export function handleSummary(data) {
  return {
    'results/concurrent-connections-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const { metrics } = data;

  let output = `
╔══════════════════════════════════════════════════════════════╗
║             CONCURRENT CONNECTIONS TEST RESULTS              ║
╠══════════════════════════════════════════════════════════════╣
`;

  if (metrics.connection_time) {
    output += `
║ Connection Time                                              ║
║   Avg: ${metrics.connection_time.values.avg.toFixed(2)}ms
║   P95: ${metrics.connection_time.values['p(95)'].toFixed(2)}ms
║   P99: ${metrics.connection_time.values['p(99)'].toFixed(2)}ms
`;
  }

  if (metrics.active_connections) {
    output += `
║ Active Connections                                           ║
║   Max: ${metrics.active_connections.values.max}
║   Avg: ${metrics.active_connections.values.avg.toFixed(0)}
`;
  }

  if (metrics.websocket_latency) {
    output += `
║ WebSocket Latency                                            ║
║   Avg: ${metrics.websocket_latency.values.avg.toFixed(2)}ms
║   P95: ${metrics.websocket_latency.values['p(95)'].toFixed(2)}ms
`;
  }

  output += `
║ Connection Statistics                                        ║
║   Errors: ${metrics.connection_errors?.values.count || 0}
║   Success Rate: ${((metrics.connection_success_rate?.values.rate || 0) * 100).toFixed(2)}%
`;

  output += `
╚══════════════════════════════════════════════════════════════╝
`;

  return output;
}
