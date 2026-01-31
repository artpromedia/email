/**
 * IMAP Load Test
 * Tests IMAP server performance under load
 *
 * Target: 10,000 concurrent IMAP sessions
 *
 * Run with:
 *   k6 run --vus 10000 --duration 10m imap-load-test.js
 */

import { check, sleep, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import imap from 'k6/x/imap';

// Custom metrics
const imapConnectDuration = new Trend('imap_connect_duration');
const imapLoginDuration = new Trend('imap_login_duration');
const imapSelectDuration = new Trend('imap_select_duration');
const imapFetchDuration = new Trend('imap_fetch_duration');
const imapIdleDuration = new Trend('imap_idle_duration');
const sessionsActive = new Counter('sessions_active');
const sessionsFailed = new Counter('sessions_failed');
const sessionSuccessRate = new Rate('session_success_rate');
const messagesRead = new Counter('messages_read');

// Configuration
const IMAP_HOST = __ENV.IMAP_HOST || 'localhost';
const IMAP_PORT = __ENV.IMAP_PORT || '143';
const IMAP_USER = __ENV.IMAP_USER || 'testuser';
const IMAP_PASS = __ENV.IMAP_PASS || 'testpass';
const IMAP_TLS = __ENV.IMAP_TLS === 'true';

export const options = {
  scenarios: {
    // Ramp up to 10000 concurrent sessions
    imap_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 1000 },   // Warm up
        { duration: '3m', target: 5000 },   // Ramp up
        { duration: '5m', target: 10000 },  // Full load
        { duration: '5m', target: 10000 },  // Sustain
        { duration: '2m', target: 0 },      // Ramp down
      ],
      gracefulRampDown: '1m',
    },
  },
  thresholds: {
    imap_connect_duration: ['p(95)<2000'],   // 95% of connections under 2s
    imap_login_duration: ['p(95)<1000'],     // 95% of logins under 1s
    imap_select_duration: ['p(95)<500'],     // 95% of selects under 500ms
    imap_fetch_duration: ['p(95)<2000'],     // 95% of fetches under 2s
    session_success_rate: ['rate>0.98'],     // 98% success rate
  },
};

// Simulate different user behaviors
const behaviors = [
  { name: 'quick_check', weight: 50 },     // Quick email check
  { name: 'read_emails', weight: 30 },     // Read multiple emails
  { name: 'idle_session', weight: 15 },    // Long IDLE session
  { name: 'heavy_sync', weight: 5 },       // Full mailbox sync
];

function selectBehavior() {
  const rand = Math.random() * 100;
  let cumulative = 0;

  for (const behavior of behaviors) {
    cumulative += behavior.weight;
    if (rand < cumulative) {
      return behavior.name;
    }
  }

  return 'quick_check';
}

