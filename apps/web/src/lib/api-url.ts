/**
 * Multi-tenant API URL resolver
 *
 * Dynamically resolves the API base URL based on the current hostname.
 * When the user is on mail.skillancer.com → API goes to api.skillancer.com
 * When the user is on mail.oonrumail.com → API goes to api.oonrumail.com
 *
 * This enables white-label domains where each organization gets their
 * own branded login and API endpoint.
 */

/** Default API URL used as fallback (baked at build time) */
const DEFAULT_API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "https://api.oonrumail.com";

/**
 * Derive the API base URL from the current browser hostname.
 *
 * mail.skillancer.com  → https://api.skillancer.com
 * mail.oonrumail.com   → https://api.oonrumail.com
 * app.oonrumail.com    → https://api.oonrumail.com
 * oonrumail.com        → https://api.oonrumail.com
 * localhost:3000       → (uses env var fallback)
 */
export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    // Server-side (SSR / API routes): use internal Docker URLs via env var
    return DEFAULT_API_URL;
  }

  const hostname = window.location.hostname;

  // Local development: use env var
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return DEFAULT_API_URL;
  }

  // mail.<domain> → api.<domain>
  if (hostname.startsWith("mail.")) {
    const orgDomain = hostname.slice(5); // Remove "mail."
    return `https://api.${orgDomain}`;
  }

  // app.<domain> → api.<domain>
  if (hostname.startsWith("app.")) {
    const orgDomain = hostname.slice(4); // Remove "app."
    return `https://api.${orgDomain}`;
  }

  // Bare domain (e.g. oonrumail.com) → api.<domain>
  if (!hostname.startsWith("api.") && !hostname.startsWith("admin.")) {
    return `https://api.${hostname}`;
  }

  return DEFAULT_API_URL;
}

/**
 * Get the auth API URL (with /auth prefix for the Caddy route).
 * Most auth endpoints are at api.<domain>/auth/...
 */
export function getAuthApiUrl(): string {
  return getApiBaseUrl();
}

/**
 * Get the current organization's domain from the hostname.
 * mail.skillancer.com → skillancer.com
 * mail.oonrumail.com  → oonrumail.com
 */
export function getOrgDomain(): string {
  if (typeof window === "undefined") {
    return "oonrumail.com";
  }

  const hostname = window.location.hostname;

  if (hostname.startsWith("mail.")) {
    return hostname.slice(5);
  }
  if (hostname.startsWith("app.")) {
    return hostname.slice(4);
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "oonrumail.com";
  }

  return hostname;
}

/**
 * Get the mail app URL for the current org domain.
 * Used for redirects and links.
 */
export function getMailAppUrl(): string {
  if (typeof window === "undefined") {
    return process.env["MAIL_APP_URL"] ?? "https://mail.oonrumail.com";
  }
  return `https://mail.${getOrgDomain()}`;
}
