import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Add a line by hand — the benchtop, sink, tap, oven, handles, hardware boxes:
 * everything that goes on the truck but never appeared in a cut list.
 *
 * `expected: false` is how something scanned or ticked on that was never on the
 * list gets recorded, which is what makes the reconciliation work in both
 * directions. It defaults to true (the office adding to the list).
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("deliver");
  if (gate instanceof Response) return gate;
  const loadId = (await params).id;

  const load = await prisma.load.findUnique({ where: { id: loadId }, select: { id: true, status: true } });
  if (!load) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) return json({ error: "description is required" }, 400);

  const stopId = typeof body.stopId === "string" && body.stopId ? body.stopId : null;
  if (stopId) {
    const stop = await prisma.loadStop.findFirst({ where: { id: stopId, loadId }, select: { id: true } });
    if (!stop) return json({ error: "that stop isn't on this load" }, 400);
  }

  const expected = body.expected !== false;
  const qty = Number.isFinite(body.qty) && body.qty > 0 ? Math.floor(body.qty) : 1;

  const item = await prisma.loadItem.create({
    data: {
      loadId,
      stopId,
      kind: "extra",
      description,
      qty,
      expected,
      // An unexpected line only exists because it was found on the truck, so it
      // is loaded by definition.
      ...(expected ? {} : { loadedAt: new Date(), method: "tap" }),
    },
    select: { id: true },
  });
  return json({ item }, 201);
}

/**
 * Tick a line on or off the truck.
 *
 * `method` records how: 'tap' off a list or 'scan' off a label. A cluster of
 * taps on one job usually means a sheet of labels printed badly, which is worth
 * being able to see.
 */
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("deliver");
  if (gate instanceof Response) return gate;
  const loadId = (await params).id;

  const body = await req.json().catch(() => ({}));
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  const item = await prisma.loadItem.findFirst({ where: { id: itemId, loadId }, select: { id: true } });
  if (!item) return json({ error: "not found" }, 404);

  const loaded = Boolean(body.loaded);
  const method = body.method === "scan" ? "scan" : "tap";

  const updated = await prisma.loadItem.update({
    where: { id: item.id },
    data: loaded
      ? { loadedAt: new Date(), loadedById: gate.id, method }
      : { loadedAt: null, loadedById: null, method: null },
    select: { id: true, loadedAt: true, method: true },
  });
  return json({ item: updated });
}

/** Remove a line from the list. */
export async function DELETE(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_loads");
  if (gate instanceof Response) return gate;
  const loadId = (await params).id;
  const itemId = new URL(req.url).searchParams.get("itemId") || "";

  const item = await prisma.loadItem.findFirst({ where: { id: itemId, loadId }, select: { id: true } });
  if (!item) return json({ error: "not found" }, 404);

  const proofs = await prisma.deliveryProof.count({ where: { itemId: item.id } });
  if (proofs > 0) return json({ error: "That line has a delivery proof against it." }, 400);

  await prisma.loadItem.delete({ where: { id: item.id } });
  return json({ ok: true });
}
