import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { canTransition, isLoadStatus, type LoadStatus } from "@/lib/loads";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const DETAIL_SELECT = {
  id: true,
  reference: true,
  status: true,
  driverId: true,
  driverName: true,
  vehicle: true,
  note: true,
  departedAt: true,
  deliveredAt: true,
  createdAt: true,
  stops: {
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      address: true,
      sequence: true,
      job: { select: { id: true, reference: true, title: true, clientName: true, address: true } },
    },
  },
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      stopId: true,
      kind: true,
      cabinetId: true,
      partId: true,
      description: true,
      qty: true,
      expected: true,
      loadedAt: true,
      method: true,
      // Only whether a proof exists — the photos themselves are megabytes and
      // are fetched one at a time.
      proofs: { select: { id: true, createdAt: true } },
    },
  },
} as const;

export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("deliver");
  if (gate instanceof Response) return gate;
  const load = await prisma.load.findUnique({ where: { id: (await params).id }, select: DETAIL_SELECT });
  if (!load) return json({ error: "not found" }, 404);
  return json({ load });
}

/**
 * Move a load along, or change its driver/vehicle/note.
 *
 * Status changes are checked against the transition table rather than accepted
 * blindly: a delivered load is final, because reopening it would leave its
 * proofs pointing at a load that claims to still be loading.
 */
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("deliver");
  if (gate instanceof Response) return gate;
  const id = (await params).id;
  const load = await prisma.load.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!load) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.status === "string") {
    if (!isLoadStatus(body.status)) return json({ error: "unknown status" }, 400);
    const from = load.status as LoadStatus;
    if (body.status !== from) {
      if (!canTransition(from, body.status)) {
        const article = /^[aeiou]/.test(from) ? "An" : "A";
        return json({ error: `${article} ${from} load can't become ${body.status}.` }, 400);
      }
      data.status = body.status;
      if (body.status === "departed") data.departedAt = new Date();
      if (body.status === "delivered") data.deliveredAt = new Date();
    }
  }

  if (typeof body.vehicle === "string") data.vehicle = body.vehicle.trim();
  if (typeof body.note === "string") data.note = body.note.trim();
  if ("driverId" in body) {
    const driverId = typeof body.driverId === "string" && body.driverId ? body.driverId : null;
    const driver = driverId
      ? await prisma.user.findUnique({ where: { id: driverId }, select: { id: true, name: true } })
      : null;
    data.driverId = driver?.id ?? null;
    data.driverName = driver?.name ?? null;
  }

  const updated = await prisma.load.update({ where: { id }, data, select: DETAIL_SELECT });
  return json({ load: updated });
}

/** Scrap a load. Refused once anything has been delivered against it. */
export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_loads");
  if (gate instanceof Response) return gate;
  const id = (await params).id;
  const proofs = await prisma.deliveryProof.count({ where: { loadId: id } });
  if (proofs > 0) {
    return json(
      { error: "This load has delivery proofs against it — cancel it instead of deleting." },
      400
    );
  }
  await prisma.load.deleteMany({ where: { id } });
  return json({ ok: true });
}
