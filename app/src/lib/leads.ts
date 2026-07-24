import { prisma } from "@/lib/db";
import { findLeadMessages } from "@/lib/google/gmail";
import { uploadToJobFolder } from "@/lib/google/drive";
import { isGoogleConnected } from "@/lib/google/oauth";
import { logActivity } from "@/lib/automations";
import { createJobWithReference } from "@/lib/utils";
import { extractJobsFromEmail, visionConfigured, type ExtractedJob } from "@/lib/vision";
import { WORKDAY_MINS, jobEnd } from "@/lib/schedule";

const IMAGE_RE = /^image\//i;
const PDF_RE = (name: string, mime: string) => mime === "application/pdf" || /\.pdf$/i.test(name);
// Subjects that are clearly NOT new jobs to book (common misspellings included).
const NON_JOB_RE = /\b(maintenance|maintanance|maintenence|mantenance|mantanace|matanance|mantanance)\b/i;

/** A stable key for matching the same job week-to-week: a quote/reference number
 * if present (e.g. QU1234), else the normalised title. */
function matchKey(title: string): string {
  const ref = title.match(/\bqu[-\s]?\d{3,}\b/i)?.[0] || title.match(/\b\d{4,}\b/)?.[0];
  if (ref) return ref.toLowerCase().replace(/[\s-]/g, "");
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Scans the mailbox for new emails from the configured trusted senders and
 * turns each new one into a job lead (status "lead") for the owner to approve.
 * Idempotent: messages already imported (by Gmail message id) are skipped.
 */
export type ScanResult = {
  created: number;
  connected: boolean;
  flagged: number; // jobs newly flagged as possibly moved/cancelled
  plans: number; // existing jobs that just got their plans (PDFs)
};

/** Uploads attachments into a job's Drive folder + records them as documents,
 * skipping any already saved. Returns how many new documents were saved. */
async function attachToJob(
  job: { id: string; reference: string; title: string },
  attachments: { filename: string; data: Buffer; mimeType: string }[]
): Promise<number> {
  let n = 0;
  for (const att of attachments) {
    const exists = await prisma.document.findFirst({ where: { jobId: job.id, name: att.filename } });
    if (exists) continue;
    const up = await uploadToJobFolder(job, att.filename, att.data, att.mimeType);
    if (up) {
      await prisma.document.create({
        data: { jobId: job.id, name: up.name, driveFileId: up.fileId, webViewLink: up.webViewLink, source: "gmail", mimeType: up.mimeType },
      });
      n++;
    }
  }
  return n;
}

export async function scanForLeads(opts: { force?: boolean; sinceDays?: number } = {}): Promise<ScanResult> {
  if (!(await isGoogleConnected())) return { created: 0, connected: false, flagged: 0, plans: 0 };

  const sources = await prisma.leadSource.findMany({ where: { enabled: true } });
  const emails = sources.map((s) => s.email.toLowerCase());
  if (emails.length === 0) return { created: 0, connected: true, flagged: 0, plans: 0 };

  // Look back 14 days, then keep only the most recent email per company (Gmail
  // returns newest-first, so the first time a sender's domain appears is its
  // latest email). That latest email is treated as the company's current
  // schedule and reconciled against the jobs already in the app.
  const sinceDays = opts.sinceDays ?? 14;
  const messages = await findLeadMessages(emails, { sinceDays, maxMessages: 60 });
  const latest = new Map<string, (typeof messages)[number]>();
  for (const m of messages) {
    const domain = (m.fromEmail.split("@")[1] || m.fromEmail).toLowerCase();
    if (!latest.has(domain)) latest.set(domain, m);
  }

  const durationFor = (j: { durationMins?: number; days?: number }): number => {
    if (j.days && j.days > 0) return Math.round(j.days) * WORKDAY_MINS;
    if (j.durationMins && j.durationMins > 0) return Math.round(j.durationMins);
    return WORKDAY_MINS;
  };

  let created = 0;
  let flagged = 0;
  let plans = 0;

  for (const [domain, m] of latest) {
    if (NON_JOB_RE.test(m.subject || "")) continue;

    // Skip emails already processed (same message id) unless a manual force —
    // an identical email yields the same result, so re-running Claude vision on
    // it every scan is wasted cost.
    if (!opts.force) {
      const seen = await prisma.processedEmail.findUnique({ where: { messageId: m.messageId } }).catch(() => null);
      if (seen) continue;
    }
    let createdHere = 0;

    // The trusted-sender company this email's jobs belong to (the client).
    const source = sources.find((s) => domain.includes(s.email.toLowerCase())) || null;
    const companyId = source?.id || null;

    const imageAttachments = m.attachments.filter((a) => IMAGE_RE.test(a.mimeType));
    const pdfAttachments = m.attachments.filter((a) => PDF_RE(a.filename, a.mimeType));

    let extracted: ExtractedJob[] | null = null; // null = AI not configured
    if (visionConfigured()) {
      const result = await extractJobsFromEmail({
        subject: m.subject,
        body: m.body || m.snippet || "",
        images: imageAttachments.map((a) => ({ filename: a.filename, data: a.data, mimeType: a.mimeType })),
        pdfNames: pdfAttachments.map((a) => a.filename),
        companyHint: source ? companyNamingHint(source.displayName || source.name) : undefined,
      });
      // A transient AI/API failure — skip WITHOUT marking the email processed, so
      // the next scan retries instead of collapsing a multi-job email into one
      // junk job and permanently recording it as done (B8).
      if (!result.ok) continue;
      extracted = result.jobs;
    }
    // AI ran and found no bookable jobs — don't reconcile (can't tell what's on
    // the schedule), just record it.
    if (extracted !== null && extracted.length === 0) {
      await prisma.processedEmail
        .upsert({ where: { messageId: m.messageId }, create: { messageId: m.messageId, jobsCreated: 0, reason: "no_new_jobs" }, update: { jobsCreated: 0, reason: "no_new_jobs" } })
        .catch(() => {});
      continue;
    }

    type NewJob = {
      title: string;
      description: string;
      clientName?: string | null;
      clientPhone?: string | null;
      address?: string | null;
      start?: Date | null;
      durationMins: number;
      attachments: string[];
    };
    const toCreate: NewJob[] =
      extracted && extracted.length > 0
        ? extracted.map((j) => ({
            title: j.title?.trim() || "New job",
            description: j.description?.trim() || "",
            clientName: j.clientName?.trim() || null,
            clientPhone: j.clientPhone?.trim() || null,
            address: j.address?.trim() || null,
            start: combineDateTime(j.date, j.time),
            durationMins: durationFor(j),
            attachments: Array.isArray(j.attachments) ? j.attachments : [],
          }))
        : [
            {
              title: m.subject.replace(/^(re:|fwd:)\s*/i, "").trim() || "New enquiry",
              description: (m.body || m.snippet || "").slice(0, 1500),
              clientName: null,
              clientPhone: null,
              address: null,
              start: null,
              durationMins: WORKDAY_MINS,
              attachments: [],
            },
          ];

    // Open jobs already in the app from this company, to reconcile against.
    const existing = await prisma.job.findMany({
      where: { leadSource: { contains: domain }, status: { in: ["lead", "accepted", "scheduled", "in_progress"] } },
      include: { documents: true },
    });
    const matchedIds = new Set<string>();

    for (const nj of toCreate) {
      const key = matchKey(nj.title);
      const match = existing.find((j) => matchKey(j.title) === key);

      if (match) {
        matchedIds.add(match.id);
        // It's back on this week's email — clear any stale "possibly moved" flag.
        if (match.flag === "review") {
          await prisma.job.update({ where: { id: match.id }, data: { flag: null } });
          await logActivity(match.id, "lead", "Still on this week's email — review flag cleared");
        }
        // Plans arriving later: if the job has no PDF yet and this email carries one
        // for it, attach it.
        const hasPdf = match.documents.some((d) => PDF_RE(d.name, d.mimeType));
        if (!hasPdf) {
          const forThis = pdfAttachments.filter((a) => nj.attachments.includes(a.filename));
          const got = await attachToJob(match, forThis.length ? forThis : toCreate.length === 1 ? pdfAttachments : []);
          if (got > 0) {
            plans++;
            await logActivity(match.id, "drive", `Plans received — ${got} PDF(s) attached from email`);
          }
        }
        continue;
      }

      // New job for this company → create it as a "to confirm" lead.
      const job = await createJobWithReference((reference) => ({
        reference,
        title: nj.title,
        description: nj.description,
        status: "lead",
        address: nj.address,
        companyId,
        clientName: nj.clientName || m.fromName,
        clientPhone: nj.clientPhone,
        clientEmail: m.fromEmail,
        leadSource: m.fromEmail,
        gmailMessageId: m.messageId,
        gmailThreadId: m.threadId,
        scheduledStart: nj.start,
        scheduledEnd: nj.start ? jobEnd(nj.start, nj.durationMins) : null,
        durationMins: nj.durationMins,
      }));
      created++;
      createdHere++;
      const own = m.attachments.filter((a) => nj.attachments.includes(a.filename));
      await attachToJob(job, own.length ? own : toCreate.length === 1 ? m.attachments : []);
      await logActivity(job.id, "lead", `Imported from email — ${m.fromName} <${m.fromEmail}>`, { messageId: m.messageId });
    }

    // Moved/cancelled detection: a confirmed/scheduled job from this company that
    // falls within the window the schedule covers (~5 weeks) but isn't in their
    // latest email is probably moved or cancelled — flag it (never auto-delete).
    const now = Date.now();
    const horizon = now + 35 * 86_400_000;
    for (const j of existing) {
      if (matchedIds.has(j.id)) continue;
      if (!["accepted", "scheduled", "in_progress"].includes(j.status)) continue;
      if (!j.scheduledStart) continue;
      const t = new Date(j.scheduledStart).getTime();
      if (t < now - 86_400_000 || t > horizon) continue;
      if (j.flag === "review") continue;
      await prisma.job.update({ where: { id: j.id }, data: { flag: "review" } });
      await logActivity(j.id, "lead", "Not in this week's email — may have been moved or cancelled");
      flagged++;
    }

    await prisma.processedEmail
      .upsert({ where: { messageId: m.messageId }, create: { messageId: m.messageId, jobsCreated: createdHere, reason: "reconciled" }, update: { jobsCreated: createdHere, reason: "reconciled" } })
      .catch(() => {});
  }

  // Record the scan itself in the activity feed (no job attached).
  await logActivity(
    null,
    "scan",
    `Inbox checked — ${created} new, ${plans} plans attached, ${flagged} flagged for review`,
    { created, plans, flagged, companies: latest.size }
  );

  return { created, connected: true, flagged, plans };
}

/** Combines a YYYY-MM-DD date and optional HH:mm time into a Date, or null.
 * Defaults to the standard work-day start (06:30) when no time is given.
 * Safety net: if the AI returned a clearly past date (usually a wrong year),
 * roll the year forward so new jobs are never booked in the past.
 *
 * NOTE: the time is parsed in the SERVER's local timezone and stored as a
 * "floating" wall-clock instant. The calendar sync reads it back the same way
 * (see wallClock() in google/calendar.ts) and tags the event with BUSINESS_TZ,
 * so 06:30 stays 06:30 for the business. This only holds while the server's
 * timezone is stable — keep both halves in sync if that ever changes. */
function combineDateTime(date?: string, time?: string): Date | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "06:30";
  let d = new Date(`${date}T${t}:00`);
  if (isNaN(d.getTime())) return null;

  // More than a week in the past → almost certainly a wrong year. Bump it.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  for (let guard = 0; d < weekAgo && guard < 5; guard++) {
    d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), 0);
  }
  return d;
}

