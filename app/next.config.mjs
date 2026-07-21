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

  // Security headers applied to every response.
  async headers() {
    // Allow the app's own inline styles/scripts + Google Fonts + Google Maps
    // (address autocomplete). Keeps everything else same-origin.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://maps.googleapis.com https://places.googleapis.com",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
