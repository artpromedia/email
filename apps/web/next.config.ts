import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  transpilePackages: ["@email/ui", "@email/config", "@email/types", "@email/utils"],
  // Prevent Next.js from bundling ioredis into server/edge bundles
  serverExternalPackages: ["ioredis"],
  // Enable webpack to resolve .js imports to .ts files (for ESM compatibility)
  webpack: (config: {
    resolve: {
      extensionAlias?: Record<string, string[]>;
      fallback?: Record<string, boolean | string>;
    };
  }) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    // redis.ts imports node:module (Node.js built-in) which is unavailable
    // in client/edge bundles. Provide a false fallback so webpack skips it.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "node:module": false,
    };
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.githubusercontent.com",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
  headers() {
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ]);
  },
};

export default nextConfig;
