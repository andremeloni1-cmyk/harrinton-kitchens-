import { json } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { hashInviteToken } from "@/lib/invite";
import { hashPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

const MIN_PASSWORD = 8;

async function findLiveInvite(token: string) {
  if (!token) return null;
  return prisma.invite.findFirst({
    where: { tokenHash: hashInviteToken(token), usedAt: null, expiresAt: { gt: new Date() } },
  });
}

// Show what an invite link is for (email + role), so the accept page can greet
// the invitee. Public.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const invite = await findLiveInvite(token);
  if (!invite) return json({ error: "This invite is invalid or has expired" }, 404);
  return json({ email: invite.email, role: invite.role });
}

// Accept an invite: set a name + password, create (or re-activate) the user with
// the invited role, consume the invite, and sign them in.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  if (!name) return json({ error: "Your name is required" }, 400);
  if (password.length < MIN_PASSWORD) {
    return json({ error: `Password must be at least ${MIN_PASSWORD} characters` }, 400);
  }

  const invite = await findLiveInvite(token);
  if (!invite) return json({ error: "This invite is invalid or has expired" }, 400);

  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          role: invite.role,
          active: true,
          passwordHash: hashPassword(password),
          credentialEpoch: { increment: 1 },
        },
      })
    : await prisma.user.create({
        data: {
          email: invite.email,
          name,
          role: invite.role,
          active: true,
          passwordHash: hashPassword(password),
        },
      });

  await prisma.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
  await setSessionCookie(user);
  return json({ ok: true });
}
