import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { parseMeasure } from "@/lib/measure";
import { renderPlanSvg } from "@/lib/plan-draw";
import { PLAN_SOURCE } from "@/lib/design-docs";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The plans already drawn for this job. */
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const plans = await prisma.document.findMany({
    where: { jobId: (await params).id, source: PLAN_SOURCE },
    select: { id: true, name: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return json({ plans });
}

/**
 * Draw a plan from the captured check measure — one SVG per room.
 *
 * Regenerating replaces the previous set rather than piling up: a plan is a
 * rendering of the measurements, so an old one is not a revision worth keeping,
 * it is just out of date. The client-facing revision history lives in
 * DrawingSet, where a designer's own drawing belongs.
 */
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, checkMeasure: { select: { data: true } } },
  });
  if (!job) return json({ error: "not found" }, 404);

  const rooms = job.checkMeasure ? parseMeasure(job.checkMeasure.data).rooms : [];
  const drawable = rooms
    .map((room) => ({ room, svg: renderPlanSvg(room) }))
    .filter((r): r is { room: (typeof rooms)[number]; svg: string } => r.svg !== null);

  if (drawable.length === 0) {
    return json(
      { error: "No wall measurements captured yet — measure at least one wall and try again." },
      400
    );
  }

  await prisma.document.deleteMany({ where: { jobId, source: PLAN_SOURCE } });
  for (const { room, svg } of drawable) {
    await prisma.document.create({
      data: {
        jobId,
        name: `Plan — ${room.name}`,
        source: PLAN_SOURCE,
        mimeType: "image/svg+xml",
        fileData: Buffer.from(svg, "utf8").toString("base64"),
        sharedWithClient: false,
      },
    });
  }

  await logActivity(
    jobId,
    "note",
    `Drew ${drawable.length} plan${drawable.length === 1 ? "" : "s"} from the check measure.`
  ).catch(() => {});

  const plans = await prisma.document.findMany({
    where: { jobId, source: PLAN_SOURCE },
    select: { id: true, name: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return json({ plans, skipped: rooms.length - drawable.length }, 201);
}
