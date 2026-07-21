import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ jobId: string; cabinetId: string }> };

// QC sign-off for one cabinet (P8.3): pass = stamp qcPassedAt, fail = clear it.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const { jobId, cabinetId } = await params;
  const body = await req.json().catch(() => ({}));
  const passed = body.passed !== false; // default to passing

  const cabinet = await prisma.cabinet.findFirst({ where: { id: cabinetId, jobId }, select: { id: true, name: true } });
  if (!cabinet) return json({ error: "not found" }, 404);

  await prisma.cabinet.update({ where: { id: cabinet.id }, data: { qcPassedAt: passed ? new Date() : null } });
  await logActivity(jobId, "note", `QC ${passed ? "passed" : "reopened"}: ${cabinet.name}`);
  return json({ ok: true, passed });
}
