// Server-side job list with the includes the dashboard needs. Shared by the
// jobs API route and the server-rendered dashboard page so they can't drift.
import { prisma } from "@/lib/db";

/** Job list with each job's client company (LeadSource) resolved to a display
 * name the UI can label jobs with. */
export async function jobListQuery(where: Record<string, unknown> = {}) {
  const [jobs, sources] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
      include: {
        documents: true,
        installer: { select: { id: true, name: true, color: true } },
        reports: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, status: true, sentAt: true, updatedAt: true, data: true, installer: { select: { name: true } } },
        },
        // Just the statuses — enough to tell if a completed job has been billed
        // (an invoice that's been sent to the company), without a heavy payload.
        invoices: { select: { status: true } },
        _count: { select: { reports: true } },
      },
    }),
    prisma.leadSource.findMany(),
  ]);
  const nameById = new Map(sources.map((s) => [s.id, (s.displayName || s.name).trim()]));
  // An invoice counts as "billed" once it's left draft (pushed/authorised/paid).
  const SENT = new Set(["submitted", "authorised", "paid"]);
  return jobs.map(({ invoices, ...j }) => ({
    ...j,
    companyName: j.companyId ? nameById.get(j.companyId) || null : null,
    // Finished work that hasn't been billed yet — surfaced on the dashboard.
    unbilled: j.status === "completed" && !invoices.some((i) => SENT.has(i.status)),
  }));
}
