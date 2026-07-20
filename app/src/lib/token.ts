import crypto from "node:crypto";

// Stateless, HMAC-signed, self-expiring tokens for emailed links (password
// reset now; client-portal magic links later). Signed with SESSION_SECRET so no
// extra secret to manage. Format:  base64url(payload).expiryMs.hmacHex
//
// These carry no server-side state. Single-use semantics come from the caller
// embedding something that changes on use (e.g. a user's credentialEpoch) and
// re-checking it on redemption.

const INSECURE_SECRETS = new Set(["", "dev-insecure-secret", "change-me-to-a-long-random-string"]);

function key(): string | null {
  const s = process.env.SESSION_SECRET || "";
  if (INSECURE_SECRETS.has(s)) {
    // Match src/lib/session.ts: fail closed in production, fixed key in dev.
    return process.env.NODE_ENV === "production" ? null : "dev-insecure-secret-local-only";
  }
  return s;
}

/** Sign a payload with an absolute expiry `ttlMs` from now. Returns null if no
 *  secure signing key is configured (production with an unset SESSION_SECRET). */
export function signToken(payload: string, ttlMs: number): string | null {
  const k = key();
  if (!k) return null;
  const exp = Date.now() + ttlMs;
  const body = `${Buffer.from(payload, "utf8").toString("base64url")}.${exp}`;
  const hmac = crypto.createHmac("sha256", k).update(body).digest("hex");
  return `${body}.${hmac}`;
}

/** Verify signature + expiry; returns the original payload, or null if invalid,
 *  tampered, or expired. */
export function verifyToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const k = key();
  if (!k) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [b64, expStr, sig] = parts;
  const body = `${b64}.${expStr}`;
  const expected = crypto.createHmac("sha256", k).update(body).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  try {
    return Buffer.from(b64, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
