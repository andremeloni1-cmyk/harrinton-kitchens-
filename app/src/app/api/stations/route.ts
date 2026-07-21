import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

function serialize(s: { id: string; name: string; position: number; hoursPerDay: number; active: boolean }) {
  return { id: s.id, name: s.name, position: s.position, hoursPerDay: s.hoursPerDay, active: s.active };
}

// List stations (the board and settings both read this).
export async function GET() {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const stations = await prisma.station.findMany({ orderBy: { position: "asc" } });
  return json({ stations: stations.map(serialize) });
}

// Add a station (appended to the end).
export async function POST(req: Request) {
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;
  const body = await req.json().catch(() => ({}));
  const name = (typeof body.name === "string" && body.name.trim().slice(0, 60)) || "";
  if (!name) return json({ error: "Station name is required." }, 400);
  const last = await prisma.station.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
  const station = await prisma.station.create({
    data: { name, position: (last?.position ?? -1) + 1, hoursPerDay: Number(body.hoursPerDay) || 8 },
  });
  return json({ station: serialize(station) }, 201);
}

// Reorder — body { order: string[] } sets each station's position by index.
export async function PATCH(req: Request) {
  const gate = await requirePermission("manage_settings");
  if (gate instanceof Response) return gate;
  const body = await req.json().catch(() => ({}));
  const order: string[] = Array.isArray(body.order) ? body.order.filter((x: unknown) => typeof x === "string") : [];
  if (order.length === 0) return json({ error: "order is required" }, 400);
  await Promise.all(order.map((id, i) => prisma.station.update({ where: { id }, data: { position: i } }).catch(() => {})));
  const stations = await prisma.station.findMany({ orderBy: { position: "asc" } });
  return json({ stations: stations.map(serialize) });
}
