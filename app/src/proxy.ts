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

// Next 16's "proxy" convention (formerly "middleware").
export async function proxy(req: NextRequest) {
  // Per-user auth is always on: require a validly-signed, unexpired session
  // cookie (deep validation happens server-side in getSessionUser()).
  const cookie = req.cookies.get("jf_session")?.value;
  if (await validCookie(cookie)) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // Gate everything except the auth pages/APIs (login + password reset), static
  // assets, and the client portal (client-facing, own token auth). The installer
  // portal is NOT excluded — it exposes client names/addresses and the job
  // pipeline, so until each installer has their own token link it requires a
  // staff session like the rest of the app (P0-1).
  matcher: ["/((?!login|reset|invite|enquire|api/auth/login|api/auth/reset|api/auth/invite|api/enquire|api/branding|api/leads/scan|api/portal|portal|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg).*)"],
};
