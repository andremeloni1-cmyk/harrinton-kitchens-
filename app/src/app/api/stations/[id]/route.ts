import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// Rename a station, set its daily capacity, or (de)activate it.
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const existing = await prisma.station.findUnique({ where: { id } });
  if (!existing) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("name" in body && typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 60);
  if ("hoursPerDay" in body) data.hoursPerDay = Math.max(0, Number(body.hoursPerDay) || 0);
  if ("active" in body) data.active = Boolean(body.active);

  const station = await prisma.station.update({ where: { id }, data });
  return json({ station: { id: station.id, name: station.name, position: station.position, hoursPerDay: station.hoursPerDay, active: station.active } });
}

// Retire a station — deactivated rather than deleted, to keep in-flight job
// progress intact.
export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const existing = await prisma.station.findUnique({ where: { id } });
  if (!existing) return json({ error: "not found" }, 404);
  await prisma.station.update({ where: { id }, data: { active: false } });
  return json({ ok: true });
}
