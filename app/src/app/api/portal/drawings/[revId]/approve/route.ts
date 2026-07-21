import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { getPortalClient } from "@/lib/portal-session";
import { runStageTransition, logActivity } from "@/lib/automations";
import { legacyStatusForStage, stageIndex, type PipelineStage } from "@/lib/pipeline";
import { sendPush } from "@/lib/push";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ revId: string }> };

// The client signs off a drawing revision: recorded in an Approval(design), the
// revision is approved, and the job advances to APPROVAL. The office then
// releases it to the factory.
export async function POST(req: Request, { params }: Params) {
  const portal = await getPortalClient();
  if (!portal) return json({ error: "unauthorized" }, 401);
  const { revId } = await params;

  const rev = await prisma.drawingRevision.findFirst({
    where: { id: revId, status: "sent", drawingSet: { job: { clientId: portal.id } } },
    include: { drawingSet: { include: { job: true } } },
  });
  if (!rev) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const signerName = String(body.signerName || "").trim();
  if (signerName.length < 2) return json({ error: "Please type your full name to approve." }, 400);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

  const job = rev.drawingSet.job;
  await prisma.approval.create({
    data: { jobId: job.id, kind: "design", decision: "accepted", signerName, ip },
  });
  await prisma.drawingRevision.update({ where: { id: revId }, data: { status: "approved", approvedAt: new Date() } });

  const from = job.pipelineStage as PipelineStage;
  if (stageIndex(from) >= 0 && stageIndex(from) < stageIndex("APPROVAL")) {
    const j2 = await prisma.job.update({
      where: { id: job.id },
      data: { pipelineStage: "APPROVAL", status: legacyStatusForStage("APPROVAL") },
    });
    await runStageTransition(j2, from, "APPROVAL", { logTransition: true }).catch(() => {});
  }

  await logActivity(job.id, "note", `Drawing ${rev.label} approved by ${signerName}`);
  await sendPush({
    title: `${BRAND.name} — drawings approved`,
    body: `${signerName} approved the drawings for ${job.title}`,
    url: `/jobs/${job.id}`,
  }).catch(() => {});

  return json({ ok: true });
}
