import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { runStageTransition, logActivity } from "@/lib/automations";
import { legacyStatusForStage, stageIndex, type PipelineStage } from "@/lib/pipeline";
import { canTransition } from "@/lib/drawings";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; revId: string }> };

// Advance the job's pipeline stage (forward only) as a drawing revision moves.
async function advanceStage(jobId: string, target: "APPROVAL" | "PRODUCTION") {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, pipelineStage: true } });
  if (!job) return;
  const from = job.pipelineStage as PipelineStage;
  if (stageIndex(from) < 0 || stageIndex(from) >= stageIndex(target)) return;
  const j2 = await prisma.job.update({
    where: { id: jobId },
    data: { pipelineStage: target, status: legacyStatusForStage(target) },
  });
  await runStageTransition(j2, from, target, { logTransition: true }).catch(() => {});
}

// Change a revision's status (draft → sent → approved → released) or its notes.
// Approving advances the job to APPROVAL; releasing to PRODUCTION.
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const { id, revId } = await params;

  const rev = await prisma.drawingRevision.findFirst({
    where: { id: revId, drawingSet: { jobId: id } },
    include: { drawingSet: { select: { name: true } } },
  });
  if (!rev) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("notes" in body) data.notes = body.notes ? String(body.notes).slice(0, 2000) : null;

  let stageMove: "APPROVAL" | "PRODUCTION" | null = null;
  if (typeof body.status === "string" && body.status !== rev.status) {
    if (!canTransition(rev.status, body.status)) {
      return json({ error: `Can't move a ${rev.status} revision to ${body.status}.` }, 400);
    }
    data.status = body.status;
    if (body.status === "sent" && !rev.sentAt) data.sentAt = new Date();
    if (body.status === "approved") { data.approvedAt = new Date(); stageMove = "APPROVAL"; }
    if (body.status === "released") { data.releasedAt = new Date(); stageMove = "PRODUCTION"; }
  }

  const updated = await prisma.drawingRevision.update({ where: { id: revId }, data });
  if (stageMove) await advanceStage(id, stageMove);
  if (typeof data.status === "string") {
    await logActivity(id, "note", `Drawing ${rev.label} (${rev.drawingSet.name}) → ${data.status}`);
  }
  return json({ revision: { id: updated.id, label: updated.label, status: updated.status } });
}
