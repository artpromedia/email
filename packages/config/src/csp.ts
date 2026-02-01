/**
 * Content Security Policy (CSP) Configuration
 *
 * Environment-aware CSP configuration with nonce support and violation reporting.
 * This module provides a flexible way to configure CSP directives based on
 * environment variables with sensible defaults.
 */

import { z } from "zod";

/**
 * CSP Directive names
 */
export type CSPDirective =
  | "default-src"
  | "script-src"
  | "style-src"
  | "font-src"
  | "img-src"
  | "connect-src"
  | "frame-src"
  | "frame-ancestors"
  | "base-uri"
  | "form-action"
  | "object-src"
  | "media-src"
  | "worker-src"
  | "manifest-src"
  | "report-uri"
  | "report-to";

/**
 * CSP configuration schema for validation
 */
const cspDomainListSchema = z
  .string()
  .transform((val) =>
    val
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean)
  )
  .default("");

export const cspEnvSchema = z.object({
  // Core domains
  CSP_DEFAULT_DOMAINS: cspDomainListSchema,
  CSP_SCRIPT_DOMAINS: cspDomainListSchema,
  CSP_STYLE_DOMAINS: cspDomainListSchema,
  CSP_FONT_DOMAINS: cspDomainListSchema,
  CSP_IMG_DOMAINS: cspDomainListSchema,
  CSP_CONNECT_DOMAINS: cspDomainListSchema,
  CSP_FRAME_DOMAINS: cspDomainListSchema,
  CSP_MEDIA_DOMAINS: cspDomainListSchema,
  CSP_WORKER_DOMAINS: cspDomainListSchema,

  // API and WebSocket URLs
  API_URL: z.string().url().optional(),
  WS_URL: z.string().optional(),
  WEB_APP_URL: z.string().url().optional(),

  // CSP reporting
  CSP_REPORT_URI: z.string().optional(),
  CSP_REPORT_ONLY: z
    .string()
    .transform((val) => val === "true")
    .default("false"),

  // Environment
  NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),

  // Feature flags
  CSP_ENABLE_NONCE: z
    .string()
    .transform((val) => val === "true")
    .default("true"),
  CSP_UNSAFE_INLINE_SCRIPTS: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
  CSP_UNSAFE_EVAL: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
});

export type CSPEnvConfig = z.infer<typeof cspEnvSchema>;

/**
 * Parsed and validated CSP configuration
 */
export interface CSPConfig {
  directives: Map<CSPDirective, string[]>;
  reportUri: string | undefined;
  reportOnly: boolean;
  nonceEnabled: boolean;
  isDevelopment: boolean;
}

/**
 * Validation result for CSP configuration
 */
export interface CSPValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Generate a cryptographically secure nonce for CSP
 */
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCodePoint(...array));
}

/**
 * Parse CSP environment variables and return validated configuration
 */
export function parseCSPEnv(env: Record<string, string | undefined>): CSPEnvConfig {
  // Filter to only CSP-related env vars
  const cspEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (
      key.startsWith("CSP_") ||
      key === "API_URL" ||
      key === "WS_URL" ||
      key === "WEB_APP_URL" ||
      key === "NODE_ENV"
    ) {
      cspEnv[key] = value;
    }
  }

  return cspEnvSchema.parse(cspEnv);
}

/**
 * Build CSP configuration from environment variables
 */
export function buildCSPConfig(envConfig: CSPEnvConfig): CSPConfig {
  const isDevelopment = envConfig.NODE_ENV === "development" || envConfig.NODE_ENV === "test";
  const directives = new Map<CSPDirective, string[]>();

  // Default sources
  const defaultSources = ["'self'"];
  if (envConfig.CSP_DEFAULT_DOMAINS.length > 0) {
    defaultSources.push(...envConfig.CSP_DEFAULT_DOMAINS);
  }
  directives.set("default-src", defaultSources);

  // Script sources
  const scriptSources = ["'self'"];
  if (envConfig.CSP_SCRIPT_DOMAINS.length > 0) {
    scriptSources.push(...envConfig.CSP_SCRIPT_DOMAINS);
  }
  // Add CDN for common libraries
  scriptSources.push("https://cdn.jsdelivr.net");
  if (envConfig.CSP_UNSAFE_INLINE_SCRIPTS || isDevelopment) {
    scriptSources.push("'unsafe-inline'");
  }
  if (envConfig.CSP_UNSAFE_EVAL || isDevelopment) {
    scriptSources.push("'unsafe-eval'");
  }
  directives.set("script-src", scriptSources);

  // Style sources
  const styleSources = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"];
  if (envConfig.CSP_STYLE_DOMAINS.length > 0) {
    styleSources.push(...envConfig.CSP_STYLE_DOMAINS);
  }
  directives.set("style-src", styleSources);

  // Font sources
  const fontSources = ["'self'", "https://fonts.gstatic.com", "data:"];
  if (envConfig.CSP_FONT_DOMAINS.length > 0) {
    fontSources.push(...envConfig.CSP_FONT_DOMAINS);
  }
  directives.set("font-src", fontSources);

  // Image sources
  const imgSources = ["'self'", "data:", "blob:", "https:"];
  if (envConfig.CSP_IMG_DOMAINS.length > 0) {
    imgSources.push(...envConfig.CSP_IMG_DOMAINS);
  }
  directives.set("img-src", imgSources);

  // Connect sources (API, WebSockets)
  const connectSources = ["'self'"];
  if (envConfig.API_URL) {
    try {
      const apiUrl = new URL(envConfig.API_URL);
      connectSources.push(apiUrl.origin);
      // Add WebSocket equivalent
      const wsProtocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
      connectSources.push(`${wsProtocol}//${apiUrl.host}`);
    } catch {
      // Invalid URL, skip
    }
  }
  if (envConfig.WS_URL) {
    connectSources.push(envConfig.WS_URL);
  }
  if (envConfig.CSP_CONNECT_DOMAINS.length > 0) {
    connectSources.push(...envConfig.CSP_CONNECT_DOMAINS);
  }
  // Development: allow localhost variations
  if (isDevelopment) {
    connectSources.push(
      "http://localhost:*",
      "ws://localhost:*",
      "http://127.0.0.1:*",
      "ws://127.0.0.1:*"
    );
  }
  directives.set("connect-src", connectSources);

  // Frame sources
  const frameSources = ["'none'"];
  if (envConfig.CSP_FRAME_DOMAINS.length > 0) {
    frameSources.length = 0;
    frameSources.push("'self'", ...envConfig.CSP_FRAME_DOMAINS);
  }
  directives.set("frame-src", frameSources);

  // Frame ancestors (clickjacking protection)
  directives.set("frame-ancestors", ["'none'"]);

  // Base URI and form action
  directives.set("base-uri", ["'self'"]);
  directives.set("form-action", ["'self'"]);

  // Object sources (plugins)
  directives.set("object-src", ["'none'"]);

  // Media sources
  const mediaSources = ["'self'"];
  if (envConfig.CSP_MEDIA_DOMAINS.length > 0) {
    mediaSources.push(...envConfig.CSP_MEDIA_DOMAINS);
  }
  directives.set("media-src", mediaSources);

  // Worker sources
  const workerSources = ["'self'", "blob:"];
  if (envConfig.CSP_WORKER_DOMAINS.length > 0) {
    workerSources.push(...envConfig.CSP_WORKER_DOMAINS);
  }
  directives.set("worker-src", workerSources);

  // Manifest
  directives.set("manifest-src", ["'self'"]);

  // Report URI
  if (envConfig.CSP_REPORT_URI) {
    directives.set("report-uri", [envConfig.CSP_REPORT_URI]);
  }

  return {
    directives,
    reportUri: envConfig.CSP_REPORT_URI,
    reportOnly: envConfig.CSP_REPORT_ONLY,
    nonceEnabled: envConfig.CSP_ENABLE_NONCE,
    isDevelopment,
  };
}

