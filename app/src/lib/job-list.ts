// Server-side job list with the includes the dashboard needs. Shared by the
// jobs API route and the server-rendered dashboard page so they can't drift.
import { prisma } from "@/lib/db";

// An invoice counts toward "billed" once it's left draft (pushed/authorised/paid).
const RAISED = new Set(["submitted", "authorised", "paid"]);

/**
 * Whether a completed job is finished work not yet fully billed. A lone deposit
 * invoice no longer clears this: the job is billed only when its raised
 * (submitted/authorised/paid) invoice totals cover the contract value
 * (quoteAmount inc GST). When the contract value is unknown (no quoteAmount) we
 * fall back to "has any raised invoice at all".
 */
export function isUnbilled(
  status: string,
  quoteAmount: number | null,
  invoices: { status: string; total: number }[]
): boolean {
  if (status !== "completed") return false;
  const raisedInc = invoices.filter((i) => RAISED.has(i.status)).reduce((s, i) => s + (i.total || 0), 0);
  const contractInc = (quoteAmount ?? 0) * 1.1; // + AU GST
  if (contractInc > 0) return raisedInc < contractInc - 0.01;
  return !invoices.some((i) => RAISED.has(i.status));
}

/** Job list with each job's client company (LeadSource) resolved to a display
 * name the UI can label jobs with. */
export async function jobListQuery(where: Record<string, unknown> = {}) {
  const [jobs, sources] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
      include: {
        // No fileData — inline plan bytes would bloat the whole job list.
        documents: {
          select: { id: true, name: true, webViewLink: true, source: true, createdAt: true, sharedWithClient: true, reviewStatus: true },
        },
        installer: { select: { id: true, name: true, color: true } },
        reports: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, status: true, sentAt: true, updatedAt: true, data: true, installer: { select: { name: true } } },
        },
        // Status + total — enough to tell if a completed job's raised invoices
        // cover the contract (so a lone deposit doesn't read as "billed").
        invoices: { select: { status: true, total: true } },
        _count: { select: { reports: true } },
      },
    }),
    prisma.leadSource.findMany(),
  ]);
  const nameById = new Map(sources.map((s) => [s.id, (s.displayName || s.name).trim()]));
  return jobs.map(({ invoices, ...j }) => ({
    ...j,
    companyName: j.companyId ? nameById.get(j.companyId) || null : null,
    // Finished work that hasn't been fully billed yet — surfaced on the dashboard.
    unbilled: isUnbilled(j.status, j.quoteAmount, invoices),
  }));
}
