/**
 * CSP Configuration Tests
 * Tests for Content Security Policy utilities
 */

import { describe, it, expect } from "vitest";
import {
  parseCSPEnv,
  buildCSPConfig,
  generateCSPHeader,
  getCSPHeaderName,
  validateCSPConfig,
  generateNonce,
  getDevelopmentCSPConfig,
  cspEnvSchema,
  type CSPConfig,
  type CSPDirective,
} from "./csp.js";

describe("generateNonce", () => {
  it("should generate a non-empty string", () => {
    const nonce = generateNonce();
    expect(nonce).toBeTruthy();
    expect(typeof nonce).toBe("string");
  });

  it("should generate unique values", () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    expect(nonce1).not.toBe(nonce2);
  });

  it("should generate base64-encoded string", () => {
    const nonce = generateNonce();
    // Base64 characters only
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

describe("cspEnvSchema", () => {
  it("should parse empty env with defaults", () => {
    const result = cspEnvSchema.parse({});
    expect(result.NODE_ENV).toBe("development");
    expect(result.CSP_REPORT_ONLY).toBe(false);
    expect(result.CSP_ENABLE_NONCE).toBe(true);
    expect(result.CSP_UNSAFE_INLINE_SCRIPTS).toBe(false);
    expect(result.CSP_UNSAFE_EVAL).toBe(false);
    expect(result.CSP_DEFAULT_DOMAINS).toEqual([]);
  });

  it("should parse domain lists from comma-separated strings", () => {
    const result = cspEnvSchema.parse({
      CSP_DEFAULT_DOMAINS: "cdn.example.com, api.example.com",
    });
    expect(result.CSP_DEFAULT_DOMAINS).toEqual(["cdn.example.com", "api.example.com"]);
  });

  it("should transform boolean strings", () => {
    const result = cspEnvSchema.parse({
      CSP_REPORT_ONLY: "true",
      CSP_ENABLE_NONCE: "false",
      CSP_UNSAFE_INLINE_SCRIPTS: "true",
      CSP_UNSAFE_EVAL: "true",
    });
    expect(result.CSP_REPORT_ONLY).toBe(true);
    expect(result.CSP_ENABLE_NONCE).toBe(false);
    expect(result.CSP_UNSAFE_INLINE_SCRIPTS).toBe(true);
    expect(result.CSP_UNSAFE_EVAL).toBe(true);
  });

  it("should accept valid API_URL", () => {
    const result = cspEnvSchema.parse({
      API_URL: "https://api.example.com",
    });
    expect(result.API_URL).toBe("https://api.example.com");
  });

  it("should reject invalid API_URL", () => {
    expect(() =>
      cspEnvSchema.parse({
        API_URL: "not-a-url",
      })
    ).toThrow();
  });
});

describe("parseCSPEnv", () => {
  it("should filter and parse CSP-related env vars", () => {
    const env = {
      CSP_DEFAULT_DOMAINS: "cdn.example.com",
      CSP_REPORT_ONLY: "true",
      NODE_ENV: "production",
      API_URL: "https://api.example.com",
      WS_URL: "wss://ws.example.com",
      WEB_APP_URL: "https://app.example.com",
      UNRELATED_VAR: "should-be-ignored",
    };

    const result = parseCSPEnv(env);
    expect(result.CSP_DEFAULT_DOMAINS).toEqual(["cdn.example.com"]);
    expect(result.CSP_REPORT_ONLY).toBe(true);
    expect(result.NODE_ENV).toBe("production");
    expect(result.API_URL).toBe("https://api.example.com");
    expect(result.WS_URL).toBe("wss://ws.example.com");
  });

  it("should handle empty env", () => {
    const result = parseCSPEnv({});
    expect(result.NODE_ENV).toBe("development");
    expect(result.CSP_DEFAULT_DOMAINS).toEqual([]);
  });
});

describe("buildCSPConfig", () => {
  it("should build config with default-src", () => {
    const envConfig = cspEnvSchema.parse({});
    const config = buildCSPConfig(envConfig);

    expect(config.directives.get("default-src")).toContain("'self'");
  });

  it("should mark development environment", () => {
    const envConfig = cspEnvSchema.parse({ NODE_ENV: "development" });
    const config = buildCSPConfig(envConfig);
    expect(config.isDevelopment).toBe(true);
  });

  it("should mark test as development", () => {
    const envConfig = cspEnvSchema.parse({ NODE_ENV: "test" });
    const config = buildCSPConfig(envConfig);
    expect(config.isDevelopment).toBe(true);
  });

  it("should not mark production as development", () => {
    const envConfig = cspEnvSchema.parse({ NODE_ENV: "production" });
    const config = buildCSPConfig(envConfig);
    expect(config.isDevelopment).toBe(false);
  });

  it("should add custom domains to default-src", () => {
    const envConfig = cspEnvSchema.parse({
      CSP_DEFAULT_DOMAINS: "cdn.example.com",
    });
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("default-src")).toContain("cdn.example.com");
  });

  it("should add CDN to script-src", () => {
    const envConfig = cspEnvSchema.parse({});
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("script-src")).toContain("https://cdn.jsdelivr.net");
  });

  it("should add unsafe-inline to script-src in development", () => {
    const envConfig = cspEnvSchema.parse({ NODE_ENV: "development" });
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("script-src")).toContain("'unsafe-inline'");
  });

  it("should add unsafe-eval to script-src in development", () => {
    const envConfig = cspEnvSchema.parse({ NODE_ENV: "development" });
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("script-src")).toContain("'unsafe-eval'");
  });

  it("should not add unsafe-inline to script-src in production unless configured", () => {
    const envConfig = cspEnvSchema.parse({
      NODE_ENV: "production",
      CSP_UNSAFE_INLINE_SCRIPTS: "false",
    });
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("script-src")).not.toContain("'unsafe-inline'");
  });

  it("should add unsafe-inline to script-src in production when configured", () => {
    const envConfig = cspEnvSchema.parse({
      NODE_ENV: "production",
      CSP_UNSAFE_INLINE_SCRIPTS: "true",
    });
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("script-src")).toContain("'unsafe-inline'");
  });

  it("should include Google Fonts in style-src", () => {
    const envConfig = cspEnvSchema.parse({});
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("style-src")).toContain("https://fonts.googleapis.com");
  });

  it("should include Google Fonts in font-src", () => {
    const envConfig = cspEnvSchema.parse({});
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("font-src")).toContain("https://fonts.gstatic.com");
  });

  it("should allow data: and blob: in img-src", () => {
    const envConfig = cspEnvSchema.parse({});
    const config = buildCSPConfig(envConfig);
    const imgSrc = config.directives.get("img-src");
    expect(imgSrc).toContain("data:");
    expect(imgSrc).toContain("blob:");
  });

  it("should add API URL to connect-src", () => {
    const envConfig = cspEnvSchema.parse({
      API_URL: "https://api.example.com",
    });
    const config = buildCSPConfig(envConfig);
    const connectSrc = config.directives.get("connect-src")!;
    expect(connectSrc).toContain("https://api.example.com");
    expect(connectSrc).toContain("wss://api.example.com");
  });

  it("should add WS_URL to connect-src", () => {
    const envConfig = cspEnvSchema.parse({
      WS_URL: "wss://ws.example.com",
    });
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("connect-src")).toContain("wss://ws.example.com");
  });

  it("should add localhost to connect-src in development", () => {
    const envConfig = cspEnvSchema.parse({ NODE_ENV: "development" });
    const config = buildCSPConfig(envConfig);
    const connectSrc = config.directives.get("connect-src")!;
    expect(connectSrc).toContain("http://localhost:*");
    expect(connectSrc).toContain("ws://localhost:*");
  });

  it("should set frame-src to none by default", () => {
    const envConfig = cspEnvSchema.parse({});
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("frame-src")).toContain("'none'");
  });

  it("should override frame-src none when custom domains are provided", () => {
    const envConfig = cspEnvSchema.parse({
      CSP_FRAME_DOMAINS: "embed.example.com",
    });
    const config = buildCSPConfig(envConfig);
    const frameSrc = config.directives.get("frame-src")!;
    expect(frameSrc).not.toContain("'none'");
    expect(frameSrc).toContain("'self'");
    expect(frameSrc).toContain("embed.example.com");
  });

  it("should set frame-ancestors to none", () => {
    const envConfig = cspEnvSchema.parse({});
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("should set object-src to none", () => {
    const envConfig = cspEnvSchema.parse({});
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("object-src")).toEqual(["'none'"]);
  });

  it("should set worker-src with blob:", () => {
    const envConfig = cspEnvSchema.parse({});
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("worker-src")).toContain("blob:");
  });

  it("should set manifest-src to self", () => {
    const envConfig = cspEnvSchema.parse({});
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("manifest-src")).toEqual(["'self'"]);
  });

  it("should add report-uri when configured", () => {
    const envConfig = cspEnvSchema.parse({
      CSP_REPORT_URI: "https://report.example.com/csp",
    });
    const config = buildCSPConfig(envConfig);
    expect(config.reportUri).toBe("https://report.example.com/csp");
    expect(config.directives.get("report-uri")).toEqual(["https://report.example.com/csp"]);
  });

  it("should set reportOnly from env", () => {
    const envConfig = cspEnvSchema.parse({ CSP_REPORT_ONLY: "true" });
    const config = buildCSPConfig(envConfig);
    expect(config.reportOnly).toBe(true);
  });

  it("should handle invalid API_URL gracefully", () => {
    // Build with a manually-crafted config that has an invalid URL format
    const envConfig = cspEnvSchema.parse({});
    // Manually set API_URL to something that passes schema but is edge-case
    envConfig.API_URL = "https://api.example.com:8080/path";
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("connect-src")).toContain("https://api.example.com:8080");
  });

  it("should add custom media domains", () => {
    const envConfig = cspEnvSchema.parse({
      CSP_MEDIA_DOMAINS: "media.example.com",
    });
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("media-src")).toContain("media.example.com");
  });

  it("should add custom worker domains", () => {
    const envConfig = cspEnvSchema.parse({
      CSP_WORKER_DOMAINS: "worker.example.com",
    });
    const config = buildCSPConfig(envConfig);
    expect(config.directives.get("worker-src")).toContain("worker.example.com");
  });
});

