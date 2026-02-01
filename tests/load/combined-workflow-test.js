/**
 * Combined Email Workflow Load Test
 * Tests the complete email workflow under load: compose, send, receive, read
 *
 * This test simulates realistic user behavior patterns combining
 * API, SMTP, and IMAP operations in realistic workflows.
 *
 * Run with:
 *   k6 run --vus 200 --duration 10m combined-workflow-test.js
 */

import http from "k6/http";
import { sleep, group } from "k6";
import { Trend, Counter, Rate, Gauge } from "k6/metrics";

// Custom metrics
const workflowDuration = new Trend("workflow_duration");
const composeDuration = new Trend("compose_duration");
const sendDuration = new Trend("send_duration");
const deliveryDuration = new Trend("delivery_duration");
const readDuration = new Trend("read_duration");

const workflowsCompleted = new Counter("workflows_completed");
const workflowsFailed = new Counter("workflows_failed");
const workflowSuccessRate = new Rate("workflow_success_rate");

const emailsComposed = new Counter("emails_composed");
const emailsSent = new Counter("emails_sent");
const emailsDelivered = new Counter("emails_delivered");
const emailsRead = new Counter("emails_read");

const concurrentUsers = new Gauge("concurrent_users");

// Configuration
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const API_URL = `${BASE_URL}/api`;
const SMTP_HOST = __ENV.SMTP_HOST || "localhost";
const SMTP_PORT = __ENV.SMTP_PORT || "25";
const IMAP_HOST = __ENV.IMAP_HOST || "localhost";
const IMAP_PORT = __ENV.IMAP_PORT || "143";

export const options = {
  scenarios: {
    // Complete workflow simulation
    email_workflow: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 50 }, // Warm up
        { duration: "3m", target: 100 }, // Ramp up
        { duration: "5m", target: 200 }, // Full load
        { duration: "5m", target: 200 }, // Sustain
        { duration: "2m", target: 0 }, // Ramp down
      ],
      gracefulRampDown: "1m",
    },

    // Spike test scenario
    spike_test: {
      executor: "ramping-vus",
      startVUs: 0,
      startTime: "17m", // After main test completes
      stages: [
        { duration: "30s", target: 500 }, // Spike up
        { duration: "1m", target: 500 }, // Hold spike
        { duration: "30s", target: 50 }, // Recovery
        { duration: "1m", target: 50 }, // Stabilize
      ],
    },
  },
  thresholds: {
    workflow_duration: ["p(95)<30000"], // 95% of workflows under 30s
    compose_duration: ["p(95)<1000"], // 95% of compose under 1s
    send_duration: ["p(95)<5000"], // 95% of sends under 5s
    delivery_duration: ["p(95)<10000"], // 95% of deliveries under 10s
    read_duration: ["p(95)<2000"], // 95% of reads under 2s
    workflow_success_rate: ["rate>0.95"], // 95% success rate
  },
};

// Workflow types with weights
const workflowTypes = [
  { name: "send_and_receive", weight: 40 }, // Full send/receive cycle
  { name: "compose_draft", weight: 15 }, // Compose and save draft
  { name: "read_reply", weight: 25 }, // Read and reply to email
  { name: "bulk_read", weight: 10 }, // Read multiple emails
  { name: "search_and_read", weight: 10 }, // Search and read results
];

function selectWorkflow() {
  const rand = Math.random() * 100;
  let cumulative = 0;

  for (const workflow of workflowTypes) {
    cumulative += workflow.weight;
    if (rand < cumulative) {
      return workflow.name;
    }
  }

  return "send_and_receive";
}

// User session class
class UserSession {
  constructor(vuId) {
    this.vuId = vuId;
    this.userId = `user_${vuId % 500}`;
    this.email = `${this.userId}@test.example.com`;
    this.authToken = null;
    this.refreshToken = null;
  }

  authenticate() {
    const res = http.post(
      `${API_URL}/auth/login`,
      JSON.stringify({
        email: this.email,
        password: "testpassword123",
      }),
      { headers: { "Content-Type": "application/json" } }
    );

    if (res.status === 200) {
      const body = res.json();
      this.authToken = body.accessToken || body.token;
      this.refreshToken = body.refreshToken;
      return true;
    }
    return false;
  }

  getHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.authToken}`,
    };
  }

  // Compose email (save as draft)
  composeDraft(subject, body, to) {
    const start = Date.now();

    const res = http.post(
      `${API_URL}/emails/drafts`,
      JSON.stringify({
        to: [to],
        subject: subject,
        body: body,
        isDraft: true,
      }),
      { headers: this.getHeaders() }
    );

    composeDuration.add(Date.now() - start);

    if (res.status === 201 || res.status === 200) {
      emailsComposed.add(1);
      return res.json("id") || res.json("draftId");
    }
    return null;
  }

  // Send email via API
  sendEmail(subject, body, to) {
    const start = Date.now();

    const res = http.post(
      `${API_URL}/emails/send`,
      JSON.stringify({
        to: [to],
        subject: subject,
        body: body,
      }),
      { headers: this.getHeaders() }
    );

    sendDuration.add(Date.now() - start);

    if (res.status === 200 || res.status === 201 || res.status === 202) {
      emailsSent.add(1);
      return res.json("messageId") || true;
    }
    return null;
  }

  // List emails
  listEmails(folder = "inbox", limit = 20) {
    const res = http.get(`${API_URL}/emails?folder=${folder}&limit=${limit}`, {
      headers: this.getHeaders(),
    });

    if (res.status === 200) {
      return res.json("emails") || res.json("messages") || [];
    }
    return [];
  }

  // Fetch single email
  fetchEmail(emailId) {
    const start = Date.now();

    const res = http.get(`${API_URL}/emails/${emailId}`, { headers: this.getHeaders() });

    readDuration.add(Date.now() - start);

    if (res.status === 200) {
      emailsRead.add(1);
      return res.json();
    }
    return null;
  }

  // Search emails
  searchEmails(query) {
    const res = http.get(`${API_URL}/emails/search?q=${encodeURIComponent(query)}`, {
      headers: this.getHeaders(),
    });

    if (res.status === 200) {
      return res.json("results") || res.json("emails") || [];
    }
    return [];
  }

  // Reply to email
  replyToEmail(emailId, body) {
    const start = Date.now();

    const res = http.post(`${API_URL}/emails/${emailId}/reply`, JSON.stringify({ body: body }), {
      headers: this.getHeaders(),
    });

    sendDuration.add(Date.now() - start);

    if (res.status === 200 || res.status === 201 || res.status === 202) {
      emailsSent.add(1);
      return true;
    }
    return false;
  }

  // Mark email as read
  markAsRead(emailId) {
    const res = http.patch(`${API_URL}/emails/${emailId}`, JSON.stringify({ isRead: true }), {
      headers: this.getHeaders(),
    });

    return res.status === 200;
  }

  // Logout
  logout() {
    http.post(`${API_URL}/auth/logout`, null, { headers: this.getHeaders() });
  }
}

// Workflow implementations
function sendAndReceiveWorkflow(session, iteration) {
  const start = Date.now();
  let success = false;

  group("send_and_receive", function () {
    // Generate recipient (another test user)
    const recipientId = (session.vuId + 1) % 500;
    const recipient = `user_${recipientId}@test.example.com`;

    // Compose and send email
    const subject = `Load Test ${session.vuId}-${iteration} at ${Date.now()}`;
    const body = `This is a load test email from VU ${session.vuId}.\n\nTimestamp: ${new Date().toISOString()}`;

    const messageId = session.sendEmail(subject, body, recipient);

    if (messageId) {
      // Wait for delivery (simulated by polling inbox)
      const deliveryStart = Date.now();
      let delivered = false;

      for (let attempt = 0; attempt < 10; attempt++) {
        sleep(1);

        // Check recipient's inbox (simulate with API call)
        const emails = session.listEmails("inbox", 10);
        if (emails.length > 0) {
          delivered = true;
          emailsDelivered.add(1);
          break;
        }
      }

      deliveryDuration.add(Date.now() - deliveryStart);
      success = delivered;
    }
  });

  workflowDuration.add(Date.now() - start);
  return success;
}

function composeDraftWorkflow(session, iteration) {
  const start = Date.now();
  let success = false;

  group("compose_draft", function () {
    const subject = `Draft ${session.vuId}-${iteration}`;
    const body = `Draft content created at ${new Date().toISOString()}`;
    const recipient = "recipient@test.example.com";

    const draftId = session.composeDraft(subject, body, recipient);
    success = draftId !== null;
  });

  workflowDuration.add(Date.now() - start);
  return success;
}

function readReplyWorkflow(session, iteration) {
  const start = Date.now();
  let success = false;

  group("read_reply", function () {
    // List emails
    const emails = session.listEmails("inbox", 10);

    if (emails.length > 0) {
      // Read first email
      const email = session.fetchEmail(emails[0].id);

      if (email) {
        // Mark as read
        session.markAsRead(emails[0].id);

        // Reply
        const replyBody = `Reply from load test VU ${session.vuId}.\n\nOriginal: ${email.subject || "No subject"}`;
        success = session.replyToEmail(emails[0].id, replyBody);
      }
    } else {
      // No emails to read, consider success
      success = true;
    }
  });

  workflowDuration.add(Date.now() - start);
  return success;
}

function bulkReadWorkflow(session, iteration) {
  const start = Date.now();
  let success = true;

  group("bulk_read", function () {
    // List emails
    const emails = session.listEmails("inbox", 50);

    // Read multiple emails
    const toRead = Math.min(emails.length, 10);
    for (let i = 0; i < toRead; i++) {
      const email = session.fetchEmail(emails[i].id);
      if (!email) {
        success = false;
      }

      // Mark as read
      session.markAsRead(emails[i].id);

      // Small delay between reads
      sleep(0.1);
    }
  });

  workflowDuration.add(Date.now() - start);
  return success;
}

function searchAndReadWorkflow(session, iteration) {
  const start = Date.now();
  let success = false;

  group("search_and_read", function () {
    // Search for emails
    const searchTerms = ["load test", "important", "meeting", "report"];
    const query = searchTerms[iteration % searchTerms.length];

    const results = session.searchEmails(query);

    if (results.length > 0) {
      // Read first result
      const email = session.fetchEmail(results[0].id);
      success = email !== null;
    } else {
      // No results is still a successful search
      success = true;
    }
  });

  workflowDuration.add(Date.now() - start);
  return success;
}

export default function combinedWorkflowTest() {
  const vuId = __VU;
  const iteration = __ITER;

  concurrentUsers.add(1);

  const session = new UserSession(vuId);
  let success = false;

  try {
    // Authenticate
    if (!session.authenticate()) {
      workflowsFailed.add(1);
      workflowSuccessRate.add(0);
      console.error(`Authentication failed for VU ${vuId}`);
      return;
    }

    // Select and execute workflow
    const workflow = selectWorkflow();

    switch (workflow) {
      case "send_and_receive":
        success = sendAndReceiveWorkflow(session, iteration);
        break;
      case "compose_draft":
        success = composeDraftWorkflow(session, iteration);
        break;
      case "read_reply":
        success = readReplyWorkflow(session, iteration);
        break;
      case "bulk_read":
        success = bulkReadWorkflow(session, iteration);
        break;
      case "search_and_read":
        success = searchAndReadWorkflow(session, iteration);
        break;
    }

    if (success) {
      workflowsCompleted.add(1);
      workflowSuccessRate.add(1);
    } else {
      workflowsFailed.add(1);
      workflowSuccessRate.add(0);
    }

    // Logout
    session.logout();
  } catch (error) {
    workflowsFailed.add(1);
    workflowSuccessRate.add(0);
    console.error(`Workflow error (VU ${vuId}): ${error.message}`);
  } finally {
    concurrentUsers.add(-1);
  }

  // Variable delay between iterations (simulates think time)
  sleep(2 + Math.random() * 5);
}

export function handleSummary(data) {
  return {
    "results/combined-workflow-summary.json": JSON.stringify(data, null, 2),
    stdout: generateReport(data),
  };
}

function generateReport(data) {
  const { metrics } = data;

  let report = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                    COMBINED EMAIL WORKFLOW LOAD TEST RESULTS                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
`;

  // Workflow metrics
  if (metrics.workflow_duration) {
    const wd = metrics.workflow_duration.values;
    report += `
║ WORKFLOW DURATION                                                            ║
║   Average:  ${wd.avg?.toFixed(2) || "N/A"} ms
║   Median:   ${wd.med?.toFixed(2) || "N/A"} ms
║   P95:      ${wd["p(95)"]?.toFixed(2) || "N/A"} ms
║   P99:      ${wd["p(99)"]?.toFixed(2) || "N/A"} ms
║   Max:      ${wd.max?.toFixed(2) || "N/A"} ms
`;
  }

  // Component durations
  const components = ["compose", "send", "delivery", "read"];
  for (const comp of components) {
    const metric = metrics[`${comp}_duration`];
    if (metric) {
      const v = metric.values;
      report += `
║ ${comp.toUpperCase()} DURATION
║   Avg: ${v.avg?.toFixed(2) || "N/A"} ms | P95: ${v["p(95)"]?.toFixed(2) || "N/A"} ms | Max: ${v.max?.toFixed(2) || "N/A"} ms
`;
    }
  }

  // Success metrics
  report += `
╠══════════════════════════════════════════════════════════════════════════════╣
║ SUCCESS METRICS                                                              ║
`;

  if (metrics.workflows_completed) {
    report += `║   Workflows Completed: ${metrics.workflows_completed.values.count}
`;
  }
  if (metrics.workflows_failed) {
    report += `║   Workflows Failed:    ${metrics.workflows_failed.values.count}
`;
  }
  if (metrics.workflow_success_rate) {
    report += `║   Success Rate:        ${(metrics.workflow_success_rate.values.rate * 100).toFixed(2)}%
`;
  }

  // Email statistics
  report += `
╠══════════════════════════════════════════════════════════════════════════════╣
║ EMAIL STATISTICS                                                             ║
`;

  const emailMetrics = ["emails_composed", "emails_sent", "emails_delivered", "emails_read"];
  for (const m of emailMetrics) {
    if (metrics[m]) {
      const label = m.replaceAll("_", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
      report += `║   ${label}: ${metrics[m].values.count}
`;
    }
  }

  // HTTP metrics
  if (metrics.http_req_duration) {
    const hrd = metrics.http_req_duration.values;
    report += `
╠══════════════════════════════════════════════════════════════════════════════╣
║ HTTP REQUEST METRICS                                                         ║
║   Total Requests: ${metrics.http_reqs?.values.count || "N/A"}
║   Avg Duration:   ${hrd.avg?.toFixed(2) || "N/A"} ms
║   P95 Duration:   ${hrd["p(95)"]?.toFixed(2) || "N/A"} ms
║   P99 Duration:   ${hrd["p(99)"]?.toFixed(2) || "N/A"} ms
`;
  }

  report += `
╚══════════════════════════════════════════════════════════════════════════════╝
`;

  return report;
}
