import { json } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { isRole } from "@/lib/roles";
import { newInviteToken } from "@/lib/invite";
import { sendEmail } from "@/lib/google/gmail";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// List staff users + still-pending invites.
export async function GET() {
  const gate = await requirePermission("manage_users");
  if (gate instanceof Response) return gate;

  const [users, invites] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    }),
    prisma.invite.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    }),
  ]);
  return json({ users, invites });
}

// Invite a new team member: create an Invite and email a set-password link.
export async function POST(req: Request) {
  const gate = await requirePermission("manage_users");
  if (gate instanceof Response) return gate;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();
  const role = body.role;
  if (!email || !email.includes("@")) return json({ error: "A valid email is required" }, 400);
  if (!isRole(role)) return json({ error: "A valid role is required" }, 400);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.active) return json({ error: "That email already has an account" }, 409);

  const { token, tokenHash } = newInviteToken();
  await prisma.invite.create({
    data: { email, role, tokenHash, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });

  const link = `${process.env.APP_URL || ""}/invite?token=${encodeURIComponent(token)}`;
  const sent = await sendEmail({
    to: email,
    subject: `You've been invited to ${BRAND.name}`,
    body:
      `Hi,\n\nYou've been invited to join ${BRAND.name} as ${role}. ` +
      `Set your password and get started here (link valid for 7 days):\n\n${link}\n\n` +
      `If you weren't expecting this, you can ignore this email.`,
  });

  // Demo mode (Gmail not connected): log the link so the office can pass it on,
  // and record it on the activity feed.
  if (!sent) {
    console.log(`[demo] Invite link for ${email}: ${link}`);
    await prisma.activity
      .create({ data: { type: "note", message: `Invite created for ${email} (${role}). Gmail not connected — link logged for the office to share.` } })
      .catch(() => {});
  }

  return json({ ok: true, emailed: sent });
}
