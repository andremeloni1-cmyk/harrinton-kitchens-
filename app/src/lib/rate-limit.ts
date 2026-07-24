// In-process fixed-window rate limiter. The deployment runs a single pm2
// process against SQLite, so a module-level Map is a correct throttle store;
// nginx `limit_req` is the network-level backstop in front of it. The core
// check is a pure function so it can be unit-tested without timers or a clock.

import { json } from "@/lib/utils";

export type RateState = { count: number; resetAt: number };
export type RateResult = { ok: boolean; remaining: number; retryAfterSec: number };

/** Fixed-window counter. Pure: the caller supplies the store, key and `now`. */
export function checkRateLimit(
  store: Map<string, RateState>,
  key: string,
  opts: { limit: number; windowMs: number; now: number }
): RateResult {
  const { limit, windowMs, now } = opts;
  const cur = store.get(key);
  if (!cur || now >= cur.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (cur.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((cur.resetAt - now) / 1000) };
  }
  cur.count += 1;
  return { ok: true, remaining: Math.max(0, limit - cur.count), retryAfterSec: 0 };
}

const store = new Map<string, RateState>();
let lastSweep = 0;

/** Process-wide limiter on the real clock. Counts one hit against `key`, lazily
 * sweeping expired windows so the map can't grow without bound. */
export function rateLimit(key: string, opts: { limit: number; windowMs: number }): RateResult {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, v] of store) if (now >= v.resetAt) store.delete(k);
  }
  return checkRateLimit(store, key, { ...opts, now });
}

/** Clear a key's window — e.g. after a successful login, so a user who fat-fingered
 * their password a few times then got in isn't left throttled. */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/** Best-effort client IP from the proxy headers nginx sets in front of the app. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Standard 429 with a Retry-After header, for a tripped limiter. */
export function tooManyRequests(retryAfterSec: number): Response {
  return json(
    { error: "Too many attempts — please wait a moment and try again." },
    { status: 429, headers: { "retry-after": String(Math.max(1, retryAfterSec)) } }
  );
}
