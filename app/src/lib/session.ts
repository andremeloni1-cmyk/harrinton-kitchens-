import { cookies } from "next/headers";
import crypto from "node:crypto";

const COOKIE = "jf_session";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

// Loud boot-time warning if the app is internet-facing with no login gate.
if (process.env.NODE_ENV === "production" && !process.env.APP_PASSWORD) {
  console.error(
    "SECURITY WARNING: APP_PASSWORD is not set — the dashboard is UNAUTHENTICATED and readable/writable by anyone who can reach the URL. Set APP_PASSWORD in .env and restart."
  );
}

// Values that must never be used as a signing key — a placeholder or the old
// dev default would make session cookies forgeable with a publicly-known key.
const INSECURE_SECRETS = new Set(["", "dev-insecure-secret", "change-me-to-a-long-random-string"]);

// Returns the signing secret, or null when it isn't set to a secure value. In
// production we fail CLOSED (null → no valid sessions) rather than fall back to
// a known key; in dev we allow a fixed key so local work isn't blocked.
function secret(): string | null {
  const s = process.env.SESSION_SECRET || "";
  if (INSECURE_SECRETS.has(s)) {
    if (process.env.NODE_ENV === "production") {
      console.error("SECURITY: SESSION_SECRET is unset or a placeholder — refusing to issue/accept sessions. Set a strong SESSION_SECRET.");
      return null;
    }
    return "dev-insecure-secret-local-only";
  }
  return s;
}

function sign(value: string): string | null {
  const key = secret();
  if (!key) return null;
  const h = crypto.createHmac("sha256", key).update(value).digest("hex");
  return `${value}.${h}`;
}

function verify(signed: string | undefined): boolean {
  if (!signed) return false;
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return false;
  const value = signed.slice(0, idx);
  const expected = sign(value);
  if (!expected) return false;
  // Constant-time comparison of the whole signed token.
  const a = Buffer.from(signed);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  // Enforce the issued-at expiry server-side (payload is `ok.<issuedAtMs>`).
  const ts = Number(value.split(".")[1]);
  if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE_S * 1000) return false;
  return true;
}

/** Whether a login gate is configured at all. */
export function passwordRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

export function checkPassword(pw: string): boolean {
  const expected = process.env.APP_PASSWORD || "";
  if (!expected) return true;
  // Hash both sides to a fixed length before the constant-time compare, so the
  // comparison neither throws on length mismatch nor leaks the password length.
  const a = crypto.createHash("sha256").update(pw).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function setSessionCookie() {
  const value = sign(`ok.${Date.now()}`);
  if (!value) throw new Error("session secret not configured");
  const store = await cookies();
  store.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** True when the request is allowed (no gate, or valid cookie). */
export async function isAuthenticated(): Promise<boolean> {
  if (!passwordRequired()) return true;
  const store = await cookies();
  return verify(store.get(COOKIE)?.value);
}
