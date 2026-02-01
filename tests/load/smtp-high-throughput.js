/**
 * SMTP High-Throughput Test
 * Tests SMTP server with 1000+ concurrent connections
 *
 * Targets:
 * - 1000 concurrent SMTP connections
 * - Sustained message throughput
 * - Connection pooling behavior
 * - Queue management under load
 *
 * Run with:
 *   k6 run smtp-high-throughput.js
 */

import { check, sleep } from "k6";
import { Trend, Counter, Rate, Gauge } from "k6/metrics";
import smtp from "k6/x/smtp";

// Custom metrics
const connectionTime = new Trend("smtp_connection_time");
const authTime = new Trend("smtp_auth_time");
const sendTime = new Trend("smtp_send_time");
const totalDeliveryTime = new Trend("smtp_total_delivery_time");

const messagesQueued = new Counter("messages_queued");
const messagesDelivered = new Counter("messages_delivered");
const messagesFailed = new Counter("messages_failed");
const deliveryRate = new Rate("delivery_success_rate");

const activeConnections = new Gauge("active_smtp_connections");
const queueDepth = new Gauge("estimated_queue_depth");

// Configuration
const SMTP_HOST = __ENV.SMTP_HOST || "localhost";
const SMTP_PORT = Number.parseInt(__ENV.SMTP_PORT || "25", 10);
const SMTP_USER = __ENV.SMTP_USER || "";
const SMTP_PASS = __ENV.SMTP_PASS || "";
const USE_TLS = __ENV.SMTP_TLS === "true";

export const options = {
  scenarios: {
    // Main throughput test
    high_throughput: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 100 }, // Warm up
        { duration: "2m", target: 500 }, // Scale up
        { duration: "3m", target: 1000 }, // Full load - 1000 concurrent
        { duration: "5m", target: 1000 }, // Sustain
        { duration: "2m", target: 500 }, // Scale down
        { duration: "1m", target: 0 }, // Cool down
      ],
      gracefulRampDown: "30s",
    },

    // Burst test - sudden spike
    burst: {
      executor: "ramping-vus",
      startVUs: 0,
      startTime: "14m", // After main test
      stages: [
        { duration: "10s", target: 1500 }, // Spike
        { duration: "30s", target: 1500 }, // Hold spike
        { duration: "20s", target: 100 }, // Recover
      ],
    },
  },
  thresholds: {
    smtp_connection_time: ["p(95)<2000"], // 95% connections under 2s
    smtp_send_time: ["p(95)<5000"], // 95% sends under 5s
    delivery_success_rate: ["rate>0.95"], // 95% success
    smtp_total_delivery_time: ["p(95)<10000"], // 95% total under 10s
  },
};

// Message templates
const messageTemplates = [
  {
    type: "small",
    size: 1024,
    weight: 50,
    generate: (vuId, iter) => ({
      subject: `Small message ${vuId}-${iter}`,
      body: "A".repeat(500),
    }),
  },
  {
    type: "medium",
    size: 10240,
    weight: 35,
    generate: (vuId, iter) => ({
      subject: `Medium message ${vuId}-${iter}`,
      body: "B".repeat(8000),
    }),
  },
  {
    type: "large",
    size: 102400,
    weight: 10,
    generate: (vuId, iter) => ({
      subject: `Large message ${vuId}-${iter}`,
      body: "C".repeat(80000),
    }),
  },
  {
    type: "multipart",
    size: 20480,
    weight: 5,
    generate: (vuId, iter) => ({
      subject: `Multipart message ${vuId}-${iter}`,
      body: "Multipart email body",
      html: "<html><body><h1>HTML Content</h1><p>" + "D".repeat(10000) + "</p></body></html>",
    }),
  },
];

function selectMessageTemplate() {
  const totalWeight = messageTemplates.reduce((sum, t) => sum + t.weight, 0);
  const rand = Math.random() * totalWeight;
  let cumulative = 0;

  for (const template of messageTemplates) {
    cumulative += template.weight;
    if (rand < cumulative) {
      return template;
    }
  }

  return messageTemplates[0];
}

// Connection pool simulation
const connectionPool = {};

function getConnection(vuId) {
  const poolKey = vuId % 100; // Simulate connection pooling

  if (connectionPool[poolKey] && connectionPool[poolKey].isAlive()) {
    return connectionPool[poolKey];
  }

  const connectStart = Date.now();
  activeConnections.add(1);

  try {
    const client = smtp.connect({
      host: SMTP_HOST,
      port: SMTP_PORT,
      tls: USE_TLS,
    });

    connectionTime.add(Date.now() - connectStart);

    // Authenticate if credentials provided
    if (SMTP_USER && SMTP_PASS) {
      const authStart = Date.now();
      client.auth(SMTP_USER, SMTP_PASS);
      authTime.add(Date.now() - authStart);
    }

    connectionPool[poolKey] = client;
    return client;
  } catch (error) {
    activeConnections.add(-1);
    throw error;
  }
}

function releaseConnection(vuId, client, forceClose = false) {
  if (forceClose) {
    try {
      client.quit();
      client.close();
    } catch (e) {
      console.log("Cleanup error:", e);
    }
    activeConnections.add(-1);
    delete connectionPool[vuId % 100];
  }
  // Otherwise keep in pool
}

