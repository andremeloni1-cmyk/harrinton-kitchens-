import { json } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/token";
import { sendEmail } from "@/lib/google/gmail";
import { BRAND } from "@/lib/brand";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_WINDOW_MS = 15 * 60_000;

// Request a password-reset link. Always responds ok (never reveals whether an
// email is registered). The token encodes the user's current credentialEpoch,
// so it self-invalidates once the password is set (see reset/confirm).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();
  if (!email) return json({ error: "Email is required" }, 400);

  // Throttle reset-email spam. Keyed on the submitted email (not on whether it
  // exists), so a 429 never reveals which emails are registered (P2-C1).
  const ipGate = rateLimit(`reset:ip:${clientIp(req)}`, { limit: 15, windowMs: RATE_WINDOW_MS });
  if (!ipGate.ok) return tooManyRequests(ipGate.retryAfterSec);
  const emailGate = rateLimit(`reset:email:${email}`, { limit: 3, windowMs: RATE_WINDOW_MS });
  if (!emailGate.ok) return tooManyRequests(emailGate.retryAfterSec);

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.active) {
    const token = signToken(`reset:${user.id}:${user.credentialEpoch}`, TTL_MS);
    if (token) {
      const base = process.env.APP_URL || "";
      const link = `${base}/reset?token=${encodeURIComponent(token)}`;
      // Send out-of-band (not awaited) so the response time doesn't depend on
      // whether the account exists — the email round-trip would otherwise be a
      // timing oracle for account enumeration (P3-19).
      void sendEmail({
        to: user.email,
        subject: `Reset your ${BRAND.name} password`,
        body:
          `Hi ${user.name},\n\n` +
          `We received a request to reset your password. Use the link below (valid for 1 hour):\n\n` +
          `${link}\n\n` +
          `If you didn't request this, you can ignore this email.`,
      })
        // Demo mode (Gmail not connected): surface the link in the server log so
        // it's usable without an email provider.
        .then((sent) => { if (!sent) console.log(`[demo] Password reset link for ${user.email}: ${link}`); })
        .catch(() => {});
    }
  }

  return json({ ok: true });
}
