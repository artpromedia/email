import { describe, it, expect, vi, beforeEach } from "vitest";
import { OonruMail } from "../src/client.js";
import { OonruMailError, OonruMailTimeoutError } from "../src/errors.js";

// ─── Mock fetch ──────────────────────────────────────────────────────────────

function mockFetch(status: number, body?: unknown, headers?: Record<string, string>) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => {
        if (name === "content-type") return "application/json";
        return headers?.[name] ?? null;
      },
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function createClient(fetchImpl: ReturnType<typeof mockFetch>) {
  return new OonruMail({
    apiKey: "em_live_test123",
    baseUrl: "https://api.test.com",
    maxRetries: 0,
    fetch: fetchImpl as unknown as typeof fetch,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("OonruMail Client", () => {
  describe("constructor", () => {
    it("throws if apiKey is missing", () => {
      expect(() => new OonruMail({ apiKey: "" })).toThrow("apiKey is required");
    });

    it("creates instance with valid config", () => {
      const f = mockFetch(200);
      const mail = new OonruMail({
        apiKey: "em_live_test",
        fetch: f as unknown as typeof fetch,
      });
      expect(mail).toBeDefined();
      expect(mail.templates).toBeDefined();
      expect(mail.webhooks).toBeDefined();
      expect(mail.suppressions).toBeDefined();
      expect(mail.messages).toBeDefined();
      expect(mail.events).toBeDefined();
      expect(mail.analytics).toBeDefined();
      expect(mail.apiKeys).toBeDefined();
    });
  });

  describe("send()", () => {
    it("sends a single email", async () => {
      const response = {
        message_id: "msg-123",
        status: "queued",
        accepted: ["user@example.com"],
        rejected: [],
        queued_at: "2026-02-14T12:00:00Z",
        estimated_delivery: "2026-02-14T12:00:05Z",
      };
      const f = mockFetch(202, response);
      const mail = createClient(f);

      const result = await mail.send({
        from: "noreply@app.com",
        to: ["user@example.com"],
        subject: "Test",
        html: "<p>Hello</p>",
      });

      expect(result.message_id).toBe("msg-123");
      expect(result.status).toBe("queued");
      expect(f).toHaveBeenCalledTimes(1);

      const [url, opts] = f.mock.calls[0];
      expect(url).toBe("https://api.test.com/api/v1/send");
      expect(opts.method).toBe("POST");
      expect(opts.headers.Authorization).toBe("Bearer em_live_test123");
      expect(opts.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(opts.body)).toEqual({
        from: "noreply@app.com",
        to: ["user@example.com"],
        subject: "Test",
        html: "<p>Hello</p>",
      });
    });

    it("sendSimple accepts a single to string", async () => {
      const f = mockFetch(202, {
        message_id: "msg-1",
        status: "queued",
        accepted: [],
        rejected: [],
      });
      const mail = createClient(f);

      await mail.sendSimple({
        from: "a@b.com",
        to: "c@d.com",
        subject: "Hi",
        html: "<p>Hi</p>",
      });

      const body = JSON.parse(f.mock.calls[0][1].body);
      expect(body.to).toEqual(["c@d.com"]);
    });

    it("sendWithTemplate passes template_id and substitutions", async () => {
      const f = mockFetch(202, {
        message_id: "msg-2",
        status: "queued",
        accepted: [],
        rejected: [],
      });
      const mail = createClient(f);

      await mail.sendWithTemplate({
        from: "a@b.com",
        to: "c@d.com",
        template_id: "tpl-123",
        substitutions: { name: "Alice" },
      });

      const body = JSON.parse(f.mock.calls[0][1].body);
      expect(body.template_id).toBe("tpl-123");
      expect(body.substitutions).toEqual({ name: "Alice" });
    });
  });

  describe("sendBatch()", () => {
    it("sends batch request", async () => {
      const response = {
        batch_id: "batch-1",
        total_queued: 2,
        results: [
          { message_id: "m1", status: "queued", accepted: ["a@b.com"], rejected: [] },
          { message_id: "m2", status: "queued", accepted: ["c@d.com"], rejected: [] },
        ],
      };
      const f = mockFetch(202, response);
      const mail = createClient(f);

      const result = await mail.sendBatch({
        messages: [
          { from: "x@y.com", to: ["a@b.com"], subject: "A", html: "a" },
          { from: "x@y.com", to: ["c@d.com"], subject: "B", html: "b" },
        ],
      });

      expect(result.total_queued).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(f.mock.calls[0][0]).toBe("https://api.test.com/api/v1/send/batch");
    });
  });

  describe("templates", () => {
    it("lists templates", async () => {
      const response = { templates: [], total: 0, limit: 20, offset: 0, has_more: false };
      const f = mockFetch(200, response);
      const mail = createClient(f);

      const result = await mail.templates.list({ category: "onboarding" });

      expect(result.templates).toEqual([]);
      const url = f.mock.calls[0][0];
      expect(url).toContain("category=onboarding");
    });

    it("creates a template", async () => {
      const tpl = { id: "tpl-1", name: "Welcome" };
      const f = mockFetch(201, tpl);
      const mail = createClient(f);

      const result = await mail.templates.create({
        name: "Welcome",
        subject: "Welcome {{name}}",
        html_content: "<h1>Hi</h1>",
      });

      expect(result.id).toBe("tpl-1");
    });

    it("renders a template", async () => {
      const rendered = { subject: "Welcome Alice", html: "<h1>Hi Alice</h1>", text: "Hi Alice" };
      const f = mockFetch(200, rendered);
      const mail = createClient(f);

      const result = await mail.templates.render("tpl-1", { name: "Alice" });

      expect(result.subject).toBe("Welcome Alice");
      expect(f.mock.calls[0][0]).toContain("/templates/tpl-1/render");
    });

    it("deletes a template", async () => {
      const f = mockFetch(204);
      const mail = createClient(f);

      await mail.templates.delete("tpl-1");

      expect(f.mock.calls[0][1].method).toBe("DELETE");
    });
  });

  describe("webhooks", () => {
    it("creates a webhook", async () => {
      const wh = { id: "wh-1", url: "https://example.com/hook", secret: "sec-123" };
      const f = mockFetch(201, wh);
      const mail = createClient(f);

      const result = await mail.webhooks.create({
        url: "https://example.com/hook",
        events: ["delivered", "bounced"],
      });

      expect(result.secret).toBe("sec-123");
    });

    it("tests a webhook", async () => {
      const resp = { success: true, status_code: 200, response_body: "ok", latency_ms: 42 };
      const f = mockFetch(200, resp);
      const mail = createClient(f);

      const result = await mail.webhooks.test("wh-1", "bounced");

      expect(result.success).toBe(true);
      const body = JSON.parse(f.mock.calls[0][1].body);
      expect(body.event_type).toBe("bounced");
    });
  });

  describe("suppressions", () => {
    it("checks suppression status", async () => {
      const resp = {
        results: {
          "bad@example.com": { suppressed: true, reason: "bounce" },
          "good@example.com": { suppressed: false },
        },
      };
      const f = mockFetch(200, resp);
      const mail = createClient(f);

      const result = await mail.suppressions.check(["bad@example.com", "good@example.com"]);

      expect(result.results["bad@example.com"].suppressed).toBe(true);
      expect(result.results["good@example.com"].suppressed).toBe(false);
    });

    it("gets suppression stats", async () => {
      const stats = { total: 150, bounces: 80, unsubscribes: 40 };
      const f = mockFetch(200, stats);
      const mail = createClient(f);

      const result = await mail.suppressions.stats();

      expect(result.total).toBe(150);
    });
  });

  describe("messages", () => {
    it("lists messages with status filter", async () => {
      const resp = { messages: [], total: 0, limit: 20, offset: 0, has_more: false };
      const f = mockFetch(200, resp);
      const mail = createClient(f);

      await mail.messages.list({ status: "delivered", limit: 5 });

      const url = f.mock.calls[0][0];
      expect(url).toContain("status=delivered");
      expect(url).toContain("limit=5");
    });

    it("gets message timeline", async () => {
      const resp = {
        message_id: "msg-1",
        status: "delivered",
        events: [{ event_type: "processed", timestamp: "2026-01-01" }],
      };
      const f = mockFetch(200, resp);
      const mail = createClient(f);

      const result = await mail.messages.timeline("msg-1");

      expect(result.events).toHaveLength(1);
    });
  });

  describe("analytics", () => {
    it("gets overview stats", async () => {
      const stats = { sent: 1000, delivered: 980, delivery_rate: 98.0 };
      const f = mockFetch(200, stats);
      const mail = createClient(f);

      const result = await mail.analytics.overview({
        start_date: "2026-01-01",
        end_date: "2026-01-31",
      });

      expect(result.delivery_rate).toBe(98.0);
      const url = f.mock.calls[0][0];
      expect(url).toContain("start_date=2026-01-01");
    });

    it("gets realtime stats (no params)", async () => {
      const stats = { sent_last_minute: 5, sent_last_hour: 200 };
      const f = mockFetch(200, stats);
      const mail = createClient(f);

      const result = await mail.analytics.realtime();

      expect(result.sent_last_minute).toBe(5);
    });
  });

  describe("apiKeys", () => {
    it("creates an API key", async () => {
      const resp = {
        api_key: { id: "key-1", name: "Test Key" },
        key: "em_live_newkey123",
      };
      const f = mockFetch(201, resp);
      const mail = createClient(f);

      const result = await mail.apiKeys.create({
        domain_id: "dom-1",
        name: "Test Key",
        scopes: ["send", "read"],
      });

      expect(result.key).toBe("em_live_newkey123");
    });

    it("gets API key usage", async () => {
      const resp = { key_id: "key-1", days: 7, usage: [{ date: "2026-01-01", requests: 100 }] };
      const f = mockFetch(200, resp);
      const mail = createClient(f);

      const result = await mail.apiKeys.usage("key-1", 7);

      const url = f.mock.calls[0][0];
      expect(url).toContain("days=7");
      expect(result.usage).toHaveLength(1);
    });
  });
});

describe("Error handling", () => {
  it("throws OonruMailError on 4xx", async () => {
    const f = mockFetch(400, { error: "validation_error", message: "Invalid email" });
    const mail = createClient(f);

    await expect(mail.send({ from: "", to: [], subject: "" })).rejects.toThrow(OonruMailError);

    try {
      await mail.send({ from: "", to: [], subject: "" });
    } catch (e) {
      const err = e as OonruMailError;
      expect(err.status).toBe(400);
      expect(err.code).toBe("validation_error");
      expect(err.message).toBe("Invalid email");
      expect(err.retryable).toBe(false);
    }
  });

  it("throws OonruMailError on 401", async () => {
    const f = mockFetch(401, { error: "unauthorized", message: "Invalid API key" });
    const mail = createClient(f);

    try {
      await mail.send({ from: "a@b.com", to: ["c@d.com"], subject: "Hi" });
    } catch (e) {
      const err = e as OonruMailError;
      expect(err.status).toBe(401);
      expect(err.retryable).toBe(false);
    }
  });

  it("marks 429 as retryable", () => {
    const err = new OonruMailError(429, { error: "rate_limited", message: "Too many requests" });
    expect(err.retryable).toBe(true);
  });

  it("marks 500 as retryable", () => {
    const err = new OonruMailError(500, { error: "server_error", message: "Internal error" });
    expect(err.retryable).toBe(true);
  });

  it("retries on 5xx with exponential backoff", async () => {
    let calls = 0;
    const f = vi.fn().mockImplementation(() => {
      calls++;
      if (calls <= 2) {
        return Promise.resolve({
          ok: false,
          status: 500,
          headers: { get: () => "application/json" },
          json: () => Promise.resolve({ error: "server_error", message: "Oops" }),
          text: () => Promise.resolve("Oops"),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 202,
        headers: { get: () => "application/json" },
        json: () =>
          Promise.resolve({ message_id: "ok", status: "queued", accepted: [], rejected: [] }),
      });
    });

    const mail = new OonruMail({
      apiKey: "em_live_test",
      baseUrl: "https://api.test.com",
      maxRetries: 3,
      fetch: f as unknown as typeof fetch,
    });

    const result = await mail.send({ from: "a@b.com", to: ["c@d.com"], subject: "Hi" });

    expect(result.message_id).toBe("ok");
    expect(f).toHaveBeenCalledTimes(3); // 2 failures + 1 success
  });
});

describe("Static helpers", () => {
  it("parseWebhookPayload parses string body", () => {
    const body = JSON.stringify({
      event: "delivered",
      timestamp: "2026-02-14T12:00:00Z",
      message_id: "msg-1",
      recipient: "user@example.com",
    });

    const payload = OonruMail.parseWebhookPayload(body);

    expect(payload.event).toBe("delivered");
    expect(payload.message_id).toBe("msg-1");
  });

  it("parseWebhookPayload passes through objects", () => {
    const obj = { event: "bounced" as const, timestamp: "", message_id: "m", recipient: "r" };
    const payload = OonruMail.parseWebhookPayload(obj);
    expect(payload.event).toBe("bounced");
  });
});
