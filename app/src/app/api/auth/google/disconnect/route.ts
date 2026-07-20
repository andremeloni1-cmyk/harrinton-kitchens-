import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const account = await prisma.account.findFirst();
  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiry: null,
        googleEmail: null,
      },
    });
  }
  return json({ ok: true });
}
