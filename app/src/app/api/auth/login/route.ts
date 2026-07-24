import { json } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { setSessionCookie, clearSessionCookie } from "@/lib/session";
import { isRole } from "@/lib/roles";
import { homeForRole } from "@/lib/nav";
import { rateLimit, resetRateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const WINDOW_MS = 15 * 60_000;

export async function POST(req: Request) {
  // Throttle brute-force: generous per-IP (won't hurt an office behind one NAT)
  // and tighter per-account (the real attack surface). App-level backstop to
  // nginx's network limit (P2-C1).
  const ip = clientIp(req);
  const ipGate = rateLimit(`login:ip:${ip}`, { limit: 60, windowMs: WINDOW_MS });
  if (!ipGate.ok) return tooManyRequests(ipGate.retryAfterSec);

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "Email and password are required" }, 400);

  const emailGate = rateLimit(`login:email:${email}`, { limit: 8, windowMs: WINDOW_MS });
  if (!emailGate.ok) return tooManyRequests(emailGate.retryAfterSec);

  const user = await prisma.user.findUnique({ where: { email } });
  // Verify even when the user is missing/inactive to keep timing uniform, then
  // reject with a single generic message (don't reveal which emails exist).
  const ok = verifyPassword(password, user?.passwordHash);
  if (!user || !user.active || !ok) {
    return json({ error: "Incorrect email or password" }, 401);
  }

  // Success — clear this account's failure window so a user who mistyped a few
  // times then got in isn't left throttled.
  resetRateLimit(`login:email:${email}`);
  await setSessionCookie(user);
  const home = homeForRole(isRole(user.role) ? user.role : "OFFICE");
  return json({ ok: true, home });
}

export async function DELETE() {
  await clearSessionCookie();
  return json({ ok: true });
}
