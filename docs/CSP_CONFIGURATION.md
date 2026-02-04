# Content Security Policy (CSP) Configuration

This document describes how to configure Content Security Policy for the OONRUMAIL Platform.

## Overview

CSP is configured via environment variables and enforced by the Next.js middleware. The
configuration supports:

- **Environment-aware settings**: Different policies for development vs production
- **Nonce-based inline scripts**: Secure inline script execution
- **Violation reporting**: Log and monitor CSP violations
- **Multiple domain support**: Configure allowed domains per directive

## Environment Variables

### Core CSP Configuration

| Variable              | Description                                           | Default           |
| --------------------- | ----------------------------------------------------- | ----------------- |
| `CSP_CONNECT_DOMAINS` | Comma-separated list of allowed API/WebSocket domains | (none)            |
| `CSP_SCRIPT_DOMAINS`  | Comma-separated list of allowed script domains        | (none)            |
| `CSP_STYLE_DOMAINS`   | Comma-separated list of allowed stylesheet domains    | (none)            |
| `CSP_FONT_DOMAINS`    | Comma-separated list of allowed font domains          | (none)            |
| `CSP_IMG_DOMAINS`     | Comma-separated list of allowed image domains         | (none)            |
| `CSP_REPORT_URI`      | URL for CSP violation reports                         | `/api/csp-report` |
| `CSP_REPORT_ONLY`     | Set to `true` for report-only mode                    | `false`           |

### Auto-Configured Domains

These environment variables are automatically added to CSP directives:

| Variable      | Used In                            |
| ------------- | ---------------------------------- |
| `API_URL`     | `connect-src` (HTTP and WebSocket) |
| `WEB_APP_URL` | `connect-src`                      |

## Example Configuration

### Production

```env
# Primary API endpoint
API_URL=https://api.mycompany.com
WEB_APP_URL=https://mail.mycompany.com

# Additional allowed domains
CSP_CONNECT_DOMAINS=https://analytics.mycompany.com,wss://realtime.mycompany.com
CSP_SCRIPT_DOMAINS=https://cdn.mycompany.com
CSP_IMG_DOMAINS=https://images.mycompany.com,https://avatars.mycompany.com

# Enable violation reporting (uses internal endpoint)
CSP_REPORT_URI=/api/csp-report
CSP_REPORT_ONLY=false
```

### Staging (Report-Only Mode)

```env
API_URL=https://api.staging.mycompany.com
WEB_APP_URL=https://mail.staging.mycompany.com

# Report violations without blocking (useful for testing new policies)
CSP_REPORT_ONLY=true
CSP_REPORT_URI=/api/csp-report
```

### Development

In development (`NODE_ENV=development`), the middleware automatically:

- Allows `'unsafe-inline'` and `'unsafe-eval'` for hot reload
- Adds `localhost:*` and `127.0.0.1:*` to `connect-src`
- Uses the local CSP report endpoint

No additional configuration is typically needed for development.

## Using Nonces in Components

For inline scripts that need to execute, use the nonce system:

### Server Components

```tsx
import { headers } from "next/headers";

export default async function Page() {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce");

  return <script nonce={nonce}>{`console.log('This inline script is allowed');`}</script>;
}
```

### Client Components

```tsx
"use client";

import { useNonce, NonceScript } from "@/lib/csp-nonce";

export function MyComponent() {
  const { nonce } = useNonce();

  return <NonceScript>{`console.log('Inline script with nonce');`}</NonceScript>;
}
```

### Root Layout Setup

Add the nonce provider to your root layout:

```tsx
// app/layout.tsx
import { headers } from "next/headers";
import { NonceProvider } from "@/lib/csp-nonce";

export default async function RootLayout({ children }) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") || undefined;

  return (
    <html>
      <body>
        <NonceProvider nonce={nonce}>{children}</NonceProvider>
      </body>
    </html>
  );
}
```

## CSP Violation Reporting

### Internal Endpoint

CSP violations are reported to `/api/csp-report` by default. This endpoint:

1. Receives violation reports from browsers
2. Normalizes the report format
3. Filters out known false positives (browser extensions, etc.)
4. Logs violations for monitoring

### Monitoring Violations

Check your application logs for entries with:

```json
{
  "level": "warn",
  "type": "csp_violation",
  "documentUri": "https://mail.mycompany.com/inbox",
  "violatedDirective": "script-src",
  "blockedUri": "https://malicious-site.com/script.js"
}
```

### External Reporting Services

To send reports to an external service, set `CSP_REPORT_URI` to the external endpoint:

```env
CSP_REPORT_URI=https://sentry.io/api/12345/security/?sentry_key=xxx
```

## Testing CSP Configuration

### 1. Check Headers

Use browser DevTools Network tab to inspect the `Content-Security-Policy` header:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-abc123' https://cdn.jsdelivr.net; ...
```

### 2. Console Warnings

CSP violations appear in the browser console:

```
Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self' 'nonce-abc123'"
```

### 3. Report-Only Mode

Use `CSP_REPORT_ONLY=true` to test policies without breaking functionality:

```env
CSP_REPORT_ONLY=true
```

This logs violations without blocking content, useful for:

- Testing new policies before enforcement
- Discovering third-party resources in use
- Identifying necessary policy changes

## Common Issues

### Issue: API calls blocked

**Symptom**: Network requests fail with CSP error **Solution**: Add API domain to
`CSP_CONNECT_DOMAINS` or ensure `API_URL` is set correctly

### Issue: Fonts not loading

**Symptom**: Custom fonts fail to load **Solution**: Add font CDN to `CSP_FONT_DOMAINS`:

```env
CSP_FONT_DOMAINS=https://fonts.googleapis.com,https://fonts.gstatic.com
```

### Issue: Inline scripts blocked

**Symptom**: `<script>` tags don't execute **Solution**: Use nonce-based scripts (see "Using Nonces
in Components")

### Issue: Third-party widgets blocked

**Symptom**: Embedded content doesn't render **Solution**: Add widget domains to appropriate
directives and consider `frame-src` for iframes

## Security Best Practices

1. **Avoid `'unsafe-inline'`**: Use nonces instead
2. **Avoid `'unsafe-eval'`**: Refactor code that uses `eval()`
3. **Use specific domains**: Avoid wildcards like `https://*.example.com`
4. **Monitor violations**: Set up alerting for unusual violation patterns
5. **Test changes in staging**: Use report-only mode before enforcing
6. **Review regularly**: Audit CSP policy quarterly

## Reference

- [MDN CSP Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Content Security Policy Reference](https://content-security-policy.com/)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)
