import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";

// A factory scan (P8.2): a part reached a station. Records a StationEvent and
// advances the part's furthest station (forward-only) so per-station progress
// derives from where parts have actually been scanned. Idempotent-ish: scanning
// a part already at/after this station still logs the event but won't move it back.
export async function POST(req: Request) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;

  const body = await req.json().catch(() => ({}));
  const partId = typeof body.partId === "string" ? body.partId : "";
  const stationId = typeof body.stationId === "string" ? body.stationId : "";
  if (!partId || !stationId) return json({ error: "Missing part or station." }, 400);

  const [part, station] = await Promise.all([
    prisma.part.findUnique({ where: { id: partId }, include: { cabinet: true } }),
    prisma.station.findUnique({ where: { id: stationId } }),
  ]);
  if (!part) return json({ error: "That code isn't a known part — reprint the label sheet." }, 404);
  if (!station) return json({ error: "Unknown station." }, 404);

  // Forward-only: only advance if this station is at or beyond the current furthest.
  const current = part.lastStationId
    ? await prisma.station.findUnique({ where: { id: part.lastStationId }, select: { position: true } })
    : null;
  const advanced = current == null || station.position >= current.position;

  const now = new Date();
  await prisma.stationEvent.create({ data: { partId: part.id, stationId: station.id } });
  await prisma.part.update({
    where: { id: part.id },
    data: { scannedAt: now, ...(advanced ? { lastStationId: station.id } : {}) },
  });

  await logActivity(part.jobId, "note", `Scan: ${part.cabinet?.name ? `${part.cabinet.name} / ` : ""}${part.name} → ${station.name}`);

  return json({
    advanced,
    part: { id: part.id, name: part.name, cabinet: part.cabinet?.name ?? null },
    station: { id: station.id, name: station.name, position: station.position },
  });
}