describe("generateCSPHeader", () => {
  it("should generate valid CSP header string", () => {
    const envConfig = cspEnvSchema.parse({ NODE_ENV: "production" });
    const config = buildCSPConfig(envConfig);
    const header = generateCSPHeader(config);

    expect(header).toContain("default-src 'self'");
    expect(header).toContain("frame-ancestors 'none'");
    expect(header).toContain("object-src 'none'");
  });

  it("should separate directives with semicolons", () => {
    const envConfig = cspEnvSchema.parse({ NODE_ENV: "production" });
    const config = buildCSPConfig(envConfig);
    const header = generateCSPHeader(config);

    expect(header).toContain("; ");
  });

  it("should add nonce to script-src when provided", () => {
    const envConfig = cspEnvSchema.parse({
      NODE_ENV: "production",
      CSP_ENABLE_NONCE: "true",
    });
    const config = buildCSPConfig(envConfig);
    const nonce = "test-nonce-123";
    const header = generateCSPHeader(config, nonce);

    expect(header).toContain(`'nonce-${nonce}'`);
  });

  it("should add nonce to style-src when provided", () => {
    const envConfig = cspEnvSchema.parse({
      NODE_ENV: "production",
      CSP_ENABLE_NONCE: "true",
    });
    const config = buildCSPConfig(envConfig);
    const nonce = "test-nonce-456";
    const header = generateCSPHeader(config, nonce);

    // style-src should contain the nonce
    const stylePart = header.split("; ").find((p) => p.startsWith("style-src"));
    expect(stylePart).toContain(`'nonce-${nonce}'`);
  });

  it("should remove unsafe-inline from script-src in production when nonce is used", () => {
    const envConfig = cspEnvSchema.parse({
      NODE_ENV: "production",
      CSP_ENABLE_NONCE: "true",
      CSP_UNSAFE_INLINE_SCRIPTS: "true",
    });
    const config = buildCSPConfig(envConfig);
    const nonce = "test-nonce";
    const header = generateCSPHeader(config, nonce);

    const scriptPart = header.split("; ").find((p) => p.startsWith("script-src"));
    expect(scriptPart).toContain(`'nonce-${nonce}'`);
    expect(scriptPart).not.toContain("'unsafe-inline'");
  });

  it("should keep unsafe-inline in development even with nonce", () => {
    const envConfig = cspEnvSchema.parse({
      NODE_ENV: "development",
      CSP_ENABLE_NONCE: "true",
    });
    const config = buildCSPConfig(envConfig);
    const nonce = "dev-nonce";
    const header = generateCSPHeader(config, nonce);

    const scriptPart = header.split("; ").find((p) => p.startsWith("script-src"));
    expect(scriptPart).toContain("'unsafe-inline'");
    expect(scriptPart).toContain(`'nonce-${nonce}'`);
  });

  it("should not add nonce when nonce is disabled", () => {
    const envConfig = cspEnvSchema.parse({
      NODE_ENV: "production",
      CSP_ENABLE_NONCE: "false",
    });
    const config = buildCSPConfig(envConfig);
    const header = generateCSPHeader(config, "should-not-appear");

    expect(header).not.toContain("nonce-");
  });

  it("should deduplicate sources", () => {
    const envConfig = cspEnvSchema.parse({
      CSP_SCRIPT_DOMAINS: "'self'",
    });
    const config = buildCSPConfig(envConfig);
    const header = generateCSPHeader(config);

    const scriptPart = header.split("; ").find((p) => p.startsWith("script-src"));
    // 'self' should appear only once even though it's in defaults AND custom
    const selfCount = (scriptPart?.match(/'self'/g) ?? []).length;
    expect(selfCount).toBe(1);
  });
});

