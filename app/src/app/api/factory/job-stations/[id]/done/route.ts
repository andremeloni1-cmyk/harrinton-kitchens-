import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { runStageTransition, logActivity } from "@/lib/automations";
import { legacyStatusForStage, stageIndex, type PipelineStage } from "@/lib/pipeline";
import { stationGate } from "@/lib/factory-guards";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// Complete a station on the floor (one tap): mark it done and start the next
// station — or, if it's the last, finish production and move to DELIVERY.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const js = await prisma.jobStation.findUnique({
    where: { id },
    include: { station: { select: { name: true, position: true } } },
  });
  if (!js) return json({ error: "not found" }, 404);

  // The next station is the lowest position strictly after this one — NOT
  // position+1. Retiring a station leaves position gaps (init_factory snapshots
  // live positions), so a `position + 1` lookup would find nothing on a gap,
  // treat this as the last station, and jump the job to DELIVERY with the
  // remaining stations (Assembly/Finishing/QC/Dispatch) never run.
  const next = await prisma.jobStation.findFirst({
    where: { jobId: js.jobId, position: { gt: js.position } },
    orderBy: { position: "asc" },
  });

  // QC / dispatch hold-backs — overridable with a reason (P8.3).
  const hold = await stationGate(js.jobId, { name: js.station.name, position: js.station.position }, !next);
  if (hold.blocked && !body.override) return json({ error: hold.message, needsOverride: true, kind: hold.kind }, 409);

  const now = new Date();
  await prisma.jobStation.update({ where: { id }, data: { status: "done", completedAt: now, blocked: false } });
  if (hold.blocked && body.override) {
    await logActivity(js.jobId, "note", `Factory: ${js.station.name} completed with override — ${typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "no reason given"}`);
  }
  let finished = false;
  if (next) {
    await prisma.jobStation.update({ where: { id: next.id }, data: { status: "in_progress", startedAt: next.startedAt ?? now } });
  } else {
    // Last station done — production complete.
    finished = true;
    const job = await prisma.job.findUnique({ where: { id: js.jobId }, select: { pipelineStage: true } });
    const from = (job?.pipelineStage ?? "PRODUCTION") as PipelineStage;
    if (stageIndex(from) >= 0 && stageIndex(from) < stageIndex("DELIVERY")) {
      const j2 = await prisma.job.update({
        where: { id: js.jobId },
        data: { pipelineStage: "DELIVERY", status: legacyStatusForStage("DELIVERY") },
      });
      await runStageTransition(j2, from, "DELIVERY", { logTransition: true }).catch(() => {});
    }
  }

  await logActivity(js.jobId, "note", `Factory: ${js.station.name} complete${finished ? " — production done" : ""}`);
  return json({ ok: true, finished });
}
