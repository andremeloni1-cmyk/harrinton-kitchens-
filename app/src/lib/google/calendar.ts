import { google } from "googleapis";
import { getAuthorizedClient } from "./oauth";
import { prisma } from "@/lib/db";
import { workdaySegments, businessTimeZone } from "@/lib/schedule";
import { googleColorId } from "@/lib/colors";
import { BRAND, INTERNAL } from "@/lib/brand";

type JobLike = {
  id: string;
  reference: string;
  title: string;
  description?: string | null;
  address?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  leadSource?: string | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  durationMins: number;
  googleEventId?: string | null;
};

async function calendarId(): Promise<string> {
  const account = await prisma.account.findFirst();
  return account?.calendarId || "primary";
}

/** Wall-clock "YYYY-MM-DDTHH:mm:ss" (no offset) so Google applies the business
 * timeZone, keeping 6:30am as 6:30am regardless of the server's timezone. */
function wallClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function buildDescription(job: JobLike, docLinks: string[] = []): string {
  const lines = [
    job.description || "",
    "",
    `Reference: ${job.reference}`,
    job.clientName ? `Client: ${job.clientName}` : "",
    job.clientEmail ? `Email: ${job.clientEmail}` : "",
    "",
  ];
  if (docLinks.length) {
    lines.push("📎 Job documents:");
    docLinks.forEach((l) => lines.push(l));
  }
  lines.push("", `Managed by ${BRAND.name} • ${process.env.APP_URL || ""}/jobs/${job.id}`);
  return lines.filter((l) => l !== undefined).join("\n");
}

/**
 * Syncs a job to Google Calendar as one event per working day (6:30am–3:00pm),
 * so multi-day jobs show across each day. Previous events for the job are
 * removed first (the day-count can change), then fresh events are inserted.
 * Returns the new event ids, or null in demo mode (Google not connected).
 */
export async function upsertJobEvent(
  job: JobLike,
  docLinks: string[] = [],
  previousEventIds: string[] = []
): Promise<string[] | null> {
  const auth = await getAuthorizedClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const calId = await calendarId();
  const tz = businessTimeZone();

  // Clear any events we created before (count may change between syncs).
  for (const id of previousEventIds) {
    try {
      await calendar.events.delete({ calendarId: calId, eventId: id });
    } catch {
      /* already gone */
    }
  }

  const start = job.scheduledStart ? new Date(job.scheduledStart) : new Date();
  const segments = workdaySegments(start, job.durationMins);
  const multiDay = segments.length > 1;
  // Colour the event by company so the Google Calendar is visually grouped.
  const colorId = googleColorId(job);

  const ids: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const summary = multiDay
      ? `🔨 ${job.title} (day ${i + 1}/${segments.length})`
      : `🔨 ${job.title}`;
    const res = await calendar.events.insert({
      calendarId: calId,
      requestBody: {
        summary,
        description: buildDescription(job, docLinks),
        location: job.address || undefined,
        colorId,
        start: { dateTime: wallClock(seg.start), timeZone: tz },
        end: { dateTime: wallClock(seg.end), timeZone: tz },
        extendedProperties: { private: { [INTERNAL.calendarJobIdKey]: job.id } },
      },
    });
    if (res.data.id) ids.push(res.data.id);
  }
  return ids;
}

export type ExternalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
};

/**
 * Lists the owner's existing Google Calendar events in a window, so the app's
 * calendar can show prior commitments when scheduling. Excludes events this app
 * created for jobs (those are already rendered from the DB). Returns null in
 * demo mode (Google not connected).
 */
export async function listEvents(timeMin: Date, timeMax: Date): Promise<ExternalEvent[] | null> {
  const auth = await getAuthorizedClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: await calendarId(),
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  return (res.data.items || [])
    .filter((e) => e.status !== "cancelled")
    .filter((e) => !e.extendedProperties?.private?.[INTERNAL.calendarJobIdKey])
    .map((e) => ({
      id: e.id || "",
      title: e.summary || "(busy)",
      start: e.start?.dateTime || e.start?.date || "",
      end: e.end?.dateTime || e.end?.date || "",
      allDay: Boolean(e.start?.date),
    }))
    .filter((e) => e.start);
}

/**
 * Reads back the events this app created (tagged with INTERNAL.calendarJobIdKey), returning
 * the earliest event start per job. Used to detect jobs the owner moved directly
 * in Google Calendar so the app can reflect the change. Empty in demo mode.
 */
export async function listJobEventStarts(): Promise<Map<string, { start: Date; allDay: boolean }>> {
  const out = new Map<string, { start: Date; allDay: boolean }>();
  const auth = await getAuthorizedClient();
  if (!auth) return out;

  const calendar = google.calendar({ version: "v3", auth });
  const now = Date.now();
  const res = await calendar.events.list({
    calendarId: await calendarId(),
    timeMin: new Date(now - 14 * 86_400_000).toISOString(),
    timeMax: new Date(now + 120 * 86_400_000).toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });

  for (const e of res.data.items || []) {
    if (e.status === "cancelled") continue;
    const jobId = e.extendedProperties?.private?.[INTERNAL.calendarJobIdKey];
    const startStr = e.start?.dateTime || e.start?.date;
    if (!jobId || !startStr) continue;
    const start = new Date(startStr);
    const prev = out.get(jobId);
    if (!prev || start < prev.start) out.set(jobId, { start, allDay: Boolean(e.start?.date) });
  }
  return out;
}

export async function deleteJobEvent(eventIds?: string | string[] | null): Promise<boolean> {
  const ids = (Array.isArray(eventIds) ? eventIds : [eventIds]).filter(Boolean) as string[];
  if (ids.length === 0) return false;
  const auth = await getAuthorizedClient();
  if (!auth) return false;
  const calendar = google.calendar({ version: "v3", auth });
  const calId = await calendarId();
  let any = false;
  for (const id of ids) {
    try {
      await calendar.events.delete({ calendarId: calId, eventId: id });
      any = true;
    } catch {
      /* already gone */
    }
  }
  return any;
}