/**
 * Generate CSP header value from configuration
 */
export function generateCSPHeader(config: CSPConfig, nonce?: string): string {
  const parts: string[] = [];

  for (const [directive, sources] of config.directives) {
    let sourceList = [...sources];

    // Add nonce to script-src and style-src if enabled
    if (nonce && config.nonceEnabled) {
      if (directive === "script-src" || directive === "style-src") {
        // Remove unsafe-inline if using nonce (nonce takes precedence)
        if (!config.isDevelopment) {
          sourceList = sourceList.filter((s) => s !== "'unsafe-inline'");
        }
        sourceList.push(`'nonce-${nonce}'`);
      }
    }

    // Deduplicate sources
    const uniqueSources = [...new Set(sourceList)];
    parts.push(`${directive} ${uniqueSources.join(" ")}`);
  }

  return parts.join("; ");
}

/**
 * Get the CSP header name based on configuration
 */
export function getCSPHeaderName(config: CSPConfig): string {
  return config.reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

/**
 * Validate CSP configuration
 */
export function validateCSPConfig(config: CSPConfig): CSPValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for required directives
  if (!config.directives.has("default-src")) {
    errors.push("Missing required directive: default-src");
  }

  // Check for insecure configurations
  const scriptSrc = config.directives.get("script-src") ?? [];
  if (scriptSrc.includes("'unsafe-inline'") && !config.isDevelopment) {
    warnings.push("script-src contains 'unsafe-inline' which reduces XSS protection");
  }
  if (scriptSrc.includes("'unsafe-eval'") && !config.isDevelopment) {
    warnings.push("script-src contains 'unsafe-eval' which may allow code injection");
  }

  // Check for overly permissive wildcards
  const connectSrc = config.directives.get("connect-src") ?? [];
  if (connectSrc.includes("*") && !config.isDevelopment) {
    errors.push("connect-src contains wildcard '*' which allows connections to any domain");
  }

  // Check for missing frame-ancestors
  if (!config.directives.has("frame-ancestors")) {
    warnings.push("Missing frame-ancestors directive for clickjacking protection");
  }

  // Verify report-uri is configured for production
  if (!config.isDevelopment && !config.reportUri) {
    warnings.push("CSP report-uri not configured; violations won't be logged");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Default CSP configuration for quick setup
 */
export function getDefaultCSPConfig(): CSPConfig {
  const envConfig = parseCSPEnv(process.env as Record<string, string | undefined>);
  return buildCSPConfig(envConfig);
}

/**
 * Development-friendly CSP that allows hot reload and debugging
 */
export function getDevelopmentCSPConfig(): CSPConfig {
  const config = getDefaultCSPConfig();

  // Ensure development-friendly settings
  const scriptSrc = config.directives.get("script-src") ?? ["'self'"];
  if (!scriptSrc.includes("'unsafe-inline'")) {
    scriptSrc.push("'unsafe-inline'");
  }
  if (!scriptSrc.includes("'unsafe-eval'")) {
    scriptSrc.push("'unsafe-eval'");
  }
  config.directives.set("script-src", scriptSrc);

  // Allow localhost connections
  const connectSrc = config.directives.get("connect-src") ?? ["'self'"];
  connectSrc.push(
    "http://localhost:*",
    "ws://localhost:*",
    "http://127.0.0.1:*",
    "ws://127.0.0.1:*"
  );
  config.directives.set("connect-src", connectSrc);

  return config;
}
