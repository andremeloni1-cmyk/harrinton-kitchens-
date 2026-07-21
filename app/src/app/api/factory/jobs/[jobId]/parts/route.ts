import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { partProgressByStation } from "@/lib/factory";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ jobId: string }> };

// Part-level progress for a job (P8.2): where each part has been scanned, the
// per-station % derived from those scans, and the not-yet-scanned parts.
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const { jobId } = await params;

  const [job, parts, stations] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId }, select: { id: true, reference: true, title: true } }),
    prisma.part.findMany({
      where: { jobId, kind: "panel" },
      orderBy: { createdAt: "asc" },
      include: { cabinet: { select: { name: true } } },
    }),
    prisma.station.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
  ]);
  if (!job) return json({ error: "not found" }, 404);

  const posById = new Map(stations.map((s) => [s.id, s.position]));
  const nameById = new Map(stations.map((s) => [s.id, s.name]));

  const lastPositions = parts.map((p) => (p.lastStationId != null ? posById.get(p.lastStationId) ?? null : null));
  const progress = partProgressByStation(lastPositions, stations.map((s) => ({ id: s.id, position: s.position })))
    .map((pr) => ({ ...pr, name: nameById.get(pr.stationId) ?? "" }));

  return json({
    job: { id: job.id, reference: job.reference, title: job.title },
    stations: stations.map((s) => ({ id: s.id, name: s.name, position: s.position })),
    progress,
    parts: parts.map((p) => ({
      id: p.id,
      name: p.name,
      cabinet: p.cabinet?.name ?? null,
      lastStationId: p.lastStationId,
      lastStation: p.lastStationId ? nameById.get(p.lastStationId) ?? null : null,
      scannedAt: p.scannedAt ? p.scannedAt.toISOString() : null,
    })),
  });
}
