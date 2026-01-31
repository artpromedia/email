/**
 * SMTP Load Test
 * Tests SMTP server performance under load
 *
 * Target: 1,000 concurrent SMTP connections
 *
 * Run with:
 *   k6 run --vus 1000 --duration 5m smtp-load-test.js
 */

import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import smtp from 'k6/x/smtp';

// Custom metrics
const smtpConnectDuration = new Trend('smtp_connect_duration');
const smtpSendDuration = new Trend('smtp_send_duration');
const emailsSent = new Counter('emails_sent');
const emailsFailed = new Counter('emails_failed');
const emailSuccessRate = new Rate('email_success_rate');

// Configuration
const SMTP_HOST = __ENV.SMTP_HOST || 'localhost';
const SMTP_PORT = __ENV.SMTP_PORT || '25';
const SMTP_USER = __ENV.SMTP_USER || '';
const SMTP_PASS = __ENV.SMTP_PASS || '';

export const options = {
  scenarios: {
    // Ramp up to 1000 concurrent connections
    smtp_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },   // Warm up
        { duration: '2m', target: 500 },   // Ramp up
        { duration: '5m', target: 1000 },  // Full load
        { duration: '2m', target: 1000 },  // Sustain
        { duration: '1m', target: 0 },     // Ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    smtp_connect_duration: ['p(95)<1000'],  // 95% of connections under 1s
    smtp_send_duration: ['p(95)<5000'],     // 95% of sends under 5s
    email_success_rate: ['rate>0.99'],      // 99% success rate
  },
};

// Generate unique email content
function generateEmail(vuId, iteration) {
  const timestamp = Date.now();
  const uniqueId = `${vuId}-${iteration}-${timestamp}`;

  return {
    from: `loadtest-${vuId}@test.example.com`,
    to: `recipient-${uniqueId}@test.example.com`,
    subject: `Load Test Email ${uniqueId}`,
    body: `
This is a load test email.

VU ID: ${vuId}
Iteration: ${iteration}
Timestamp: ${timestamp}

Lorem ipsum dolor sit amet, consectetur adipiscing elit.
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.

Best regards,
Load Test System
    `.trim(),
  };
}

export default function () {
  const vuId = __VU;
  const iteration = __ITER;

  // Generate email
  const email = generateEmail(vuId, iteration);

  // Connect to SMTP server
  const connectStart = Date.now();
  let client;

  try {
    client = smtp.connect({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT),
      username: SMTP_USER || undefined,
      password: SMTP_PASS || undefined,
    });

    smtpConnectDuration.add(Date.now() - connectStart);

    // Send email
    const sendStart = Date.now();

    const result = client.send({
      from: email.from,
      to: [email.to],
      subject: email.subject,
      body: email.body,
    });

    smtpSendDuration.add(Date.now() - sendStart);

    const success = check(result, {
      'email sent successfully': (r) => r.success === true,
    });

    if (success) {
      emailsSent.add(1);
      emailSuccessRate.add(1);
    } else {
      emailsFailed.add(1);
      emailSuccessRate.add(0);
      console.error(`Email send failed: ${result.error}`);
    }
  } catch (error) {
    smtpConnectDuration.add(Date.now() - connectStart);
    emailsFailed.add(1);
    emailSuccessRate.add(0);
    console.error(`SMTP error: ${error.message}`);
  } finally {
    if (client) {
      client.close();
    }
  }

  // Small delay between iterations
  sleep(0.1 + Math.random() * 0.2);
}

export function handleSummary(data) {
  return {
    'results/smtp-load-test-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const { metrics } = data;

  let output = `
╔══════════════════════════════════════════════════════════════╗
║                    SMTP LOAD TEST RESULTS                    ║
╠══════════════════════════════════════════════════════════════╣
`;

  // Connection metrics
  if (metrics.smtp_connect_duration) {
    output += `
║ SMTP Connection Duration                                     ║
║   Avg: ${metrics.smtp_connect_duration.values.avg.toFixed(2)}ms
║   P95: ${metrics.smtp_connect_duration.values['p(95)'].toFixed(2)}ms
║   Max: ${metrics.smtp_connect_duration.values.max.toFixed(2)}ms
`;
  }

  // Send metrics
  if (metrics.smtp_send_duration) {
    output += `
║ SMTP Send Duration                                           ║
║   Avg: ${metrics.smtp_send_duration.values.avg.toFixed(2)}ms
║   P95: ${metrics.smtp_send_duration.values['p(95)'].toFixed(2)}ms
║   Max: ${metrics.smtp_send_duration.values.max.toFixed(2)}ms
`;
  }

  // Success metrics
  if (metrics.emails_sent) {
    output += `
║ Email Statistics                                             ║
║   Sent: ${metrics.emails_sent.values.count}
║   Failed: ${metrics.emails_failed?.values.count || 0}
║   Success Rate: ${((metrics.email_success_rate?.values.rate || 0) * 100).toFixed(2)}%
`;
  }

  output += `
╚══════════════════════════════════════════════════════════════╝
`;

  return output;
}
