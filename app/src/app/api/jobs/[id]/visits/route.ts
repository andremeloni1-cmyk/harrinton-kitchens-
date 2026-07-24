import { prisma } from "@/lib/db";
import { json, parseDate } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { runStageTransition, logActivity } from "@/lib/automations";
import { legacyStatusForStage, stageIndex, type PipelineStage } from "@/lib/pipeline";
import { intervalsOverlap } from "@/lib/schedule";
import { createEvent, listEvents } from "@/lib/google/calendar";
import { sendEmail } from "@/lib/google/gmail";
import { BRAND } from "@/lib/brand";
import { VISIT_META, isVisitType, type VisitType } from "@/lib/visits";
import type { SiteVisit } from "@prisma/client";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

function serialize(v: SiteVisit) {
  return {
    id: v.id,
    type: v.type,
    assigneeId: v.assigneeId,
    assigneeName: v.assigneeName,
    scheduledStart: v.scheduledStart.toISOString(),
    scheduledEnd: v.scheduledEnd ? v.scheduledEnd.toISOString() : null,
    notes: v.notes,
    status: v.status,
    onCalendar: Boolean(v.googleEventId),
  };
}

const whenLabel = (d: Date) =>
  d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

// List a job's visits of a given type (defaults to CONSULT).
export async function GET(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const typeParam = new URL(req.url).searchParams.get("type") || "CONSULT";
  const type: VisitType = isVisitType(typeParam) ? typeParam : "CONSULT";
  const visits = await prisma.siteVisit.findMany({ where: { jobId, type }, orderBy: { scheduledStart: "asc" } });
  return json({ visits: visits.map(serialize) });
}

// Book a site visit (consultation or check measure): clash-check the assignee's
// other visits and the owner's Google calendar, create the visit + a calendar
// event, advance the pipeline to this visit's stage (forward only), and email
// the client a confirmation.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const type: VisitType = isVisitType(body.type) ? body.type : "CONSULT";
  const meta = VISIT_META[type];

  const start = parseDate(body.start);
  if (!start) return json({ error: `Pick a date and time for the ${meta.label.toLowerCase()}.` }, 400);
  const durationMins = Number(body.durationMins) > 0 ? Number(body.durationMins) : meta.defaultMins;
  const end = new Date(start.getTime() + durationMins * 60_000);
  const assigneeId = typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  const force = body.force === true;

  // Clash detection: this assignee's other scheduled visits + the owner's calendar.
  const clashes: { title: string; start: string; end: string }[] = [];
  if (assigneeId) {
    const others = await prisma.siteVisit.findMany({ where: { assigneeId, status: "scheduled" } });
    for (const v of others) {
      const vEnd = v.scheduledEnd ?? new Date(v.scheduledStart.getTime() + 60 * 60_000);
      if (intervalsOverlap(start, end, v.scheduledStart, vEnd)) {
        clashes.push({ title: "Another site visit", start: v.scheduledStart.toISOString(), end: vEnd.toISOString() });
      }
    }
  }
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const external = await listEvents(dayStart, new Date(dayStart.getTime() + 86_400_000)).catch(() => null);
  if (external) {
    for (const e of external) {
      if (!e.allDay && intervalsOverlap(start, end, new Date(e.start), new Date(e.end))) {
        clashes.push({ title: e.title, start: e.start, end: e.end });
      }
    }
  }
  if (clashes.length && !force) return json({ clash: clashes });

  const assignee = assigneeId
    ? await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } })
    : null;

  // Final atomic gate: re-check the assignee's overlapping visits inside a
  // transaction right before creating, so two bookings that both raced past the
  // check above can't both land on the slot (SQLite serialises the write).
  const outcome = await prisma.$transaction(async (tx) => {
    if (assigneeId && !force) {
      const others = await tx.siteVisit.findMany({ where: { assigneeId, status: "scheduled" } });
      const raced = others.some((v) => {
        const vEnd = v.scheduledEnd ?? new Date(v.scheduledStart.getTime() + 60 * 60_000);
        return intervalsOverlap(start, end, v.scheduledStart, vEnd);
      });
      if (raced) return null;
    }
    return tx.siteVisit.create({
      data: {
        jobId,
        type,
        assigneeId,
        assigneeName: assignee?.name ?? null,
        scheduledStart: start,
        scheduledEnd: end,
        notes: notes || null,
      },
    });
  });
  if (!outcome) {
    return json({ clash: [{ title: "That slot was just booked — pick another time", start: start.toISOString(), end: end.toISOString() }] });
  }
  const visit = outcome;

  const eventId = await createEvent({
    summary: meta.summary(job.title),
    description: [job.clientName ? `Client: ${job.clientName}` : null, notes || null].filter(Boolean).join("\n"),
    location: job.address,
    start,
    end,
  }).catch(() => null);
  if (eventId) await prisma.siteVisit.update({ where: { id: visit.id }, data: { googleEventId: eventId } });

  // Advance the pipeline to this visit's stage — forward only.
  const fromStage = job.pipelineStage as PipelineStage;
  if (stageIndex(fromStage) >= 0 && stageIndex(fromStage) < stageIndex(meta.stage)) {
    const j2 = await prisma.job.update({
      where: { id: jobId },
      data: { pipelineStage: meta.stage, status: legacyStatusForStage(meta.stage) },
    });
    await runStageTransition(j2, fromStage, meta.stage, { logTransition: true }).catch(() => {});
  }

  const when = whenLabel(start);
  await logActivity(
    jobId,
    "calendar",
    `${meta.label} booked for ${when}${assignee?.name ? ` · ${assignee.name}` : ""}${eventId ? "" : " (demo — connect Google to sync)"}`
  );

  if (job.clientEmail) {
    await sendEmail({
      to: job.clientEmail,
      subject: `Your ${meta.label.toLowerCase()} with ${BRAND.name}`,
      body:
        `Hi ${job.clientName || "there"},\n\n` +
        `Your ${meta.label.toLowerCase()} for "${job.title}" is booked for ${when}` +
        `${assignee?.name ? ` with ${assignee.name}` : ""}.\n\n` +
        `${job.address ? `Location: ${job.address}\n\n` : ""}` +
        `We look forward to seeing you.`,
    }).catch(() => {});
  }

  return json({ ok: true, visit: serialize({ ...visit, googleEventId: eventId }) }, 201);
}
