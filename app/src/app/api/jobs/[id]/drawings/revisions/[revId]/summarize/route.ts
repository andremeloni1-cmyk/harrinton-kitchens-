import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { summarizeRevisionChanges } from "@/lib/drawing-ai";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; revId: string }> };

const filesOf = async (revId: string) => {
  const docs = await prisma.document.findMany({
    where: { drawingRevisionId: revId },
    select: { fileData: true, mimeType: true },
  });
  return docs.filter((d) => d.fileData).map((d) => ({ data: d.fileData!, mimeType: d.mimeType }));
};

// Generate the AI change summary for a revision vs the previous one in its set.
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const { id, revId } = await params;

  const rev = await prisma.drawingRevision.findFirst({
    where: { id: revId, drawingSet: { jobId: id } },
    select: { id: true, label: true, drawingSetId: true },
  });
  if (!rev) return json({ error: "not found" }, 404);

  const nextFiles = await filesOf(revId);
  if (nextFiles.length === 0) return json({ ok: false, message: "Add drawings to this revision first." }, 400);

  // The revision immediately before this one in the set.
  const revs = await prisma.drawingRevision.findMany({
    where: { drawingSetId: rev.drawingSetId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const idx = revs.findIndex((r) => r.id === revId);
  const prevId = idx > 0 ? revs[idx - 1].id : null;

  if (!prevId) {
    const first = {
      summary: "First revision — no earlier version to compare against.",
      summaryClient: "This is the first version of your drawings.",
    };
    await prisma.drawingRevision.update({ where: { id: revId }, data: first });
    return json({ ok: true, ...first });
  }

  const diff = await summarizeRevisionChanges(await filesOf(prevId), nextFiles);
  if (!diff) {
    return json({
      ok: false,
      message: "Summary unavailable — add ANTHROPIC_API_KEY, or the drawings couldn’t be read.",
    });
  }
  await prisma.drawingRevision.update({
    where: { id: revId },
    data: { summary: diff.internal, summaryClient: diff.client },
  });
  await logActivity(id, "note", `AI change summary generated for ${rev.label}`);
  return json({ ok: true, summary: diff.internal, summaryClient: diff.client });
}
