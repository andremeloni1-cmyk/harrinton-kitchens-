import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { isWorkingDay } from "@/lib/capacity";
import { holidaySet } from "@/lib/capacity-server";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// Move a schedule block to a different day and/or station — the drag-to-rebalance
// action (P9.2). Rebalancing persists here.
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const block = await prisma.scheduleBlock.findUnique({ where: { id } });
  if (!block) return json({ error: "not found" }, 404);

  const data: { day?: string; stationId?: string; hours?: number } = {};
  if (typeof body.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day)) {
    if (!isWorkingDay(body.day, await holidaySet())) return json({ error: "That's a non-working day." }, 400);
    data.day = body.day;
  }
  if (typeof body.stationId === "string") {
    const station = await prisma.station.findFirst({ where: { id: body.stationId, active: true }, select: { id: true } });
    if (!station) return json({ error: "Unknown station." }, 400);
    data.stationId = body.stationId;
  }
  if (typeof body.hours === "number" && body.hours > 0 && body.hours <= 24) data.hours = Math.round(body.hours * 10) / 10;
  if (Object.keys(data).length === 0) return json({ error: "Nothing to change." }, 400);

  const updated = await prisma.scheduleBlock.update({ where: { id }, data });
  return json({ ok: true, block: { id: updated.id, stationId: updated.stationId, day: updated.day, hours: updated.hours } });
}

// Remove a block from the schedule.
export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const { id } = await params;
  await prisma.scheduleBlock.deleteMany({ where: { id } });
  return json({ ok: true });
}
