import { cookies } from "next/headers";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { isRole, type Role } from "@/lib/roles";

const COOKIE = "jf_session";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

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

// The signed cookie payload is `<userId>.<credentialEpoch>.<issuedAtMs>`. cuid
// ids and integers contain no dots, so the payload splits cleanly; the final
// dot-segment is the HMAC.
function verifySigned(signed: string | undefined): string | null {
  if (!signed) return null;
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const expected = sign(value);
  if (!expected) return null;
  const a = Buffer.from(signed);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const ts = Number(value.split(".")[2]);
  if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE_S * 1000) return null;
  return value;
}

export type SessionUser = { id: string; name: string; email: string; role: Role };

/** Issue a session cookie for a user. The credential epoch is baked in so a
 *  password reset / deactivation (which bumps the epoch) invalidates it. */
export async function setSessionCookie(user: { id: string; credentialEpoch: number }) {
  const value = sign(`${user.id}.${user.credentialEpoch}.${Date.now()}`);
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

/**
 * The signed-in staff user, or null. Validates the cookie signature and expiry,
 * then confirms the user still exists, is active, and their credential epoch
 * still matches — so resets/deactivations take effect immediately, and only for
 * that user.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const payload = verifySigned(store.get(COOKIE)?.value);
  if (!payload) return null;
  const [userId, epochStr] = payload.split(".");
  const epoch = Number(epochStr);
  if (!userId || !Number.isFinite(epoch)) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active || user.credentialEpoch !== epoch) return null;

  const role: Role = isRole(user.role) ? user.role : "OFFICE";
  return { id: user.id, name: user.name, email: user.email, role };
}

/** Boolean guard used by the many API routes that only need "is there a valid
 *  staff session". Prefer getSessionUser() when you need the identity/role. */
export async function isAuthenticated(): Promise<boolean> {
  return (await getSessionUser()) !== null;
}
