import { cookies } from "next/headers";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";

// Client-portal auth, kept entirely separate from staff auth (src/lib/session.ts):
// a distinct cookie name and a payload namespaced with "portal.", so a staff
// cookie can never be replayed as a portal one (or vice-versa). Signed with the
// same SESSION_SECRET.

const COOKIE = "jf_portal";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days
const INSECURE_SECRETS = new Set(["", "dev-insecure-secret", "change-me-to-a-long-random-string"]);

function secret(): string | null {
  const s = process.env.SESSION_SECRET || "";
  if (INSECURE_SECRETS.has(s)) {
    return process.env.NODE_ENV === "production" ? null : "dev-insecure-secret-local-only";
  }
  return s;
}

function sign(value: string): string | null {
  const key = secret();
  if (!key) return null;
  return `${value}.${crypto.createHmac("sha256", key).update(value).digest("hex")}`;
}

// Payload: `portal.<clientId>.<issuedAtMs>`
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
  const parts = value.split(".");
  if (parts[0] !== "portal") return null;
  const ts = Number(parts[2]);
  if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE_S * 1000) return null;
  return parts[1] || null; // clientId
}

export async function setPortalCookie(clientId: string) {
  const value = sign(`portal.${clientId}.${Date.now()}`);
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

export async function clearPortalCookie() {
  (await cookies()).delete(COOKIE);
}

export type PortalClient = { id: string; name: string; email: string | null };

/** The signed-in portal client, or null. Validates the cookie then confirms the
 *  client still exists. Staff cookies never satisfy this (different name +
 *  namespaced payload). */
export async function getPortalClient(): Promise<PortalClient | null> {
  const store = await cookies();
  const clientId = verifySigned(store.get(COOKIE)?.value);
  if (!clientId) return null;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, email: true },
  });
  return client;
}

// ---- Magic-link tokens (stored as a hash on ClientPortalToken) ----

export function hashPortalToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newPortalToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPortalToken(token) };
}
