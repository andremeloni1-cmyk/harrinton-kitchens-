import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

// The factory board: the active stations plus every job in production with its
// per-station progress. The board groups jobs into columns by current station.
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

  return json({
    stations: stations.map((s) => ({ id: s.id, name: s.name, position: s.position })),
    jobs: jobs.map((j) => ({
      id: j.id,
      reference: j.reference,
      title: j.title,
      clientName: j.companyId ? j.clientName : j.clientName,
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
    })),
  });
}
