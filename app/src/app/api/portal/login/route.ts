import { json } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { newPortalToken } from "@/lib/portal-session";
import { sendEmail } from "@/lib/google/gmail";
import { BRAND } from "@/lib/brand";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_WINDOW_MS = 15 * 60_000;

// Request a portal magic link. Only emails that match a client on file get one;
// the response is identical either way so we never reveal who's a client.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();
  if (!email) return json({ error: "Email is required" }, 400);

  // Throttle magic-link spam. Keyed on the submitted email, so a 429 never
  // reveals which emails are clients on file (P2-C1).
  const ipGate = rateLimit(`portal:ip:${clientIp(req)}`, { limit: 15, windowMs: RATE_WINDOW_MS });
  if (!ipGate.ok) return tooManyRequests(ipGate.retryAfterSec);
  const emailGate = rateLimit(`portal:email:${email}`, { limit: 3, windowMs: RATE_WINDOW_MS });
  if (!emailGate.ok) return tooManyRequests(emailGate.retryAfterSec);

  // SQLite has no case-insensitive `equals`, and the client list is small, so
  // match in memory.
  const candidates = await prisma.client.findMany({
    where: { email: { not: null } },
    select: { id: true, name: true, email: true },
  });
  const client = candidates.find((c) => c.email?.toLowerCase().trim() === email);

  if (client) {
    const { token, tokenHash } = newPortalToken();
    await prisma.clientPortalToken.create({
      data: { clientId: client.id, tokenHash, expiresAt: new Date(Date.now() + TTL_MS) },
    });
    const link = `${process.env.APP_URL || ""}/api/portal/verify?token=${encodeURIComponent(token)}`;
    // Send out-of-band (not awaited) so response timing doesn't reveal whether
    // the email belongs to a client on file (account enumeration, P3-19).
    void sendEmail({
      to: client.email!,
      subject: `Your ${BRAND.name} project portal link`,
      body:
        `Hi ${client.name},\n\n` +
        `Here's your secure link to view your kitchen project (valid for 1 hour):\n\n${link}\n\n` +
        `If you didn't request this, you can ignore this email.`,
    })
      .then((sent) => { if (!sent) console.log(`[demo] Portal sign-in link for ${client.email}: ${link}`); })
      .catch(() => {});
  }

  return json({ ok: true });
}
