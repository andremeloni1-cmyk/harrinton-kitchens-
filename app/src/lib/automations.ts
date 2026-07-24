import { prisma } from "@/lib/db";
import { upsertJobEvent, deleteJobEvent, listJobEventStarts } from "@/lib/google/calendar";
import { sendEmail } from "@/lib/google/gmail";
import { findJobPdfAttachments } from "@/lib/google/gmail";
import { uploadToJobFolder } from "@/lib/google/drive";
import { isGoogleConnected } from "@/lib/google/oauth";
import { jobTemplateVars, resolveTemplate } from "@/lib/email-templates";
import { isScheduledStatus } from "@/lib/types";
import { autoDraftInvoiceOnComplete } from "@/lib/invoices";
import { jobEnd, businessTimeZone, WORK_START_HOUR, WORK_START_MIN } from "@/lib/schedule";
import { effectsForTransition, type StageEffect } from "@/lib/stage-transitions";
import { stageForLegacyStatus, stageLabel, type PipelineStage } from "@/lib/pipeline";
import { sendPush } from "@/lib/push";
import { BRAND } from "@/lib/brand";
import type { Job } from "@prisma/client";

async function ownerName(): Promise<string> {
  const a = await prisma.companySettings.findFirst();
  return a?.name || "The Workshop";
}

export async function logActivity(
  jobId: string | null,
  type: string,
  message: string,
  meta: Record<string, unknown> = {}
) {
  await prisma.activity.create({
    data: { jobId: jobId ?? undefined, type, message, meta: JSON.stringify(meta) },
  });
}

/** Drive web links for a job's PDF documents (for the calendar description).
 * Only PDFs (the drawing / purchase order) are linked — not inline schedule
 * images — so the event shows just the exact job PDF. */
async function jobDocLinks(jobId: string): Promise<string[]> {
  const docs = await prisma.document.findMany({
    where: { jobId, webViewLink: { not: null } },
  });
  return docs
    .filter((d) => d.mimeType === "application/pdf" || /\.pdf$/i.test(d.name))
    .map((d) => `${d.name}: ${d.webViewLink}`);
}

/**
 * Feature 1 + 3: ensure a calendar event exists for a scheduled job, with the
 * job's Drive document links embedded so they open from the event.
 */
function parseEventIds(job: Job): string[] {
  const ids: string[] = [];
  if (job.googleEventIds) {
    try {
      const arr = JSON.parse(job.googleEventIds);
      if (Array.isArray(arr)) ids.push(...arr.filter((x) => typeof x === "string"));
    } catch {
      /* ignore */
    }
  }
  if (job.googleEventId && !ids.includes(job.googleEventId)) ids.push(job.googleEventId);
  return ids;
}

export async function syncCalendar(job: Job): Promise<void> {
  if (!isScheduledStatus(job.status)) return;
  // Don't put undated jobs on the calendar — wait until a start time is set.
  if (!job.scheduledStart) {
    await logActivity(job.id, "calendar", "Accepted — add a date to put it on the calendar");
    return;
  }
  const links = await jobDocLinks(job.id);
  const previousIds = parseEventIds(job);
  const eventIds = await upsertJobEvent(job, links, previousIds);
  if (eventIds && eventIds.length > 0) {
    await prisma.job.update({
      where: { id: job.id },
      data: { googleEventId: eventIds[0], googleEventIds: JSON.stringify(eventIds) },
    });
    const wasNew = previousIds.length === 0;
    const note =
      eventIds.length > 1
        ? `${wasNew ? "Added" : "Updated"} Google Calendar — ${eventIds.length} working days`
        : wasNew
          ? "Added to Google Calendar"
          : "Updated Google Calendar event";
    await logActivity(job.id, "calendar", note, { eventIds });
  } else {
    await logActivity(job.id, "calendar", "Scheduled (demo mode — connect Google to sync)");
  }
}

export async function removeCalendar(job: Job): Promise<void> {
  const ids = parseEventIds(job);
  if (ids.length === 0) return;
  const ok = await deleteJobEvent(ids);
  await prisma.job.update({ where: { id: job.id }, data: { googleEventId: null, googleEventIds: null } });
  await logActivity(job.id, "calendar", ok ? "Removed from Google Calendar" : "Calendar event cleared");
}

/**
 * Feature 4: send a templated client email for accepted / moved / cancelled.
 */
