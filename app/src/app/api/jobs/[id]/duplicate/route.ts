import { prisma } from "@/lib/db";
import { json, createJobWithReference } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { stageForLegacyStatus } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

// Clone a job for repeat work (e.g. another kitchen for the same builder).
// Copies the reusable content — company, site contact, description, and the
// to-do / maintenance / estimate lists (with items reset to not-done) — but
// starts fresh: new reference, lead status, no schedule, no calendar/Drive
// links, no invoices or reports.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const src = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!src) return json({ error: "not found" }, 404);

  // Reset any "done" flags on the copied checklists so the new job starts clean.
  const resetChecklist = (raw: string): string => {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return JSON.stringify(arr.map((i) => ({ ...i, done: false })));
    } catch {
      /* keep default */
    }
    return "[]";
  };

  const job = await createJobWithReference((reference) => ({
    reference,
    title: `${src.title} (copy)`,
    description: src.description,
    status: "lead",
    pipelineStage: stageForLegacyStatus("lead"),
    priority: src.priority,
    companyId: src.companyId,
    address: src.address,
    clientName: src.clientName,
    clientEmail: src.clientEmail,
    clientPhone: src.clientPhone,
    quoteAmount: src.quoteAmount,
    durationMins: src.durationMins,
    todos: resetChecklist(src.todos),
    maintenanceTasks: resetChecklist(src.maintenanceTasks),
    estimateItems: src.estimateItems,
    notes: src.notes,
  }));

  await logActivity(job.id, "job", `Duplicated from ${src.reference}`);
  return json({ job }, 201);
}
