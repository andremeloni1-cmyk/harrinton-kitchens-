import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const appDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this app dir so Next doesn't infer it from a
  // stray parent lockfile (deploy hosts can have one at /root, etc.).
  turbopack: { root: appDir },
  // googleapis / prisma / pdf-lib are server-only; keep them out of the client bundle.
  serverExternalPackages: ["googleapis", "@prisma/client", "pdf-lib", "@anthropic-ai/sdk"],

  // Static security headers applied to every response. The Content-Security-
  // Policy is NOT here — it carries a per-request nonce and is set in the proxy
  // (src/proxy.ts) so scripts run under 'nonce-…' 'strict-dynamic' instead of
  // 'unsafe-inline' (P3-14).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
