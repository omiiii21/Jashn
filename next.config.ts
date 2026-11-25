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
  async headers() {
    return [
      { source: "/i/:path*", headers: privacyHeaders },
      { source: "/api/i/:path*", headers: privacyHeaders },
      { source: "/render/:path*", headers: privacyHeaders },
    ];
  },
};

export default nextConfig;
