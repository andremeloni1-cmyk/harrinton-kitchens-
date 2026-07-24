import { prisma } from "@/lib/db";
import { json, parseDate } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { runStageTransition, logActivity } from "@/lib/automations";
import { legacyStatusForStage, stageIndex, type PipelineStage } from "@/lib/pipeline";
import { intervalsOverlap, jobEnd, WORKDAY_MINS } from "@/lib/schedule";
import { createEvent, listEvents, deleteJobEvent } from "@/lib/google/calendar";
import { sendEmail } from "@/lib/google/gmail";
import { BRAND } from "@/lib/brand";
import { dispatchReadyGate } from "@/lib/factory-guards";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const whenLabel = (d: Date) => d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
function parseIds(raw: string): string[] {
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; }
}

// Current install booking + whether the job's parts are dispatched (gate) + the
// crew roster to choose from.
export async function GET(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const [visit, installers, hold] = await Promise.all([
    prisma.siteVisit.findFirst({ where: { jobId, type: "INSTALL", status: { not: "cancelled" } }, orderBy: { scheduledStart: "desc" } }),
    prisma.installer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true, color: true } }),
    dispatchReadyGate(jobId),
  ]);
  return json({
    installers,
    dispatchReady: !hold.blocked,
    dispatchNote: hold.blocked ? hold.message : null,
    visit: visit && {
      id: visit.id,
      start: visit.scheduledStart.toISOString(),
      end: visit.scheduledEnd ? visit.scheduledEnd.toISOString() : null,
      durationDays: visit.durationDays,
      crewIds: parseIds(visit.crewIds),
      notes: visit.notes,
      onCalendar: Boolean(visit.googleEventId),
    },
  });
}

