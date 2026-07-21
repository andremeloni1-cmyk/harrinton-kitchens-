import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { runStageTransition, logActivity } from "@/lib/automations";
import { legacyStatusForStage, stageIndex, type PipelineStage } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// Complete a station on the floor (one tap): mark it done and start the next
// station — or, if it's the last, finish production and move to DELIVERY.
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const { id } = await params;

  const js = await prisma.jobStation.findUnique({
    where: { id },
    include: { station: { select: { name: true } } },
  });
  if (!js) return json({ error: "not found" }, 404);

  const now = new Date();
  await prisma.jobStation.update({ where: { id }, data: { status: "done", completedAt: now, blocked: false } });

  const next = await prisma.jobStation.findFirst({
    where: { jobId: js.jobId, position: js.position + 1 },
  });
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
