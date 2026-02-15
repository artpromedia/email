/**
 * Multi-tenant API URL resolver
 *
 * All tenants (including white-label orgs like Skillancer) use the
 * central OonruMail API at api.oonrumail.com.  White-label domains
 * (e.g. mail.skillancer.com) are purely cosmetic — the API backend
 * is always OonruMail.
 */

/** API URL — always the central OonruMail API */
const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "https://api.oonrumail.com";

/**
 * Return the API base URL.
 *
 * Every tenant — mail.skillancer.com, mail.oonrumail.com, localhost —
 * talks to the same central API (api.oonrumail.com).
 */
export function getApiBaseUrl(): string {
  return API_URL;
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
