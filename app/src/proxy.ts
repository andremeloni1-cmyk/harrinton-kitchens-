import { NextResponse, type NextRequest } from "next/server";

const MAX_AGE_MS = 60 * 60 * 24 * 30 * 1000; // 30 days
const INSECURE_SECRETS = new Set(["", "dev-insecure-secret", "change-me-to-a-long-random-string"]);

// The signing key, or null when it isn't secure (fail closed in production).
function secret(): string | null {
  const s = process.env.SESSION_SECRET || "";
  if (INSECURE_SECRETS.has(s)) {
    return process.env.NODE_ENV === "production" ? null : "dev-insecure-secret-local-only";
  }
  return s;
}

// Constant-time hex string comparison (Edge runtime has no timingSafeEqual).
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Edge-compatible HMAC verification of the session cookie, matching src/lib/session.ts.
async function validCookie(value: string | undefined): Promise<boolean> {
  const key = secret();
  if (!key || !value) return false;
  const idx = value.lastIndexOf(".");
  if (idx < 0) return false;
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (!timingSafeEqualHex(expected, sig)) return false;
  // Enforce the issued-at expiry (payload is `<userId>.<epoch>.<issuedAtMs>`).
  // This is a cheap signature/expiry gate only; the per-request server check in
  // getSessionUser() confirms the user is still active with a matching epoch.
  const ts = Number(payload.split(".")[2]);
  return Number.isFinite(ts) && Date.now() - ts <= MAX_AGE_MS;
}

// Paths reachable without a staff session: the auth pages/APIs (login + password
// reset + invite), the public enquiry + branding + lead-scan endpoints, the
// offline fallback page, and the client portal (client-facing, own token auth).
// The proxy still runs on these — to attach the CSP — but skips the auth
// redirect. The installer portal is deliberately NOT here: it exposes client
// data, so it needs a staff session like the rest of the app (P0-1).
const PUBLIC_PREFIXES = [
  "/login",
  "/reset",
  "/invite",
  "/enquire",
  "/offline",
  "/portal",
  "/api/auth/login",
  "/api/auth/reset",
  "/api/auth/invite",
  "/api/enquire",
  "/api/branding",
  "/api/leads/scan",
  "/api/portal",
];
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Next 16's "proxy" convention (formerly "middleware").
export async function proxy(req: NextRequest) {
  // Per-request nonce for a strict, nonce-based CSP (P3-14) — no 'unsafe-inline'
  // in script-src. Next reads the nonce from the CSP on the request headers and
  // stamps its own framework scripts with it; the app's single inline script
  // (the theme pre-paint) reads the x-nonce header in the root layout.
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "connect-src 'self' https://maps.googleapis.com https://places.googleapis.com",
    "form-action 'self'",
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const pass = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  // Public routes: attach the CSP, skip the auth gate.
  if (isPublicPath(req.nextUrl.pathname)) return pass();

  // Per-user auth is always on: require a validly-signed, unexpired session
  // cookie (deep validation happens server-side in getSessionUser()).
  const cookie = req.cookies.get("jf_session")?.value;
  if (await validCookie(cookie)) return pass();

  const res = NextResponse.redirect(new URL("/login", req.url));
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Run on every route so the nonce CSP is set everywhere a document renders,
  // excluding only purely-static assets (which execute no scripts and need no
  // CSP or auth gate).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|sw-version.js|manifest.webmanifest|icon.svg|icon-192.png|icon-512.png|icon-maskable-192.png|icon-maskable-512.png|apple-touch-icon.png).*)",
  ],
};
