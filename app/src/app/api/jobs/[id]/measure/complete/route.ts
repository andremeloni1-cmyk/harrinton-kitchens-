import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { runStageTransition, logActivity } from "@/lib/automations";
import { legacyStatusForStage, stageIndex, type PipelineStage } from "@/lib/pipeline";
import { parseMeasure } from "@/lib/measure";
import { parseSections } from "@/lib/quote";
import { findDiscrepancies, variationDraftFrom } from "@/lib/variation";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

// Complete a check measure: mark it done, diff the captured dimensions against
// the quote's assumptions, advance the job to DESIGN, and draft a variation from
// any discrepancies (priced + sent for approval in P6.4).
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return json({ error: "not found" }, 404);
  const cm = await prisma.checkMeasure.findUnique({ where: { jobId } });
  if (!cm) return json({ error: "There's no check measure to complete yet." }, 400);

  const measure = parseMeasure(cm.data);

  // Quote assumptions: the latest quote's section/line text and notes.
  const quote = await prisma.quote.findFirst({ where: { jobId }, orderBy: { version: "desc" } });
  const quoteText = quote
    ? [
        ...parseSections(quote.sections).flatMap((s) => [s.title, ...s.lines.map((l) => l.description)]),
        quote.notes || "",
      ].join("\n")
    : "";
  const discrepancies = findDiscrepancies(measure, quoteText);

  // Stamp who signed the measure off. A reference is only worth having if it
  // answers "who stood in that room" as well as "which room" — the first
  // question asked when a dimension is later disputed.
  await prisma.checkMeasure.update({
    where: { jobId },
    data: {
      status: "complete",
      completedAt: new Date(),
      measuredAt: cm.measuredAt ?? new Date(),
      measuredByName: cm.measuredByName || gate.name || gate.email,
    },
  });

  // Advance to DESIGN (forward only).
  const from = job.pipelineStage as PipelineStage;
  if (stageIndex(from) >= 0 && stageIndex(from) < stageIndex("DESIGN")) {
    const j2 = await prisma.job.update({
      where: { id: jobId },
      data: { pipelineStage: "DESIGN", status: legacyStatusForStage("DESIGN") },
    });
    await runStageTransition(j2, from, "DESIGN", { logTransition: true }).catch(() => {});
  }

  let variationId: string | null = null;
  if (discrepancies.length > 0) {
    const draft = variationDraftFrom(discrepancies);
    const v = await prisma.variation.create({
      data: { jobId, title: draft.title, description: draft.description, source: "check_measure" },
    });
    variationId = v.id;
    await logActivity(
      jobId,
      "note",
      `Check measure complete — ${discrepancies.length} discrepancy${discrepancies.length === 1 ? "" : "ies"} flagged; draft variation raised`
    );
  } else {
    await logActivity(jobId, "note", "Check measure complete — no discrepancies against the quote");
  }

  return json({ ok: true, discrepancies, variationId, stage: "DESIGN" });
}
