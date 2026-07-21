import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { normalizeCutList, isEmptyCutList, cutListSummary } from "@/lib/cutlist";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// The job's saved cabinets/parts and loose hardware.
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;

  const [cabinets, hardware] = await Promise.all([
    prisma.cabinet.findMany({
      where: { jobId },
      orderBy: { position: "asc" },
      include: { parts: { where: { kind: "panel" }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.part.findMany({ where: { jobId, kind: "hardware" }, orderBy: { createdAt: "asc" } }),
  ]);

  return json({
    cabinets: cabinets.map((c) => ({
      id: c.id,
      name: c.name,
      parts: c.parts.map((p) => ({ id: p.id, name: p.name, material: p.material, edging: p.edging, widthMm: p.widthMm, heightMm: p.heightMm, qty: p.qty })),
    })),
    hardware: hardware.map((h) => ({ id: h.id, name: h.name, qty: h.qty })),
  });
}

// Confirm a reviewed cut list — replaces the job's cabinets/parts.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const cl = normalizeCutList(body.cutlist);
  if (isEmptyCutList(cl)) return json({ error: "There's nothing to save — add at least one part." }, 400);

  // Replace existing (cabinets cascade their parts; hardware parts are job-level).
  await prisma.cabinet.deleteMany({ where: { jobId } });
  await prisma.part.deleteMany({ where: { jobId, cabinetId: null } });

  for (let i = 0; i < cl.cabinets.length; i++) {
    const c = cl.cabinets[i];
    const cabinet = await prisma.cabinet.create({ data: { jobId, name: c.name, position: i } });
    for (const p of c.parts) {
      await prisma.part.create({
        data: { jobId, cabinetId: cabinet.id, name: p.name, kind: "panel", material: p.material || null, edging: p.edging || null, widthMm: p.widthMm, heightMm: p.heightMm, qty: p.qty },
      });
    }
  }
  for (const h of cl.hardware) {
    await prisma.part.create({ data: { jobId, name: h.name, kind: "hardware", qty: h.qty } });
  }

  const summary = cutListSummary(cl);
  await logActivity(jobId, "note", `Cut list saved — ${summary.cabinets} cabinets, ${summary.parts} parts, ${summary.hardware} hardware`);
  return json({ ok: true, summary });
}