export default function () {
  const vuId = __VU;
  const iteration = __ITER;
  const behavior = selectBehavior();

  let client;
  let success = false;

  try {
    // Connect to IMAP server
    group('connect', function () {
      const connectStart = Date.now();

      client = imap.connect({
        host: IMAP_HOST,
        port: parseInt(IMAP_PORT),
        tls: IMAP_TLS,
      });

      imapConnectDuration.add(Date.now() - connectStart);
    });

    // Login
    group('login', function () {
      const loginStart = Date.now();

      // Use VU ID to simulate different users
      const username = `${IMAP_USER}_${vuId % 1000}`;

      const loginResult = client.login(username, IMAP_PASS);

      imapLoginDuration.add(Date.now() - loginStart);

      check(loginResult, {
        'login successful': (r) => r.success === true,
      });
    });

    // Execute behavior-specific actions
    switch (behavior) {
      case 'quick_check':
        executeQuickCheck(client);
        break;
      case 'read_emails':
        executeReadEmails(client);
        break;
      case 'idle_session':
        executeIdleSession(client);
        break;
      case 'heavy_sync':
        executeHeavySync(client);
        break;
    }

    success = true;
    sessionsActive.add(1);
    sessionSuccessRate.add(1);
  } catch (error) {
    sessionsFailed.add(1);
    sessionSuccessRate.add(0);
    console.error(`IMAP error (VU ${vuId}): ${error.message}`);
  } finally {
    if (client) {
      try {
        client.logout();
        client.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  // Delay before next iteration
  sleep(1 + Math.random() * 2);
}

// Quick email check - most common behavior
function executeQuickCheck(client) {
  group('quick_check', function () {
    // Select INBOX
    const selectStart = Date.now();
    const selectResult = client.select('INBOX');
    imapSelectDuration.add(Date.now() - selectStart);

    check(selectResult, {
      'INBOX selected': (r) => r.success === true,
    });

    // Check for unseen messages
    const searchResult = client.search(['UNSEEN']);

    if (searchResult.messages && searchResult.messages.length > 0) {
      // Fetch headers of first 5 unseen messages
      const fetchStart = Date.now();
      const toFetch = searchResult.messages.slice(0, 5);
      client.fetch(toFetch, ['FLAGS', 'ENVELOPE']);
      imapFetchDuration.add(Date.now() - fetchStart);
      messagesRead.add(toFetch.length);
    }
  });
}

// Read multiple emails
function executeReadEmails(client) {
  group('read_emails', function () {
    // Select INBOX
    const selectStart = Date.now();
    client.select('INBOX');
    imapSelectDuration.add(Date.now() - selectStart);

    // Fetch last 20 messages
    const fetchStart = Date.now();
    const result = client.fetch('1:20', ['FLAGS', 'ENVELOPE', 'BODY.PEEK[]']);
    imapFetchDuration.add(Date.now() - fetchStart);

    if (result.messages) {
      messagesRead.add(result.messages.length);

      // Mark as read
      client.store('1:20', '+FLAGS', ['\\Seen']);
    }

    // Brief pause to simulate reading
    sleep(0.5 + Math.random() * 1);
  });
}

// Long IDLE session - simulates email client waiting for new mail
function executeIdleSession(client) {
  group('idle_session', function () {
    // Select INBOX
    client.select('INBOX');

    // Enter IDLE mode
    const idleStart = Date.now();

    // IDLE for 5-30 seconds
    const idleDuration = 5 + Math.random() * 25;

    client.idle(idleDuration * 1000);

    imapIdleDuration.add(Date.now() - idleStart);
  });
}

// Heavy sync - simulates initial mailbox sync
function executeHeavySync(client) {
  group('heavy_sync', function () {
    // Get mailbox list
    client.list('', '*');

    // Select INBOX
    const selectStart = Date.now();
    client.select('INBOX');
    imapSelectDuration.add(Date.now() - selectStart);

    // Fetch all message UIDs and flags
    const fetchStart = Date.now();
    client.fetch('1:*', ['UID', 'FLAGS', 'ENVELOPE', 'INTERNALDATE']);
    imapFetchDuration.add(Date.now() - fetchStart);

    // Check other folders
    const folders = ['Sent', 'Drafts', 'Trash', 'Spam'];
    for (const folder of folders) {
      try {
        client.select(folder);
        client.fetch('1:*', ['UID', 'FLAGS']);
      } catch (e) {
        // Folder might not exist
      }
    }
  });
}

export function handleSummary(data) {
  return {
    'results/imap-load-test-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const { metrics } = data;

  let output = `
╔══════════════════════════════════════════════════════════════╗
║                    IMAP LOAD TEST RESULTS                    ║
╠══════════════════════════════════════════════════════════════╣
`;

  // Connection metrics
  if (metrics.imap_connect_duration) {
    output += `
║ IMAP Connection Duration                                     ║
║   Avg: ${metrics.imap_connect_duration.values.avg.toFixed(2)}ms
║   P95: ${metrics.imap_connect_duration.values['p(95)'].toFixed(2)}ms
║   Max: ${metrics.imap_connect_duration.values.max.toFixed(2)}ms
`;
  }

  // Login metrics
  if (metrics.imap_login_duration) {
    output += `
║ IMAP Login Duration                                          ║
║   Avg: ${metrics.imap_login_duration.values.avg.toFixed(2)}ms
║   P95: ${metrics.imap_login_duration.values['p(95)'].toFixed(2)}ms
`;
  }

  // Session metrics
  if (metrics.sessions_active) {
    output += `
║ Session Statistics                                           ║
║   Active: ${metrics.sessions_active.values.count}
║   Failed: ${metrics.sessions_failed?.values.count || 0}
║   Success Rate: ${((metrics.session_success_rate?.values.rate || 0) * 100).toFixed(2)}%
║   Messages Read: ${metrics.messages_read?.values.count || 0}
`;
  }

  output += `
╚══════════════════════════════════════════════════════════════╝
`;

  return output;
}