// Book (or rebook) a multi-day crewed install. Gated on parts being scanned out
// of the factory (overridable with a reason); clash-checks the crew and calendar.
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const start = parseDate(body.start);
  if (!start) return json({ error: "Pick a start date and time for the install." }, 400);
  const durationDays = Math.max(1, Math.min(20, Number(body.durationDays) || 1));
  const crewIds: string[] = Array.isArray(body.crewIds) ? body.crewIds.filter((x: unknown) => typeof x === "string").slice(0, 12) : [];
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  const durationMins = durationDays * WORKDAY_MINS;
  const end = jobEnd(start, durationMins);

  // Dispatch gate — parts must be scanned out (override with a reason).
  const hold = await dispatchReadyGate(jobId);
  if (hold.blocked && !body.override) return json({ error: hold.message, needsOverride: true, kind: hold.kind }, 409);

  // Clash detection: any crew member already on another install over this window,
  // plus the owner's Google calendar across the span.
  const clashes: { title: string; start: string; end: string }[] = [];
  if (crewIds.length) {
    const others = await prisma.siteVisit.findMany({ where: { type: "INSTALL", status: "scheduled", jobId: { not: jobId } } });
    for (const v of others) {
      const vEnd = v.scheduledEnd ?? new Date(v.scheduledStart.getTime() + WORKDAY_MINS * 60_000);
      if (intervalsOverlap(start, end, v.scheduledStart, vEnd) && parseIds(v.crewIds).some((id) => crewIds.includes(id))) {
        clashes.push({ title: `${v.assigneeName || "Crew"} on another install`, start: v.scheduledStart.toISOString(), end: vEnd.toISOString() });
      }
    }
  }
  const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
  const external = await listEvents(dayStart, new Date(end.getTime() + 86_400_000)).catch(() => null);
  if (external) {
    for (const e of external) {
      if (!e.allDay && intervalsOverlap(start, end, new Date(e.start), new Date(e.end))) clashes.push({ title: e.title, start: e.start, end: e.end });
    }
  }
  if (clashes.length && !body.force) return json({ clash: clashes });

  const crew = crewIds.length ? await prisma.installer.findMany({ where: { id: { in: crewIds } }, select: { id: true, name: true } }) : [];
  const lead = crew[0] ?? null;

  // Atomic gate: re-check the crew's other installs, then cancel this job's prior
  // booking and create the new one inside one transaction, so two bookings that
  // both raced past the check above can't double-book a crew member (SQLite
  // serialises the write).
  const outcome = await prisma.$transaction(async (tx) => {
    if (crewIds.length && !body.force) {
      const others = await tx.siteVisit.findMany({ where: { type: "INSTALL", status: "scheduled", jobId: { not: jobId } } });
      const raced = others.some((v) => {
        const vEnd = v.scheduledEnd ?? new Date(v.scheduledStart.getTime() + WORKDAY_MINS * 60_000);
        return intervalsOverlap(start, end, v.scheduledStart, vEnd) && parseIds(v.crewIds).some((id) => crewIds.includes(id));
      });
      if (raced) return null;
    }
    // Replace any prior (non-cancelled) install booking for this job.
    const prior = await tx.siteVisit.findMany({ where: { jobId, type: "INSTALL", status: "scheduled" }, select: { googleEventId: true } });
    await tx.siteVisit.updateMany({ where: { jobId, type: "INSTALL", status: "scheduled" }, data: { status: "cancelled" } });
    const created = await tx.siteVisit.create({
      data: {
        jobId, type: "INSTALL",
        assigneeId: lead?.id ?? null, assigneeName: lead?.name ?? null,
        crewIds: JSON.stringify(crewIds), durationDays,
        scheduledStart: start, scheduledEnd: end, notes: notes || null,
      },
    });
    return { visit: created, priorEventIds: prior.map((v) => v.googleEventId).filter((x): x is string => Boolean(x)) };
  });
  if (!outcome) {
    return json({ clash: [{ title: "A crew member was just booked onto another install — pick another time", start: start.toISOString(), end: end.toISOString() }] });
  }
  const { visit, priorEventIds } = outcome;
  // Remove the prior booking's Google Calendar event (external call — after the
  // DB transaction) so the crew don't turn up on the old date.
  if (priorEventIds.length) await deleteJobEvent(priorEventIds).catch(() => {});

  // Reflect on the job so the run sheet, calendar and portal all see the install.
  await prisma.job.update({
    where: { id: jobId },
    data: { scheduledStart: start, scheduledEnd: end, durationMins, ...(lead ? { installerId: lead.id } : {}) },
  });

  const crewNames = crew.map((c) => c.name).join(", ");
  const eventId = await createEvent({
    summary: `Installation — ${job.title}`,
    description: [job.clientName ? `Client: ${job.clientName}` : null, crewNames ? `Crew: ${crewNames}` : null, durationDays > 1 ? `${durationDays} days` : null, notes || null].filter(Boolean).join("\n"),
    location: job.address,
    start, end,
  }).catch(() => null);
  if (eventId) await prisma.siteVisit.update({ where: { id: visit.id }, data: { googleEventId: eventId } });

  // Advance to INSTALL — forward only.
  const fromStage = job.pipelineStage as PipelineStage;
  if (stageIndex(fromStage) >= 0 && stageIndex(fromStage) < stageIndex("INSTALL")) {
    const j2 = await prisma.job.update({ where: { id: jobId }, data: { pipelineStage: "INSTALL", status: legacyStatusForStage("INSTALL") } });
    await runStageTransition(j2, fromStage, "INSTALL", { logTransition: true }).catch(() => {});
  }

  const when = whenLabel(start);
  await logActivity(jobId, "calendar", `Install booked for ${when}${durationDays > 1 ? ` (${durationDays} days)` : ""}${crewNames ? ` · ${crewNames}` : ""}${hold.blocked ? " · dispatch overridden" : ""}${eventId ? "" : " (demo — connect Google to sync)"}`);
  if (hold.blocked && body.override) {
    await logActivity(jobId, "note", `Install booked before dispatch — ${typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "no reason given"}`);
  }

  if (job.clientEmail) {
    await sendEmail({
      to: job.clientEmail,
      subject: `Your installation with ${BRAND.name}`,
      body: `Hi ${job.clientName || "there"},\n\nGreat news — your installation for "${job.title}" is booked for ${when}${durationDays > 1 ? ` over ${durationDays} days` : ""}.\n\n${job.address ? `Location: ${job.address}\n\n` : ""}We'll be in touch with any final details. We can't wait to fit your new kitchen.`,
    }).catch(() => {});
  }

  return json({ ok: true, visitId: visit.id, onCalendar: Boolean(eventId) }, 201);
}
