import { prisma } from "@/lib/db";
import { json, parseDate } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { runStageTransition, logActivity } from "@/lib/automations";
import { legacyStatusForStage, type PipelineStage } from "@/lib/pipeline";
import { intervalsOverlap } from "@/lib/schedule";
import { createEvent, listEvents } from "@/lib/google/calendar";
import { sendEmail } from "@/lib/google/gmail";
import { BRAND } from "@/lib/brand";
import type { SiteVisit } from "@prisma/client";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const DEFAULT_MINS = 60;

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

function whenLabel(d: Date): string {
  return d.toLocaleString("en-GB", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
}

export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const visits = await prisma.siteVisit.findMany({
    where: { jobId, type: "CONSULT" },
    orderBy: { scheduledStart: "asc" },
  });
  return json({ consults: visits.map(serialize) });
}

// Book a consultation: clash-check the slot (this assignee's other visits + the
// owner's Google calendar), create the SiteVisit + a calendar event, advance an
// enquiry to CONSULT, and email the client a confirmation.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const start = parseDate(body.start);
  if (!start) return json({ error: "Pick a date and time for the consultation." }, 400);
  const durationMins = Number(body.durationMins) > 0 ? Number(body.durationMins) : DEFAULT_MINS;
  const end = new Date(start.getTime() + durationMins * 60_000);
  const assigneeId = typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  const force = body.force === true;

  // Clash detection.
  const clashes: { title: string; start: string; end: string }[] = [];
  if (assigneeId) {
    const others = await prisma.siteVisit.findMany({ where: { assigneeId, status: "scheduled" } });
    for (const v of others) {
      const vEnd = v.scheduledEnd ?? new Date(v.scheduledStart.getTime() + DEFAULT_MINS * 60_000);
      if (intervalsOverlap(start, end, v.scheduledStart, vEnd)) {
        clashes.push({ title: "Another site visit", start: v.scheduledStart.toISOString(), end: vEnd.toISOString() });
      }
    }
  }
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const external = await listEvents(dayStart, dayEnd).catch(() => null);
  if (external) {
    for (const e of external) {
      if (e.allDay) continue;
      if (intervalsOverlap(start, end, new Date(e.start), new Date(e.end))) {
        clashes.push({ title: e.title, start: e.start, end: e.end });
      }
    }
  }
  if (clashes.length && !force) return json({ clash: clashes });

  const assignee = assigneeId
    ? await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } })
    : null;

  const visit = await prisma.siteVisit.create({
    data: {
      jobId,
      type: "CONSULT",
      assigneeId,
      assigneeName: assignee?.name ?? null,
      scheduledStart: start,
      scheduledEnd: end,
      notes: notes || null,
    },
  });

  // Calendar event (null in demo mode).
  const eventId = await createEvent({
    summary: `Consultation — ${job.title}`,
    description: [job.clientName ? `Client: ${job.clientName}` : null, notes || null].filter(Boolean).join("\n"),
    location: job.address,
    start,
    end,
  }).catch(() => null);
  if (eventId) await prisma.siteVisit.update({ where: { id: visit.id }, data: { googleEventId: eventId } });

  // First consult on an enquiry advances the pipeline.
  if (job.pipelineStage === "ENQUIRY") {
    const j2 = await prisma.job.update({
      where: { id: jobId },
      data: { pipelineStage: "CONSULT", status: legacyStatusForStage("CONSULT") },
    });
    await runStageTransition(j2, "ENQUIRY" as PipelineStage, "CONSULT", { logTransition: true }).catch(() => {});
  }

  const when = whenLabel(start);
  await logActivity(
    jobId,
    "calendar",
    `Consultation booked for ${when}${assignee?.name ? ` · ${assignee.name}` : ""}${eventId ? "" : " (demo — connect Google to sync)"}`
  );

  // Client confirmation.
  if (job.clientEmail) {
    await sendEmail({
      to: job.clientEmail,
      subject: `Your consultation with ${BRAND.name}`,
      body:
        `Hi ${job.clientName || "there"},\n\n` +
        `Your consultation for "${job.title}" is booked for ${when}` +
        `${assignee?.name ? ` with ${assignee.name}` : ""}.\n\n` +
        `${job.address ? `Location: ${job.address}\n\n` : ""}` +
        `We look forward to seeing you.`,
    }).catch(() => {});
  }

  return json({ ok: true, consult: serialize({ ...visit, googleEventId: eventId }) }, 201);
}
