import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { parseMeasure } from "@/lib/measure";
import { ensureCheckMeasure, issueCheckMeasureRef } from "@/lib/measure-server";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

type MeasureRow = {
  ref: string | null;
  data: string;
  status: string;
  measuredByName: string;
  measuredAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
};

function payload(cm: MeasureRow | null) {
  return cm
    ? {
        ref: cm.ref,
        data: parseMeasure(cm.data),
        status: cm.status,
        measuredByName: cm.measuredByName,
        measuredAt: cm.measuredAt?.toISOString() ?? null,
        completedAt: cm.completedAt?.toISOString() ?? null,
        updatedAt: cm.updatedAt.toISOString(),
      }
    : {
        ref: null,
        data: { rooms: [] },
        status: "draft",
        measuredByName: "",
        measuredAt: null,
        completedAt: null,
        updatedAt: null,
      };
}

// Opening the capture form is what issues the reference: from here on there is
// a CM-number to write on the site sheet, before a single dimension is typed.
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const cm = await ensureCheckMeasure(jobId);
  return json({ measure: payload(cm) });
}

// Save the captured rooms. The body's data is normalised through parseMeasure
// before storing, so a malformed/offline-replayed payload can't corrupt it.
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, reference: true } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data = parseMeasure(typeof body.data === "string" ? body.data : JSON.stringify(body.data ?? {}));
  const json_ = JSON.stringify(data);

  // A replayed offline save can be the first write this measure ever sees, so
  // the reference is issued here too rather than only on GET.
  const existing = await prisma.checkMeasure.findUnique({ where: { jobId }, select: { ref: true } });
  const ref = existing?.ref ?? (await issueCheckMeasureRef(job.reference));

  const cm = await prisma.checkMeasure.upsert({
    where: { jobId },
    create: { jobId, ref, data: json_ },
    update: { data: json_, ...(existing?.ref ? {} : { ref }) },
  });
  return json({ measure: payload(cm) });
}
