import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { runStageTransition, logActivity } from "@/lib/automations";
import { legacyStatusForStage, stageIndex, type PipelineStage } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ jobId: string }> };

// Production complete: mark every station done and move the job to DELIVERY.
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const { jobId } = await params;

  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, pipelineStage: true } });
  if (!job) return json({ error: "not found" }, 404);

  const now = new Date();
  await prisma.jobStation.updateMany({
    where: { jobId, status: { not: "done" } },
    data: { status: "done", completedAt: now },
  });

  const from = job.pipelineStage as PipelineStage;
  if (stageIndex(from) >= 0 && stageIndex(from) < stageIndex("DELIVERY")) {
    const j2 = await prisma.job.update({
      where: { id: jobId },
      data: { pipelineStage: "DELIVERY", status: legacyStatusForStage("DELIVERY") },
    });
    await runStageTransition(j2, from, "DELIVERY", { logTransition: true }).catch(() => {});
  }
  await logActivity(jobId, "note", "Factory: production complete — ready for delivery");
  return json({ ok: true });
}
