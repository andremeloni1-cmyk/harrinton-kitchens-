// Server-side plumbing for check measures — the bit that has to touch the
// database, kept out of lib/measure.ts so that stays pure and testable.

import { prisma } from "@/lib/db";
import { checkMeasureRef } from "@/lib/measure-ref";

/**
 * The reference to issue a job's check measure, guaranteed not to collide.
 *
 * checkMeasureRef() derives CM-1042 from JOB-1042, which is what makes the two
 * readable as a pair. Derived references can clash where job references can't —
 * an imported JOB-A/1042 and a native JOB-1042 both reduce to CM-1042 — so a
 * taken reference falls back to a suffixed one rather than failing the save.
 */
export async function issueCheckMeasureRef(jobReference: string): Promise<string> {
  const base = checkMeasureRef(jobReference);
  for (let attempt = 0; attempt < 25; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await prisma.checkMeasure.findUnique({ where: { ref: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  // 25 jobs reducing to the same reference means the job references themselves
  // are the problem; a unique-enough suffix keeps the measure saveable.
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * The job's check measure, creating it (with a reference) if this is the first
 * time anyone has opened it. Existing rows from before the reference scheme get
 * one on first touch, which is what the migration's backfill couldn't reach.
 */
export async function ensureCheckMeasure(jobId: string) {
  const existing = await prisma.checkMeasure.findUnique({ where: { jobId } });
  if (existing?.ref) return existing;

  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { reference: true } });
  if (!job) return existing;
  const ref = await issueCheckMeasureRef(job.reference);

  if (existing) return prisma.checkMeasure.update({ where: { jobId }, data: { ref } });
  return prisma.checkMeasure.create({ data: { jobId, ref } });
}
