import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@email/ui", "@email/config", "@email/types", "@email/utils"],
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
