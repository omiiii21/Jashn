import type { NextConfig } from "next";

const privacyHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex" },
  { key: "Cache-Control", value: "private, no-store" },
];

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Phone testing goes through cloudflared quick tunnels (architecture 6.6).
  allowedDevOrigins: ["*.trycloudflare.com"],
  // @sparticuz/chromium finds its bin/ archives through import.meta.url at run time,
  // which file tracing doesn't follow, so the export run route ships them explicitly.
  // Without this, Chromium can't launch on Vercel. Keys are route globs.
  outputFileTracingIncludes: {
    "/api/ops/export-jobs/*/run": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  async headers() {
    return [
      { source: "/i/:path*", headers: privacyHeaders },
      { source: "/api/i/:path*", headers: privacyHeaders },
      { source: "/render/:path*", headers: privacyHeaders },
    ];
  },
};

export default nextConfig;
