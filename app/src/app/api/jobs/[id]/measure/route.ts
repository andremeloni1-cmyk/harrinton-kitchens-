import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { parseMeasure } from "@/lib/measure";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

function payload(cm: { data: string; status: string; updatedAt: Date } | null) {
  return cm
    ? { data: parseMeasure(cm.data), status: cm.status, updatedAt: cm.updatedAt.toISOString() }
    : { data: { rooms: [] }, status: "draft", updatedAt: null };
}

export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const cm = await prisma.checkMeasure.findUnique({ where: { jobId } });
  return json({ measure: payload(cm) });
}

// Save the captured rooms. The body's data is normalised through parseMeasure
// before storing, so a malformed/offline-replayed payload can't corrupt it.
export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data = parseMeasure(typeof body.data === "string" ? body.data : JSON.stringify(body.data ?? {}));
  const json_ = JSON.stringify(data);
  const cm = await prisma.checkMeasure.upsert({
    where: { jobId },
    create: { jobId, data: json_ },
    update: { data: json_ },
  });
  return json({ measure: payload(cm) });
}
