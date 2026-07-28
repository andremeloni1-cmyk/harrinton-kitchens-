import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Add a job to the truck, and snapshot its loading list.
 *
 * The list is stored, not computed. The office may knowingly send a job out
 * short — the point of reconciling later is to compare what was meant to go
 * against what actually went, and a list recomputed at read time would move the
 * goalposts every time a part changed state.
 *
 * Descriptions are denormalised for the same reason: re-extracting a cut list
 * shouldn't silently rewrite what a truck was supposed to carry.
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_loads");
  if (gate instanceof Response) return gate;
  const loadId = (await params).id;

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: { id: true, status: true, stops: { select: { sequence: true } } },
  });
  if (!load) return json({ error: "not found" }, 404);
  if (load.status !== "open") {
    return json({ error: "This load has already left — start a new one." }, 400);
  }

  const body = await req.json().catch(() => ({}));
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!jobId) return json({ error: "jobId is required" }, 400);

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      address: true,
      cabinets: { orderBy: { position: "asc" }, select: { id: true, name: true } },
      // Loose items ship separately from the carcass they belong to; parts
      // inside a cabinet travel as that cabinet and aren't listed twice.
      parts: {
        where: { cabinetId: null, kind: "panel" },
        select: { id: true, name: true, qty: true, widthMm: true, heightMm: true },
      },
    },
  });
  if (!job) return json({ error: "job not found" }, 404);

  const existing = await prisma.loadStop.findUnique({
    where: { loadId_jobId: { loadId, jobId } },
    select: { id: true },
  });
  if (existing) return json({ error: "That job is already on this load." }, 400);

  const sequence = Math.max(0, ...load.stops.map((s) => s.sequence)) + 1;
  const stop = await prisma.loadStop.create({
    data: { loadId, jobId, address: job.address || "", sequence },
    select: { id: true },
  });

  const includeCabinets = body.includeCabinets !== false;
  const includeParts = body.includeParts !== false;

  const rows: { kind: string; cabinetId?: string; partId?: string; description: string; qty: number }[] = [];
  if (includeCabinets) {
    for (const cab of job.cabinets) {
      rows.push({ kind: "cabinet", cabinetId: cab.id, description: cab.name, qty: 1 });
    }
  }
  if (includeParts) {
    for (const part of job.parts) {
      // Size is part of the identity: a cut list can hold two rows in one job
      // both called "Kic", differing only in dimensions.
      const size = part.widthMm && part.heightMm ? ` ${part.widthMm}×${part.heightMm}` : "";
      rows.push({ kind: "part", partId: part.id, description: `${part.name}${size}`, qty: part.qty || 1 });
    }
  }

  for (const row of rows) {
    await prisma.loadItem.create({
      data: {
        loadId,
        stopId: stop.id,
        kind: row.kind,
        cabinetId: row.cabinetId ?? null,
        partId: row.partId ?? null,
        description: row.description,
        qty: row.qty,
        expected: true,
      },
    });
  }

  return json({ stopId: stop.id, added: rows.length }, 201);
}

/** Take a job back off the truck, along with its lines. */
export async function DELETE(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_loads");
  if (gate instanceof Response) return gate;
  const loadId = (await params).id;
  const stopId = new URL(req.url).searchParams.get("stopId") || "";

  const stop = await prisma.loadStop.findFirst({ where: { id: stopId, loadId }, select: { id: true } });
  if (!stop) return json({ error: "not found" }, 404);

  const delivered = await prisma.deliveryProof.count({ where: { stopId: stop.id } });
  if (delivered > 0) {
    return json({ error: "That stop already has delivery proofs — it can't be removed." }, 400);
  }

  await prisma.loadItem.deleteMany({ where: { loadId, stopId: stop.id } });
  await prisma.loadStop.delete({ where: { id: stop.id } });
  return json({ ok: true });
}