export async function sendClientEmail(job: Job, key: "accepted" | "moved" | "cancelled"): Promise<void> {
  if (!job.clientEmail) {
    await logActivity(job.id, "email", `No client email on file — ${key} notice not sent`);
    return;
  }
  const tpl = await resolveTemplate(job, key, jobTemplateVars(job, await ownerName()));
  if (!tpl || !tpl.enabled) return;

  const sent = await sendEmail({ to: job.clientEmail, subject: tpl.subject, body: tpl.body });
  await logActivity(
    job.id,
    "email",
    sent
      ? `Sent "${key}" email to ${job.clientEmail}`
      : `Drafted "${key}" email (demo mode — connect Google to send)`,
    { key, to: job.clientEmail }
  );
}

/**
 * Feature 3: pull job-related PDFs from Gmail into the job's Drive folder and
 * record them as documents. Returns the number of new documents saved.
 */
export async function syncJobPdfs(job: Job): Promise<number> {
  const attachments = await findJobPdfAttachments({
    reference: job.reference,
    clientEmail: job.clientEmail,
    title: job.title,
  });
  let saved = 0;
  for (const att of attachments) {
    // Skip ones already saved (match by name).
    const exists = await prisma.document.findFirst({
      where: { jobId: job.id, name: att.filename },
    });
    if (exists) continue;

    const uploaded = await uploadToJobFolder(job, att.filename, att.data, att.mimeType);
    if (uploaded) {
      await prisma.document.create({
        data: {
          jobId: job.id,
          name: uploaded.name,
          driveFileId: uploaded.fileId,
          webViewLink: uploaded.webViewLink,
          source: "gmail",
          mimeType: uploaded.mimeType,
        },
      });
      saved++;
    }
  }
  if (saved > 0) {
    await logActivity(job.id, "drive", `Saved ${saved} PDF(s) from email to Google Drive`);
    // Refresh the calendar event so the new links appear on it.
    const fresh = await prisma.job.findUnique({ where: { id: job.id } });
    if (fresh) await syncCalendar(fresh);
  }
  return saved;
}

// Maps each declarative effect (lib/stage-transitions.ts) to its real
// implementation. Every effect is best-effort and independent: one failing
// (e.g. Google offline) never blocks the others — the same per-side-effect
// resilience the old switch had, now applied uniformly.
const EFFECT_RUNNERS: Record<StageEffect, (job: Job, to: PipelineStage) => Promise<void>> = {
  calendar_sync: (job) => syncCalendar(job),
  calendar_remove: (job) => removeCalendar(job),
  email_accepted: (job) => sendClientEmail(job, "accepted"),
  email_cancelled: (job) => sendClientEmail(job, "cancelled"),
  sync_pdfs: async (job) => {
    // Grab any job PDFs already sitting in the inbox (only when Google is on).
    if (await isGoogleConnected()) await syncJobPdfs(job);
  },
  draft_invoice: (job) => autoDraftInvoiceOnComplete(job),
  portal_event: (job, to) =>
    logActivity(job.id, "portal", `${stageLabel(to)} — update shared with the client`),
  push_office: async (job, to) => {
    await sendPush({
      title: BRAND.name,
      body: `${job.reference} → ${stageLabel(to)}`,
      url: `/jobs/${job.id}`,
    });
  },
  init_factory: async (job) => {
    // Create a per-station progress record for the job (idempotent). The first
    // active station starts in progress; the rest pending.
    const existing = await prisma.jobStation.count({ where: { jobId: job.id } });
    if (existing > 0) return;
    const stations = await prisma.station.findMany({ where: { active: true }, orderBy: { position: "asc" } });
    for (let i = 0; i < stations.length; i++) {
      await prisma.jobStation.create({
        data: {
          jobId: job.id,
          stationId: stations[i].id,
          position: stations[i].position,
          status: i === 0 ? "in_progress" : "pending",
          startedAt: i === 0 ? new Date() : null,
        },
      });
    }
  },
};

/**
 * Run the side effects for a job entering `toStage` (lib/stage-transitions.ts).
 * Each effect is isolated and best-effort. Optionally records the stage change
 * on the Activity timeline — callers that already log a granular status change
 * pass `logTransition: false` to avoid a duplicate entry.
 */