// Domains catch every staff member at a company (emily@, steve@, service@, …).
const DEFAULT_SOURCES = [
  { name: "Bellbrook Homes", displayName: "Bellbrook Homes", email: "bellbrookhomes.com.au" },
  { name: "Sterling Property Group", displayName: "Sterling Property Group", email: "sterlingproperty.com.au" },
  { name: "Coastline Developments", displayName: "Coastline Developments", email: "coastlinedev.com.au" },
];

/** Per-company hint for the AI extraction: how this client identifies its jobs. */
export function companyNamingHint(companyName: string): string {
  return (
    `This email is from ${companyName}. They identify each job by a job/site name ` +
    `(e.g. a client surname or project name) — use that name as the job title.`
  );
}

/** Seeds the default trusted senders, but ONLY on first run (empty table).
 * Re-seeding on every load would make deleted senders reappear. Always
 * backfills missing displayNames on known domains (idempotent). */
export async function ensureDefaultLeadSources(): Promise<void> {
  const count = await prisma.leadSource.count();
  if (count === 0) {
    for (const s of DEFAULT_SOURCES) {
      await prisma.leadSource.create({ data: s }).catch(() => {});
    }
    return;
  }
  // Existing installs: give known companies their pretty label once.
  for (const s of DEFAULT_SOURCES) {
    await prisma.leadSource
      .updateMany({ where: { email: s.email, displayName: null }, data: { displayName: s.displayName } })
      .catch(() => {});
  }
}
