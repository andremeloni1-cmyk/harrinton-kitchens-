import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { generateLabelSheet, type LabelItem } from "@/lib/labels";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

function detailFor(p: { material: string | null; widthMm: number | null; heightMm: number | null; qty: number }): string {
  const bits: string[] = [];
  if (p.widthMm && p.heightMm) bits.push(`${p.widthMm}×${p.heightMm}`);
  if (p.material) bits.push(p.material);
  if (p.qty > 1) bits.push(`×${p.qty}`);
  return bits.join(" · ");
}

// Printable QR label sheet for the job's parts (P8.2). Each label encodes
// "HK:<partId>" so the factory scanner can advance that part at its station.
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;

  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, reference: true } });
  if (!job) return json({ error: "not found" }, 404);

  const [cabinets, hardware] = await Promise.all([
    prisma.cabinet.findMany({
      where: { jobId },
      orderBy: { position: "asc" },
      include: { parts: { where: { kind: "panel" }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.part.findMany({ where: { jobId, kind: "hardware" }, orderBy: { createdAt: "asc" } }),
  ]);

  const items: LabelItem[] = [];
  for (const c of cabinets) {
    for (const p of c.parts) items.push({ id: p.id, cabinet: c.name, part: p.name, detail: detailFor(p) });
  }
  for (const h of hardware) items.push({ id: h.id, cabinet: "Hardware", part: h.name, detail: h.qty > 1 ? `×${h.qty}` : undefined });

  if (items.length === 0) return json({ error: "No parts to label yet — save the cut list first." }, 400);

  const pdf = await generateLabelSheet({ jobReference: job.reference }, items).catch((e) => {
    console.error("label sheet generation failed:", e);
    return null;
  });
  if (!pdf) return json({ error: "Couldn't build the label sheet." }, 400);

  await logActivity(jobId, "note", `Label sheet generated — ${items.length} labels`);
  return json({ pdfBase64: pdf.toString("base64"), filename: `Labels-${job.reference}.pdf` });
}
