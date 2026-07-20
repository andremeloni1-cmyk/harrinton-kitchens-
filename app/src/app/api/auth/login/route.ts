import { json } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { setSessionCookie, clearSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "Email and password are required" }, 400);

  const user = await prisma.user.findUnique({ where: { email } });
  // Verify even when the user is missing/inactive to keep timing uniform, then
  // reject with a single generic message (don't reveal which emails exist).
  const ok = verifyPassword(password, user?.passwordHash);
  if (!user || !user.active || !ok) {
    return json({ error: "Incorrect email or password" }, 401);
  }

  await setSessionCookie(user);
  return json({ ok: true });
}

export async function DELETE() {
  await clearSessionCookie();
  return json({ ok: true });
}