export default function smtpHighThroughputTest() {
  const vuId = __VU;
  const iteration = __ITER;
  const totalStart = Date.now();

  // Select message template
  const template = selectMessageTemplate();
  const message = template.generate(vuId, iteration);

  // Generate sender/recipient
  const senderId = vuId % 500;
  const recipientId = (vuId + iteration + 1) % 500;

  const from = `sender${senderId}@test.example.com`;
  const to = `recipient${recipientId}@test.example.com`;

  let client;
  let success = false;

  try {
    // Get connection
    client = getConnection(vuId);

    // Send message
    const sendStart = Date.now();
    messagesQueued.add(1);
    queueDepth.add(1);

    const result = client.send({
      from: from,
      to: [to],
      subject: message.subject,
      body: message.body,
      html: message.html,
    });

    sendTime.add(Date.now() - sendStart);
    queueDepth.add(-1);

    success = check(result, {
      "message sent": (r) => r.success === true,
      "has message id": (r) => r.messageId && r.messageId.length > 0,
    });

    if (success) {
      messagesDelivered.add(1);
      deliveryRate.add(1);
    } else {
      messagesFailed.add(1);
      deliveryRate.add(0);
      console.error(`Send failed: ${result.error}`);
    }
  } catch (error) {
    messagesFailed.add(1);
    deliveryRate.add(0);
    queueDepth.add(-1);

    // Force close on error
    if (client) {
      releaseConnection(vuId, client, true);
      client = null;
    }

    console.error(`SMTP error (VU ${vuId}): ${error.message}`);
  } finally {
    if (client) {
      // Randomly close some connections to test reconnection
      const shouldClose = Math.random() < 0.05; // 5% chance
      releaseConnection(vuId, client, shouldClose);
    }
  }

  totalDeliveryTime.add(Date.now() - totalStart);

  // Small delay between messages
  sleep(0.05 + Math.random() * 0.1);
}

// Cleanup function
export function teardown() {
  // Close all pooled connections
  for (const key in connectionPool) {
    try {
      connectionPool[key].quit();
      connectionPool[key].close();
    } catch (e) {
      console.log("Teardown error:", e);
    }
  }
}

export function handleSummary(data) {
  return {
    "results/smtp-high-throughput-summary.json": JSON.stringify(data, null, 2),
    stdout: generateSMTPReport(data),
  };
}

function generateSMTPReport(data) {
  const { metrics } = data;

  let report = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                 SMTP HIGH-THROUGHPUT TEST RESULTS                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
`;

  // Connection metrics
  if (metrics.smtp_connection_time) {
    const ct = metrics.smtp_connection_time.values;
    report += `
║ CONNECTION TIME                                                              ║
║   Average:     ${ct.avg?.toFixed(2) || "N/A"} ms
║   P95:         ${ct["p(95)"]?.toFixed(2) || "N/A"} ms
║   Max:         ${ct.max?.toFixed(2) || "N/A"} ms
`;
  }

  // Send time metrics
  if (metrics.smtp_send_time) {
    const st = metrics.smtp_send_time.values;
    report += `
║ SEND TIME                                                                    ║
║   Average:     ${st.avg?.toFixed(2) || "N/A"} ms
║   P95:         ${st["p(95)"]?.toFixed(2) || "N/A"} ms
║   Max:         ${st.max?.toFixed(2) || "N/A"} ms
`;
  }

  // Total delivery time
  if (metrics.smtp_total_delivery_time) {
    const td = metrics.smtp_total_delivery_time.values;
    report += `
║ TOTAL DELIVERY TIME                                                          ║
║   Average:     ${td.avg?.toFixed(2) || "N/A"} ms
║   P95:         ${td["p(95)"]?.toFixed(2) || "N/A"} ms
║   P99:         ${td["p(99)"]?.toFixed(2) || "N/A"} ms
`;
  }

  // Message statistics
  report += `
╠══════════════════════════════════════════════════════════════════════════════╣
║ MESSAGE STATISTICS                                                           ║
`;

  if (metrics.messages_queued) {
    report += `║   Messages Queued:    ${metrics.messages_queued.values.count}
`;
  }
  if (metrics.messages_delivered) {
    report += `║   Messages Delivered: ${metrics.messages_delivered.values.count}
`;
  }
  if (metrics.messages_failed) {
    report += `║   Messages Failed:    ${metrics.messages_failed.values.count}
`;
  }
  if (metrics.delivery_success_rate) {
    report += `║   Success Rate:       ${(metrics.delivery_success_rate.values.rate * 100).toFixed(2)}%
`;
  }

  // Throughput
  if (metrics.messages_delivered) {
    const duration = data.state?.testRunDurationMs || 1;
    const throughput = ((metrics.messages_delivered.values.count / duration) * 1000).toFixed(2);
    report += `║   Throughput:         ${throughput} msg/sec
`;
  }

  // Thresholds
  report += `
╠══════════════════════════════════════════════════════════════════════════════╣
║ THRESHOLDS                                                                   ║
`;

  for (const [name, threshold] of Object.entries(data.thresholds || {})) {
    const status = threshold.ok ? "✓ PASS" : "✗ FAIL";
    report += `║   ${name.padEnd(35)} ${status}
`;
  }

  report += `
╚══════════════════════════════════════════════════════════════════════════════╝
`;

  return report;
}
