import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { loadOrderList } from "@/lib/hardware-order-server";
import { orderSummary } from "@/lib/hardware-order";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

type IncomingRequirement = { hardwareItemId: string; requiredPieces: number };

function readRequirements(raw: unknown): IncomingRequirement[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, number>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.hardwareItemId === "string" ? r.hardwareItemId : "";
    const pieces = Number(r.requiredPieces);
    if (!id || !Number.isFinite(pieces) || pieces <= 0) continue;
    // A payload naming the same line twice is summed rather than last-wins:
    // dropping one would quietly under-order.
    out.set(id, (out.get(id) ?? 0) + Math.ceil(pieces));
  }
  return [...out.entries()].map(([hardwareItemId, requiredPieces]) => ({ hardwareItemId, requiredPieces }));
}

/**
 * Commit a reviewed import.
 *
 * Derived rows are replaced wholesale; manual rows are left alone, because
 * nothing in a CAD file knows about them.
 *
 * The one thing never discarded is `pickedPieces`. Stock that has come off the
 * shelf has come off the shelf whatever the revised drawing says, so a replaced
 * row keeps what was already taken against it — and a requirement revised below
 * what is already picked is clamped up to it rather than silently losing the
 * record of a physical movement.
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;

  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, reference: true } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const incoming = readRequirements(body.requirements);

  // Only lines that still exist can be committed — a rule pointing at a deleted
  // stock line would otherwise create an unnamed requirement.
  const known = await prisma.hardwareItem.findMany({
    where: { id: { in: incoming.map((r) => r.hardwareItemId) } },
    select: { id: true },
  });
  const knownIds = new Set(known.map((k) => k.id));
  const requirements = incoming.filter((r) => knownIds.has(r.hardwareItemId));

  const existing = await prisma.jobHardware.findMany({
    where: { jobId, source: "derived" },
    select: { id: true, hardwareItemId: true, pickedPieces: true },
  });
  const pickedById = new Map(existing.map((e) => [e.hardwareItemId, e.pickedPieces]));
  const keepIds = new Set(requirements.map((r) => r.hardwareItemId));

  await prisma.$transaction(async (tx) => {
    // Derived rows no longer produced by the rules go — unless stock was picked
    // against them, which is a physical fact the drawing can't undo. Those are
    // kept at what was taken so the movement stays visible and reconcilable.
    for (const row of existing) {
      if (keepIds.has(row.hardwareItemId)) continue;
      if (row.pickedPieces > 0) {
        await tx.jobHardware.update({
          where: { id: row.id },
          data: { requiredPieces: row.pickedPieces, note: "No longer in the drawing — stock already picked" },
        });
      } else {
        await tx.jobHardware.delete({ where: { id: row.id } });
      }
    }

    for (const req of requirements) {
      const picked = pickedById.get(req.hardwareItemId) ?? 0;
      const requiredPieces = Math.max(req.requiredPieces, picked);
      await tx.jobHardware.upsert({
        where: { jobId_hardwareItemId: { jobId, hardwareItemId: req.hardwareItemId } },
        create: { jobId, hardwareItemId: req.hardwareItemId, requiredPieces, source: "derived" },
        update: { requiredPieces, source: "derived" },
      });
    }
  });

  const lines = await loadOrderList(jobId);
  const summary = orderSummary(lines);
  await logActivity(
    jobId,
    "note",
    `Hardware list imported — ${summary.lines} line${summary.lines === 1 ? "" : "s"}, ${summary.short} short`
  ).catch(() => {});

  return json({ ok: true, lines, summary });
}
