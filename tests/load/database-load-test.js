/**
 * Database Load Test
 * Tests PostgreSQL connection pool and query performance under load
 *
 * Run with:
 *   k6 run --vus 200 --duration 5m database-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter, Rate, Gauge } from 'k6/metrics';

// Custom metrics
const queryLatency = new Trend('query_latency');
const readQueryLatency = new Trend('read_query_latency');
const writeQueryLatency = new Trend('write_query_latency');
const complexQueryLatency = new Trend('complex_query_latency');
const connectionPoolUsage = new Gauge('connection_pool_usage');
const transactionLatency = new Trend('transaction_latency');
const deadlockRate = new Rate('deadlock_rate');
const queriesTotal = new Counter('queries_total');
const queriesFailed = new Counter('queries_failed');
const querySuccessRate = new Rate('query_success_rate');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/admin`;

export const options = {
  scenarios: {
    // Read-heavy workload
    read_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '2m', target: 150 },
        { duration: '3m', target: 200 },
        { duration: '1m', target: 0 },
      ],
      exec: 'readHeavyScenario',
      tags: { workload: 'read_heavy' },
    },
    // Write-heavy workload
    write_heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      startTime: '1m',
      stages: [
        { duration: '30s', target: 30 },
        { duration: '2m', target: 80 },
        { duration: '2m', target: 100 },
        { duration: '30s', target: 0 },
      ],
      exec: 'writeHeavyScenario',
      tags: { workload: 'write_heavy' },
    },
    // Mixed workload
    mixed: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      exec: 'mixedScenario',
      tags: { workload: 'mixed' },
    },
    // Burst load
    burst: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 500,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '10s', target: 100 },  // Sudden spike
        { duration: '30s', target: 100 },
        { duration: '10s', target: 10 },   // Return to normal
        { duration: '30s', target: 10 },
      ],
      exec: 'burstScenario',
      startTime: '3m',
      tags: { workload: 'burst' },
    },
  },
  thresholds: {
    query_latency: ['p(95)<100', 'p(99)<200'],
    read_query_latency: ['p(95)<50', 'p(99)<100'],
    write_query_latency: ['p(95)<150', 'p(99)<300'],
    complex_query_latency: ['p(95)<500', 'p(99)<1000'],
    transaction_latency: ['p(95)<200'],
    deadlock_rate: ['rate<0.001'],  // Less than 0.1% deadlocks
    query_success_rate: ['rate>0.995'],
  },
};

// Get auth token for admin API
function getAuthToken() {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: 'admin@test.example.com',
      password: 'adminpassword123',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  return loginRes.json('token');
}

const authToken = getAuthToken();

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${authToken}`,
  };
}

// Read operations
function performRead(queryType) {
  const startTime = Date.now();
  let res;

  switch (queryType) {
    case 'simple':
      res = http.get(`${API_URL}/health/db`, { headers: getHeaders() });
      break;
    case 'list':
      res = http.get(`${API_URL}/users?page=1&limit=50`, { headers: getHeaders() });
      break;
    case 'search':
      res = http.get(`${API_URL}/users/search?q=test`, { headers: getHeaders() });
      break;
    case 'aggregate':
      res = http.get(`${API_URL}/stats/overview`, { headers: getHeaders() });
      break;
    case 'join':
      res = http.get(`${API_URL}/users/with-domains`, { headers: getHeaders() });
      break;
    default:
      res = http.get(`${API_URL}/health`, { headers: getHeaders() });
  }

  const duration = Date.now() - startTime;
  queryLatency.add(duration);
  readQueryLatency.add(duration);
  queriesTotal.add(1);

  const success = check(res, {
    'read query success': (r) => r.status === 200,
  });

  if (success) {
    querySuccessRate.add(1);
  } else {
    queriesFailed.add(1);
    querySuccessRate.add(0);
  }

  return success;
}

// Write operations
function performWrite(writeType) {
  const startTime = Date.now();
  let res;
  const uniqueId = `${Date.now()}_${__VU}_${Math.random().toString(36).slice(2)}`;

  switch (writeType) {
    case 'insert':
      res = http.post(
        `${API_URL}/audit-logs`,
        JSON.stringify({
          action: 'test_action',
          details: { testId: uniqueId },
        }),
        { headers: getHeaders() }
      );
      break;
    case 'update':
      res = http.patch(
        `${API_URL}/settings`,
        JSON.stringify({ lastLoadTest: new Date().toISOString() }),
        { headers: getHeaders() }
      );
      break;
    case 'upsert':
      res = http.put(
        `${API_URL}/cache/${uniqueId}`,
        JSON.stringify({ value: 'test', ttl: 60 }),
        { headers: getHeaders() }
      );
      break;
    default:
      res = http.post(
        `${API_URL}/metrics`,
        JSON.stringify({ name: 'load_test', value: 1 }),
        { headers: getHeaders() }
      );
  }

  const duration = Date.now() - startTime;
  queryLatency.add(duration);
  writeQueryLatency.add(duration);
  queriesTotal.add(1);

  const success = check(res, {
    'write query success': (r) => r.status >= 200 && r.status < 300,
  });

  if (success) {
    querySuccessRate.add(1);
  } else {
    queriesFailed.add(1);
    querySuccessRate.add(0);

    // Check for deadlock
    if (res.body && res.body.includes('deadlock')) {
      deadlockRate.add(1);
    } else {
      deadlockRate.add(0);
    }
  }

  return success;
}

// Complex query operations
function performComplexQuery() {
  const startTime = Date.now();

  const res = http.get(
    `${API_URL}/reports/email-volume?startDate=${encodeURIComponent(new Date(Date.now() - 86400000 * 30).toISOString())}&endDate=${encodeURIComponent(new Date().toISOString())}&groupBy=day`,
    { headers: getHeaders() }
  );

  const duration = Date.now() - startTime;
  queryLatency.add(duration);
  complexQueryLatency.add(duration);
  queriesTotal.add(1);

  const success = check(res, {
    'complex query success': (r) => r.status === 200,
  });

  if (success) {
    querySuccessRate.add(1);
  } else {
    queriesFailed.add(1);
    querySuccessRate.add(0);
  }

  return success;
}

// Transaction operations
function performTransaction() {
  const startTime = Date.now();
  const uniqueId = `${Date.now()}_${__VU}`;

  const res = http.post(
    `${API_URL}/transactions/test`,
    JSON.stringify({
      operations: [
        { type: 'insert', table: 'test_data', data: { id: uniqueId } },
        { type: 'update', table: 'test_counter', where: { id: 1 }, set: { count: '+1' } },
        { type: 'select', table: 'test_data', where: { id: uniqueId } },
      ],
    }),
    { headers: getHeaders() }
  );

  const duration = Date.now() - startTime;
  transactionLatency.add(duration);
  queriesTotal.add(1);

  const success = check(res, {
    'transaction success': (r) => r.status === 200,
  });

  if (success) {
    querySuccessRate.add(1);
  } else {
    queriesFailed.add(1);
    querySuccessRate.add(0);

    if (res.body && res.body.includes('deadlock')) {
      deadlockRate.add(1);
    } else {
      deadlockRate.add(0);
    }
  }

  return success;
}

// Check connection pool status
function checkConnectionPool() {
  const res = http.get(`${API_URL}/health/db/pool`, { headers: getHeaders() });

  if (res.status === 200) {
    const pool = res.json();
    if (pool && pool.activeConnections !== undefined && pool.maxConnections !== undefined) {
      connectionPoolUsage.add(pool.activeConnections / pool.maxConnections * 100);
    }
  }
}

// Scenarios
export function readHeavyScenario() {
  group('read_heavy', () => {
    const queryTypes = ['simple', 'list', 'search', 'aggregate', 'join'];
    const queryType = queryTypes[Math.floor(Math.random() * queryTypes.length)];

    performRead(queryType);
    sleep(0.05 + Math.random() * 0.1);
  });
}

export function writeHeavyScenario() {
  group('write_heavy', () => {
    const writeTypes = ['insert', 'update', 'upsert'];
    const writeType = writeTypes[Math.floor(Math.random() * writeTypes.length)];

    performWrite(writeType);
    sleep(0.1 + Math.random() * 0.2);
  });
}

export function mixedScenario() {
  group('mixed', () => {
    // 70% reads, 20% writes, 10% complex
    const rand = Math.random() * 100;

    if (rand < 70) {
      performRead('list');
    } else if (rand < 90) {
      performWrite('insert');
    } else {
      performComplexQuery();
    }

    // Occasionally check pool
    if (Math.random() < 0.01) {
      checkConnectionPool();
    }

    sleep(0.05 + Math.random() * 0.15);
  });
}

export function burstScenario() {
  group('burst', () => {
    // Rapid-fire reads
    for (let i = 0; i < 3; i++) {
      performRead('simple');
    }

    sleep(0.01);
  });
}

export default function () {
  mixedScenario();
}

export function handleSummary(data) {
  return {
    'results/database-load-test-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const { metrics } = data;

  let output = `
╔══════════════════════════════════════════════════════════════╗
║                  DATABASE LOAD TEST RESULTS                  ║
╠══════════════════════════════════════════════════════════════╣
`;

  if (metrics.query_latency) {
    output += `
║ Query Latency                                                ║
║   Avg: ${metrics.query_latency.values.avg.toFixed(2)}ms
║   P95: ${metrics.query_latency.values['p(95)'].toFixed(2)}ms
║   P99: ${metrics.query_latency.values['p(99)'].toFixed(2)}ms
`;
  }

  if (metrics.read_query_latency) {
    output += `
║ Read Query Latency                                           ║
║   Avg: ${metrics.read_query_latency.values.avg.toFixed(2)}ms
║   P95: ${metrics.read_query_latency.values['p(95)'].toFixed(2)}ms
`;
  }

  if (metrics.write_query_latency) {
    output += `
║ Write Query Latency                                          ║
║   Avg: ${metrics.write_query_latency.values.avg.toFixed(2)}ms
║   P95: ${metrics.write_query_latency.values['p(95)'].toFixed(2)}ms
`;
  }

  if (metrics.queries_total) {
    output += `
║ Query Statistics                                             ║
║   Total: ${metrics.queries_total.values.count}
║   Failed: ${metrics.queries_failed?.values.count || 0}
║   Success Rate: ${((metrics.query_success_rate?.values.rate || 0) * 100).toFixed(3)}%
║   Deadlock Rate: ${((metrics.deadlock_rate?.values.rate || 0) * 100).toFixed(4)}%
`;
  }

  output += `
╚══════════════════════════════════════════════════════════════╝
`;

  return output;
}