describe("getCSPHeaderName", () => {
  it("should return Content-Security-Policy when not report-only", () => {
    const config: CSPConfig = {
      directives: new Map(),
      reportUri: undefined,
      reportOnly: false,
      nonceEnabled: true,
      isDevelopment: false,
    };
    expect(getCSPHeaderName(config)).toBe("Content-Security-Policy");
  });

  it("should return Content-Security-Policy-Report-Only when report-only", () => {
    const config: CSPConfig = {
      directives: new Map(),
      reportUri: undefined,
      reportOnly: true,
      nonceEnabled: true,
      isDevelopment: false,
    };
    expect(getCSPHeaderName(config)).toBe("Content-Security-Policy-Report-Only");
  });
});

describe("validateCSPConfig", () => {
  it("should validate valid production config", () => {
    const envConfig = cspEnvSchema.parse({
      NODE_ENV: "production",
      CSP_REPORT_URI: "https://report.example.com/csp",
    });
    const config = buildCSPConfig(envConfig);
    const result = validateCSPConfig(config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should error on missing default-src", () => {
    const config: CSPConfig = {
      directives: new Map(),
      reportUri: undefined,
      reportOnly: false,
      nonceEnabled: true,
      isDevelopment: false,
    };
    const result = validateCSPConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing required directive: default-src");
  });

  it("should warn about unsafe-inline in production script-src", () => {
    const config: CSPConfig = {
      directives: new Map<CSPDirective, string[]>([
        ["default-src", ["'self'"]],
        ["script-src", ["'self'", "'unsafe-inline'"]],
      ]),
      reportUri: undefined,
      reportOnly: false,
      nonceEnabled: true,
      isDevelopment: false,
    };
    const result = validateCSPConfig(config);

    expect(result.warnings).toContain(
      "script-src contains 'unsafe-inline' which reduces XSS protection"
    );
  });

  it("should warn about unsafe-eval in production script-src", () => {
    const config: CSPConfig = {
      directives: new Map<CSPDirective, string[]>([
        ["default-src", ["'self'"]],
        ["script-src", ["'self'", "'unsafe-eval'"]],
      ]),
      reportUri: undefined,
      reportOnly: false,
      nonceEnabled: true,
      isDevelopment: false,
    };
    const result = validateCSPConfig(config);

    expect(result.warnings).toContain(
      "script-src contains 'unsafe-eval' which may allow code injection"
    );
  });

  it("should not warn about unsafe-inline in development", () => {
    const config: CSPConfig = {
      directives: new Map<CSPDirective, string[]>([
        ["default-src", ["'self'"]],
        ["script-src", ["'self'", "'unsafe-inline'"]],
      ]),
      reportUri: undefined,
      reportOnly: false,
      nonceEnabled: true,
      isDevelopment: true,
    };
    const result = validateCSPConfig(config);

    expect(result.warnings).not.toContain(
      "script-src contains 'unsafe-inline' which reduces XSS protection"
    );
  });

  it("should error on wildcard in connect-src for production", () => {
    const config: CSPConfig = {
      directives: new Map<CSPDirective, string[]>([
        ["default-src", ["'self'"]],
        ["connect-src", ["*"]],
      ]),
      reportUri: undefined,
      reportOnly: false,
      nonceEnabled: true,
      isDevelopment: false,
    };
    const result = validateCSPConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "connect-src contains wildcard '*' which allows connections to any domain"
    );
  });

  it("should not error on wildcard in connect-src for development", () => {
    const config: CSPConfig = {
      directives: new Map<CSPDirective, string[]>([
        ["default-src", ["'self'"]],
        ["connect-src", ["*"]],
      ]),
      reportUri: undefined,
      reportOnly: false,
      nonceEnabled: true,
      isDevelopment: true,
    };
    const result = validateCSPConfig(config);

    expect(result.valid).toBe(true);
  });

  it("should warn on missing frame-ancestors", () => {
    const config: CSPConfig = {
      directives: new Map<CSPDirective, string[]>([["default-src", ["'self'"]]]),
      reportUri: undefined,
      reportOnly: false,
      nonceEnabled: true,
      isDevelopment: false,
    };
    const result = validateCSPConfig(config);

    expect(result.warnings).toContain(
      "Missing frame-ancestors directive for clickjacking protection"
    );
  });

  it("should warn on missing report-uri in production", () => {
    const envConfig = cspEnvSchema.parse({ NODE_ENV: "production" });
    const config = buildCSPConfig(envConfig);
    const result = validateCSPConfig(config);

    expect(result.warnings).toContain("CSP report-uri not configured; violations won't be logged");
  });

  it("should not warn on missing report-uri in development", () => {
    const envConfig = cspEnvSchema.parse({ NODE_ENV: "development" });
    const config = buildCSPConfig(envConfig);
    const result = validateCSPConfig(config);

    expect(result.warnings).not.toContain(
      "CSP report-uri not configured; violations won't be logged"
    );
  });
});

describe("getDevelopmentCSPConfig", () => {
  it("should include unsafe-inline in script-src", () => {
    const config = getDevelopmentCSPConfig();
    expect(config.directives.get("script-src")).toContain("'unsafe-inline'");
  });

  it("should include unsafe-eval in script-src", () => {
    const config = getDevelopmentCSPConfig();
    expect(config.directives.get("script-src")).toContain("'unsafe-eval'");
  });

  it("should include localhost in connect-src", () => {
    const config = getDevelopmentCSPConfig();
    const connectSrc = config.directives.get("connect-src")!;
    expect(connectSrc).toContain("http://localhost:*");
    expect(connectSrc).toContain("ws://localhost:*");
  });
});
