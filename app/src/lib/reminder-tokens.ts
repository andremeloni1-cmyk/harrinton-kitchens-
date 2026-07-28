// One-shot, scope-bound send tokens for outward money-stating emails (risk R1 /
// N1): the preview mints a token, the send consumes it, and a second send with
// the same token is refused — so a double-tap or a flaky-network retry can't
// double-email a client. Scope-agnostic by design: the payment reminder scopes
// by invoice id, the variation approval by "variation:{id}". In-memory (single-
// owner app, one process; state resets on restart) — a DB-side repeat guard
// covers the restart edge. Same precedent as the login rate limiter.
import crypto from "crypto";

const TOKEN_TTL_MS = 15 * 60 * 1000; // a preview older than this must be reopened
const MAX_TOKENS = 200; // opportunistic cleanup bound

const tokens = new Map<string, { scope: string; expires: number }>();

function sweep(now: number) {
  if (tokens.size <= MAX_TOKENS) return;
  for (const [k, v] of tokens) {
    if (v.expires < now) tokens.delete(k);
  }
}

/** Mints a single-use token bound to a scope (e.g. the invoice id). */
export function mintToken(scope: string, now = Date.now()): string {
  sweep(now);
  const token = crypto.randomUUID();
  tokens.set(token, { scope, expires: now + TOKEN_TTL_MS });
  return token;
}

/** Consumes a token. True exactly once per mint, and only for the scope it
 * was minted for; expired, unknown, reused or cross-scope tokens all fail. */
export function consumeToken(token: string, scope: string, now = Date.now()): boolean {
  const entry = tokens.get(token);
  if (!entry) return false;
  tokens.delete(token); // single-use, even when expired or mis-scoped
  return entry.scope === scope && entry.expires >= now;
}
