/// <reference lib="webworker" />
/**
 * Service Worker for Enterprise Email PWA
 *
 * Features:
 * - Offline support with cache-first strategy for static assets
 * - Network-first strategy for API calls
 * - Background sync for offline email actions
 * - Push notifications support
 */

import { BackgroundSyncPlugin } from "workbox-background-sync";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute, Route } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

// Take control immediately
self.skipWaiting();
clientsClaim();

// Precache static assets from build
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ============================================================
// CACHE NAMES
// ============================================================

const CACHE_PREFIX = "enterprise-email";
const CACHE_VERSION = "v1";

const CACHES = {
  static: `${CACHE_PREFIX}-static-${CACHE_VERSION}`,
  images: `${CACHE_PREFIX}-images-${CACHE_VERSION}`,
  api: `${CACHE_PREFIX}-api-${CACHE_VERSION}`,
  runtime: `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`,
};

// ============================================================
// STATIC ASSETS - Cache First
// ============================================================

// Cache JavaScript and CSS with cache-first strategy
registerRoute(
  ({ request }) => request.destination === "script" || request.destination === "style",
  new CacheFirst({
    cacheName: CACHES.static,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// Cache fonts with cache-first (long expiration)
registerRoute(
  ({ request }) => request.destination === "font",
  new CacheFirst({
    cacheName: CACHES.static,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
      }),
    ],
  })
);

// ============================================================
// IMAGES - Stale While Revalidate
// ============================================================

registerRoute(
  ({ request }) => request.destination === "image",
  new StaleWhileRevalidate({
    cacheName: CACHES.images,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
    ],
  })
);

// ============================================================
// API CALLS - Network First with Fallback
// ============================================================

// Email list API - network first with short cache
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/emails"),
  new NetworkFirst({
    cacheName: CACHES.api,
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60, // 5 minutes
      }),
    ],
  })
);

// Folders/Labels API - network first, longer cache
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/folders") || url.pathname.startsWith("/api/labels"),
  new NetworkFirst({
    cacheName: CACHES.api,
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 30 * 60, // 30 minutes
      }),
    ],
  })
);

// User profile/settings - stale while revalidate
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/user") || url.pathname.startsWith("/api/settings"),
  new StaleWhileRevalidate({
    cacheName: CACHES.api,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60, // 1 hour
      }),
    ],
  })
);

// ============================================================
// BACKGROUND SYNC - Offline Actions
// ============================================================

// Queue for email actions when offline
const emailActionsQueue = new BackgroundSyncPlugin("email-actions", {
  maxRetentionTime: 24 * 60, // 24 hours (in minutes)
  onSync: async ({ queue }) => {
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request);
        console.log("[SW] Background sync successful:", entry.request.url);
      } catch (error) {
        console.error("[SW] Background sync failed:", error);
        await queue.unshiftRequest(entry);
        throw error;
      }
    }
  },
});

// Register routes that should be queued when offline
registerRoute(
  ({ url, request }) =>
    request.method === "POST" &&
    (url.pathname.includes("/api/emails/") || url.pathname.includes("/api/send")),
  new NetworkFirst({
    plugins: [emailActionsQueue],
  }),
  "POST"
);

registerRoute(
  ({ url, request }) =>
    (request.method === "PUT" || request.method === "PATCH") &&
    url.pathname.includes("/api/emails/"),
  new NetworkFirst({
    plugins: [emailActionsQueue],
  }),
  "PUT"
);

registerRoute(
  ({ url, request }) => request.method === "DELETE" && url.pathname.includes("/api/emails/"),
  new NetworkFirst({
    plugins: [emailActionsQueue],
  }),
  "DELETE"
);

// ============================================================
// NAVIGATION - App Shell
// ============================================================

// Handle navigation requests with the app shell
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: CACHES.runtime,
      networkTimeoutSeconds: 5,
      plugins: [
        new CacheableResponsePlugin({
          statuses: [0, 200],
        }),
      ],
    }),
    {
      // Don't cache auth pages
      denylist: [/\/api\//, /\/auth\//, /\/_next\//, /\/login/, /\/logout/],
    }
  )
);

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options: NotificationOptions = {
    body: data.body ?? "You have a new email",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    tag: data.tag ?? "email-notification",
    renotify: true,
    data: {
      url: data.url ?? "/",
      emailId: data.emailId,
    },
    actions: [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title ?? "New Email", options));
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const urlToOpen = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ============================================================
// OFFLINE FALLBACK
// ============================================================

// Serve offline page when navigation fails
const offlineFallback = new Route(
  ({ request }) => request.mode === "navigate",
  async () => {
    try {
      return await fetch("/offline.html");
    } catch {
      return new Response(
        `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Offline - Enterprise Email</title>
          <style>
            body {
              font-family: system-ui, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .offline-container {
              text-align: center;
              padding: 2rem;
            }
            h1 { color: #333; margin-bottom: 1rem; }
            p { color: #666; margin-bottom: 2rem; }
            button {
              background: #3b82f6;
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 0.5rem;
              cursor: pointer;
              font-size: 1rem;
            }
            button:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="offline-container">
            <h1>You're offline</h1>
            <p>Check your internet connection and try again.</p>
            <button onclick="window.location.reload()">Retry</button>
          </div>
        </body>
        </html>`,
        {
          headers: { "Content-Type": "text/html" },
        }
      );
    }
  }
);

registerRoute(offlineFallback);

// ============================================================
// MESSAGE HANDLING
// ============================================================

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith(CACHE_PREFIX))
            .map((name) => caches.delete(name))
        );
      })
    );
  }

  if (event.data?.type === "GET_CACHE_STATUS") {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        const status = {
          caches: cacheNames.filter((name) => name.startsWith(CACHE_PREFIX)),
          version: CACHE_VERSION,
        };
        event.ports[0]?.postMessage(status);
      })
    );
  }
});

console.log("[SW] Service Worker initialized");
