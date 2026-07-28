import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { nextLoadReference, isLoadStatus } from "@/lib/loads";

export const dynamic = "force-dynamic";

const LIST_SELECT = {
  id: true,
  reference: true,
  status: true,
  driverName: true,
  vehicle: true,
  note: true,
  departedAt: true,
  deliveredAt: true,
  createdAt: true,
  stops: { select: { id: true, address: true, sequence: true, job: { select: { id: true, reference: true, title: true } } } },
  items: { select: { id: true, kind: true, description: true, qty: true, expected: true, loadedAt: true } },
} as const;

/** Every load, newest first. The floor and the driver both read this. */
export async function GET(req: Request) {
  const gate = await requirePermission("deliver");
  if (gate instanceof Response) return gate;

  const status = new URL(req.url).searchParams.get("status");
  const loads = await prisma.load.findMany({
    where: status && isLoadStatus(status) ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    select: LIST_SELECT,
  });
  return json({ loads });
}

/**
 * Start a load. Building the list is an office act, so this needs manage_loads
 * — the floor can tick items on but can't decide what should go.
 */
export async function POST(req: Request) {
  const gate = await requirePermission("manage_loads");
  if (gate instanceof Response) return gate;

  const body = await req.json().catch(() => ({}));
  const driverId = typeof body.driverId === "string" && body.driverId ? body.driverId : null;
  // The name is denormalised so the record still reads correctly after a driver
  // leaves and their user row is deactivated.
  const driver = driverId
    ? await prisma.user.findUnique({ where: { id: driverId }, select: { id: true, name: true } })
    : null;

  const existing = await prisma.load.findMany({ select: { reference: true } });
  const load = await prisma.load.create({
    data: {
      reference: nextLoadReference(existing.map((l) => l.reference)),
      vehicle: typeof body.vehicle === "string" ? body.vehicle.trim() : "",
      note: typeof body.note === "string" ? body.note.trim() : "",
      driverId: driver?.id ?? null,
      driverName: driver?.name ?? null,
    },
    select: LIST_SELECT,
  });
  return json({ load }, 201);
}
