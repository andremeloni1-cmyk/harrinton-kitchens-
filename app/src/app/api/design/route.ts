import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { parseMeasure, roomHasData } from "@/lib/measure";
import { DESIGN_STAGES, sortQueue, type DesignJob } from "@/lib/design-queue";
import { MUDMAP_SOURCE, PLAN_SOURCE } from "@/lib/design-docs";
import type { PipelineStage } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/**
 * The designer's queue: every job in pre-production, with enough of each job's
 * state to say what it is waiting on. Document bodies are never selected —
 * only counted — because a mudmap photo is megabytes and this is a list.
 */
export async function GET() {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;

  const jobs = await prisma.job.findMany({
    where: { pipelineStage: { in: DESIGN_STAGES as string[] } },
    select: {
      id: true,
      reference: true,
      title: true,
      clientName: true,
      address: true,
      pipelineStage: true,
      checkMeasure: { select: { data: true, status: true } },
      documents: { where: { source: { in: [MUDMAP_SOURCE, PLAN_SOURCE] } }, select: { source: true } },
      drawingSets: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { revisions: { orderBy: { createdAt: "desc" }, take: 1, select: { label: true, status: true } } },
      },
    },
  });

  const queue: DesignJob[] = jobs.map((j) => {
    const rooms = j.checkMeasure ? parseMeasure(j.checkMeasure.data).rooms : [];
    const revision = j.drawingSets[0]?.revisions[0] ?? null;
    return {
      id: j.id,
      reference: j.reference,
      title: j.title,
      clientName: j.clientName,
      address: j.address,
      stage: j.pipelineStage as PipelineStage,
      rooms: rooms.length,
      roomsCaptured: rooms.filter(roomHasData).length,
      measureStatus: !j.checkMeasure ? "none" : j.checkMeasure.status === "complete" ? "complete" : "draft",
      mudmaps: j.documents.filter((d) => d.source === MUDMAP_SOURCE).length,
      plans: j.documents.filter((d) => d.source === PLAN_SOURCE).length,
      drawing: revision ? { label: revision.label, status: revision.status } : null,
    };
  });

  return json({ jobs: sortQueue(queue) });
}
