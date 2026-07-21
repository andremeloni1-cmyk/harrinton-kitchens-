import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { partProgressByStation } from "@/lib/factory";

export const dynamic = "force-dynamic";

// The factory board: the active stations plus every job in production with its
// per-station progress. The board groups jobs into columns by current station.
// Each job also carries part-level progress (P8.3) derived from label scans.
export async function GET() {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;

  const [stations, jobs] = await Promise.all([
    prisma.station.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    prisma.job.findMany({
      where: { pipelineStage: "PRODUCTION" },
      orderBy: [{ scheduledStart: "asc" }, { createdAt: "asc" }],
      include: { jobStations: { orderBy: { position: "asc" } } },
    }),
  ]);

  const jobIds = jobs.map((j) => j.id);
  const [parts, cabinets] = await Promise.all([
    jobIds.length
      ? prisma.part.findMany({ where: { jobId: { in: jobIds }, kind: "panel" }, select: { jobId: true, lastStationId: true } })
      : Promise.resolve([]),
    jobIds.length
      ? prisma.cabinet.findMany({ where: { jobId: { in: jobIds } }, orderBy: { position: "asc" }, select: { id: true, jobId: true, name: true, qcPassedAt: true } })
      : Promise.resolve([]),
  ]);

  const posById = new Map(stations.map((s) => [s.id, s.position]));
  const stationPos = stations.map((s) => ({ id: s.id, position: s.position }));
  const partsByJob = new Map<string, (number | null)[]>();
  for (const p of parts) {
    const arr = partsByJob.get(p.jobId) ?? [];
    arr.push(p.lastStationId != null ? posById.get(p.lastStationId) ?? null : null);
    partsByJob.set(p.jobId, arr);
  }
  const cabinetsByJob = new Map<string, { id: string; name: string; qcPassedAt: string | null }[]>();
  for (const c of cabinets) {
    const arr = cabinetsByJob.get(c.jobId) ?? [];
    arr.push({ id: c.id, name: c.name, qcPassedAt: c.qcPassedAt ? c.qcPassedAt.toISOString() : null });
    cabinetsByJob.set(c.jobId, arr);
  }

  return json({
    stations: stations.map((s) => ({ id: s.id, name: s.name, position: s.position })),
    jobs: jobs.map((j) => {
      const lastPositions = partsByJob.get(j.id) ?? [];
      return {
        id: j.id,
        reference: j.reference,
        title: j.title,
        clientName: j.clientName,
        scheduledStart: j.scheduledStart ? j.scheduledStart.toISOString() : null,
        stations: j.jobStations.map((s) => ({
          id: s.id,
          stationId: s.stationId,
          position: s.position,
          status: s.status,
          blocked: s.blocked,
          blockerNote: s.blockerNote,
          notes: s.notes,
          checklist: s.checklist,
        })),
        partsTotal: lastPositions.length,
        partProgress: lastPositions.length ? partProgressByStation(lastPositions, stationPos) : [],
        cabinets: cabinetsByJob.get(j.id) ?? [],
      };
    }),
  });
}
