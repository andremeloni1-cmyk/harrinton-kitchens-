import { json } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { verifyToken } from "@/lib/token";
import { hashPassword, passwordProblem } from "@/lib/password";

export const dynamic = "force-dynamic";

// Set a new password from a reset link. Bumping credentialEpoch both consumes
// the token (its epoch no longer matches) and signs out that user's other
// sessions — and only that user's.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  const password = String(body.password || "");

  const problem = passwordProblem(password);
  if (problem) return json({ error: problem }, 400);

  const payload = verifyToken(token);
  if (!payload || !payload.startsWith("reset:")) {
    return json({ error: "This reset link is invalid or has expired" }, 400);
  }
  const [, userId, epochStr] = payload.split(":");
  const epoch = Number(epochStr);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active || !Number.isFinite(epoch) || user.credentialEpoch !== epoch) {
    return json({ error: "This reset link is invalid or has already been used" }, 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(password), credentialEpoch: user.credentialEpoch + 1 },
  });

  return json({ ok: true });
}
