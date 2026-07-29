import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { parseMeasure, type CheckMeasureData } from "@/lib/measure";
import { MEASURE_PHOTO_SOURCE } from "@/lib/design-docs";
import type { PipelineStage } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export type MeasureRegisterEntry = {
  ref: string;
  jobId: string;
  jobReference: string;
  title: string;
  clientName: string | null;
  address: string | null;
  stage: PipelineStage;
  status: string;
  measuredByName: string;
  measuredAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  data: CheckMeasureData;
  /** Check-measure photo ids on the job, so a missing one can be spotted. */
  photoIds: string[];
};

/**
 * The check-measure register: every measure ever taken, newest first, with its
 * rooms in full.
 *
 * Deliberately not scoped to jobs currently in design. The whole point of a
 * reference is to be looked up after the fact — "what did we measure at number
 * 12 in March" is asked while that kitchen is being installed, or a year later
 * when the client wants a matching laundry. A queue that only shows live work
 * can't answer it.
 *
 * Rooms come back whole rather than counted, because the register is where a
 * dimension gets cross-referenced and a summary would just mean a second
 * request per row. Photo *bytes* never do — only their ids.
 */
export async function GET() {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;

  const measures = await prisma.checkMeasure.findMany({
    orderBy: { updatedAt: "desc" },
    // A joinery company measures a few hundred kitchens a year; this is the
    // whole history, so it is capped at something a browser can hold and the
    // search box works within.
    take: 300,
    select: {
      ref: true,
      data: true,
      status: true,
      measuredByName: true,
      measuredAt: true,
      completedAt: true,
      updatedAt: true,
      job: {
        select: {
          id: true,
          reference: true,
          title: true,
          clientName: true,
          address: true,
          pipelineStage: true,
          documents: { where: { source: MEASURE_PHOTO_SOURCE }, select: { id: true } },
        },
      },
    },
  });

  const entries: MeasureRegisterEntry[] = measures
    // A measure with no reference is one whose job reference the migration
    // couldn't read; it gets one the next time it is opened. Listing it under
    // a blank ref in the register would be worse than leaving it out.
    .filter((m) => m.ref)
    .map((m) => ({
      ref: m.ref as string,
      jobId: m.job.id,
      jobReference: m.job.reference,
      title: m.job.title,
      clientName: m.job.clientName,
      address: m.job.address,
      stage: m.job.pipelineStage as PipelineStage,
      status: m.status,
      measuredByName: m.measuredByName,
      measuredAt: m.measuredAt?.toISOString() ?? null,
      completedAt: m.completedAt?.toISOString() ?? null,
      updatedAt: m.updatedAt.toISOString(),
      data: parseMeasure(m.data),
      photoIds: m.job.documents.map((d) => d.id),
    }));

  return json({ measures: entries });
}
