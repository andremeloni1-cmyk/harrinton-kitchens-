import { json } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/token";
import { sendEmail } from "@/lib/google/gmail";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

const TTL_MS = 60 * 60 * 1000; // 1 hour

// Request a password-reset link. Always responds ok (never reveals whether an
// email is registered). The token encodes the user's current credentialEpoch,
// so it self-invalidates once the password is set (see reset/confirm).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();
  if (!email) return json({ error: "Email is required" }, 400);

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.active) {
    const token = signToken(`reset:${user.id}:${user.credentialEpoch}`, TTL_MS);
    if (token) {
      const base = process.env.APP_URL || "";
      const link = `${base}/reset?token=${encodeURIComponent(token)}`;
      const sent = await sendEmail({
        to: user.email,
        subject: `Reset your ${BRAND.name} password`,
        body:
          `Hi ${user.name},\n\n` +
          `We received a request to reset your password. Use the link below (valid for 1 hour):\n\n` +
          `${link}\n\n` +
          `If you didn't request this, you can ignore this email.`,
      });
      // Demo mode (Gmail not connected): surface the link in the server log so
      // it's usable without an email provider.
      if (!sent) console.log(`[demo] Password reset link for ${user.email}: ${link}`);
    }
  }

  return json({ ok: true });
}
