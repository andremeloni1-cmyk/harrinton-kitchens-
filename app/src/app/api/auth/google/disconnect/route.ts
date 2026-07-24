import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;
  const account = await prisma.companySettings.findFirst();
  if (account) {
    await prisma.companySettings.update({
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