export async function runStageTransition(
  job: Job,
  fromStage: PipelineStage,
  toStage: PipelineStage,
  opts: { logTransition?: boolean; suppressEffects?: boolean; skipEffects?: StageEffect[] } = {}
): Promise<void> {
  if (opts.logTransition && fromStage !== toStage) {
    await logActivity(
      job.id,
      "stage_change",
      `Stage: ${stageLabel(fromStage)} → ${stageLabel(toStage)}`
    );
  }
  // A backward correction logs the move but must not re-run the target stage's
  // entry side effects (client emails, invoice drafts, calendar writes).
  if (opts.suppressEffects) return;
  // Callers that perform one of the entry effects themselves (e.g. the handover
  // ceremony drafts its own final invoice) can skip it here to avoid duplicating.
  const skip = new Set(opts.skipEffects ?? []);
  for (const effect of effectsForTransition(fromStage, toStage)) {
    if (skip.has(effect)) continue;
    try {
      await EFFECT_RUNNERS[effect](job, toStage);
    } catch (err) {
      // Best-effort: a failing side effect never blocks the transition — but it
      // must not vanish. A money/email automation failure needs to be visible.
      console.error(`stage effect "${effect}" failed for ${job.reference} → ${toStage}`, err);
      await logActivity(job.id, "error", `Automation "${effect}" failed entering ${stageLabel(toStage)}`, {
        effect,
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => {});
    }
  }
}

/**
 * Orchestrates everything that should happen when a job's status changes.
 * The status field still drives changes during the P3.1–P3.2 window, but the
 * work is now expressed as pipeline-stage effects, so behaviour is identical
 * whether the change arrives via status or, later, via a direct stage move
 * (P3.3). Deriving the stages from `status` keeps the target stage guaranteed
 * valid even if `pipelineStage` ever drifted.
 */
export async function onStatusChange(job: Job, previousStatus: string): Promise<void> {
  if (job.status === previousStatus) return;
  await logActivity(job.id, "status_change", `Status: ${previousStatus} → ${job.status}`);
  await runStageTransition(
    job,
    stageForLegacyStatus(previousStatus),
    stageForLegacyStatus(job.status)
  );
}

/**
 * Feature 2: when a scheduled job is moved (time changed), update the calendar
 * and notify the client.
 */
export async function onReschedule(job: Job, notify = true): Promise<void> {
  await syncCalendar(job);
  if (notify) await sendClientEmail(job, "moved");
}

// Wall-clock helpers for two-way sync. The app stores scheduledStart as a
// "floating" local time; events are tagged with the business timezone. We compare
// the event's business-tz date to the job's stored local date so server-vs-business
// timezone differences don't cause false "moved" detections.
function localYMD(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function tzParts(d: Date, tz: string): { y: number; m: number; d: number; h: number; min: number } {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  return { y: +parts.year, m: +parts.month, d: +parts.day, h: +(parts.hour === "24" ? "0" : parts.hour), min: +parts.minute };
}

/**
 * Two-way sync: if the owner moved a job's event to another day directly in
 * Google Calendar, reflect that back onto the job (and realign multi-day events).
 * Compares by day; same-day (e.g. a small time nudge) is ignored. Returns the
 * number of jobs updated.
 */
export async function syncFromCalendar(): Promise<{ updated: number }> {
  const starts = await listJobEventStarts();
  if (starts.size === 0) return { updated: 0 };
  const tz = businessTimeZone();
  let updated = 0;

  for (const [jobId, info] of starts) {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || !job.scheduledStart || !isScheduledStatus(job.status)) continue;

    const p = tzParts(info.start, tz);
    const eventDay = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
    const jobDay = localYMD(new Date(job.scheduledStart));
    if (eventDay === jobDay) continue; // unchanged (or only a within-day time tweak)

    // Rebuild the floating start from the event's business-tz wall clock.
    const h = info.allDay ? WORK_START_HOUR : p.h;
    const min = info.allDay ? WORK_START_MIN : p.min;
    const newStart = new Date(p.y, p.m - 1, p.d, h, min, 0);
    const fresh = await prisma.job.update({
      where: { id: job.id },
      data: { scheduledStart: newStart, scheduledEnd: jobEnd(newStart, job.durationMins) },
    });
    await logActivity(job.id, "calendar", `Moved in Google Calendar — updated to ${eventDay}`);
    await syncCalendar(fresh); // realign all working-day events to the new start
    updated++;
  }
  return { updated };
}
