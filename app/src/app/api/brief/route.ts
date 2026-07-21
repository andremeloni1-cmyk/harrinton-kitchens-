import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getSessionUser } from "@/lib/session";
import { buildBrief, formatBrief } from "@/lib/brief";

export const dynamic = "force-dynamic";

// The caller's role-aware morning brief (P12.1). Deterministic — the lines are
// rendered verbatim from the structured brief.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  let installerId: string | null = null;
  if (user.role === "INSTALLER" && user.email) {
    const inst = await prisma.installer.findFirst({ where: { email: user.email }, select: { id: true } });
    installerId = inst?.id ?? null;
  }
  const settings = await prisma.companySettings.findFirst({ select: { name: true } });
  const brief = await buildBrief(user.role, { installerId });
  return json({ role: brief.role, lines: formatBrief(brief), brief, company: settings?.name ?? null });
}
