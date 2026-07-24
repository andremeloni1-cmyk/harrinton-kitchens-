import Anthropic from "@anthropic-ai/sdk";

// Reads job-detail images (PNG/JPG/etc.) with Claude vision and extracts a
// clean title + description. Returns null when not configured (no API key) or
// on error, so the caller falls back to the email body.

export type JobImage = { filename: string; data: Buffer; mimeType: string };

const SUPPORTED: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

export function visionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function mediaType(mime: string): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  return SUPPORTED[mime.toLowerCase()] || null;
}

export type ExtractedJob = {
  title: string;
  description: string;
  reference?: string; // quote/PO number, e.g. QU3082
  clientName?: string; // builder + contact, e.g. "Fairmont Homes — Greg"
  clientPhone?: string;
  address?: string;
  date?: string; // YYYY-MM-DD install date (the schedule column's date)
  time?: string; // HH:mm 24h if a time is stated
  durationMins?: number;
  days?: number; // number of working days (cells the job spans)
  attachments?: string[]; // exact attachment filenames belonging to this job
};

/**
 * Reads a job enquiry email (text + any attached images) and splits it into the
 * separate jobs it contains, each with its own details. Returns
 * `{ ok: true, jobs }` when the model ran (jobs may be empty), and
 * `{ ok: false }` on a transient API/network error — so the caller can retry a
 * failed scan instead of collapsing a multi-job email into one junk job.
 *
 * PDFs are NOT sent to the model (too costly) — only their filenames are listed,
 * so the model can match each attachment to the right job by name.
 */
export async function extractJobsFromEmail(input: {
  subject: string;
  body: string;
  images: JobImage[];
  pdfNames?: string[];
  /** Per-company naming-convention hint (e.g. mii Kitchens' QU references). */
  companyHint?: string;
}): Promise<{ ok: true; jobs: ExtractedJob[] } | { ok: false }> {
  if (!visionConfigured()) return { ok: true, jobs: [] };

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  // The model doesn't know today's date — without it, a bare date like "3 July"
  // gets a wrong (usually past) year. Give it the current date in the business tz.
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: process.env.BUSINESS_TZ || "Australia/Sydney",
  }); // YYYY-MM-DD

  const content: Anthropic.ContentBlockParam[] = input.images
    .map((img) => ({ ...img, media: mediaType(img.mimeType) }))
    .filter((img) => img.media)
    .slice(0, 16)
    .map((img) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: img.media!, data: img.data.toString("base64") },
    }));

  const pdfList = (input.pdfNames || []).filter(Boolean);
  const attachmentsNote = pdfList.length
    ? `Attached PDF files (NOT shown — match by filename only): ${pdfList.map((n) => `"${n}"`).join(", ")}. ` +
      "For each job, list in `attachments` the exact filename(s) above that belong to it (e.g. its drawing or " +
      "purchase order), matching on the quote/reference number or site name in the filename. Leave it empty if unsure.\n\n"
    : "";

  content.push({
    type: "text",
    text:
      `Today's date is ${today}. When a date has no year, resolve it to the SOONEST upcoming occurrence on or after today — never in the past.\n\n` +
      (input.companyHint ? `${input.companyHint}\n\n` : "") +
      "This is an email from a kitchen/joinery company assigning installation jobs to a fitter. It usually " +
      "contains an INSTALLATION SCHEDULE shown as a weekly calendar grid (an attached image and/or a table): " +
      "the columns are weekdays with a date header like \"Monday June 29\" or \"Friday July 10\", and each " +
      "filled/coloured cell is one job booked for that day. Blank cells are days with no job.\n\n" +
      "Read the schedule and extract each distinct job. CRUCIAL rules:\n" +
      "- The job's install `date` is the DATE OF THE COLUMN the cell sits under (resolve to YYYY-MM-DD). " +
      "For example a cell under \"Friday July 10\" is scheduled for that Friday.\n" +
      "- IGNORE any 'CONFIRMED DD.MM.YY' date written INSIDE the cell — that is the confirmation date, NOT the install date.\n" +
      "- If the SAME job (same QU quote number) appears in several consecutive day cells, it is ONE multi-day job: " +
      "output it ONCE with `date` = the first day it appears and `days` = the number of cells it spans.\n" +
      "- A cell typically reads like: 'CONFIRMED 23.06.26 FAIRMONT HOMES GREG 0412 228 232 QU3082 LOT 6207, " +
      "3 NAUTICA CRESCENT, SHELLCOVE (LAMI) KITCHEN, LAUNDRY, X4 VANITY'. From a cell capture: `reference` = the " +
      "QU number (e.g. QU3082); `clientName` = the builder and contact person (e.g. 'Fairmont Homes — Greg'); " +
      "`clientPhone` = the phone number if present; `address` = the lot/street/suburb; `description` = the material " +
      "(e.g. LAMI/POLY) plus the scope/rooms; `title` = a short name that INCLUDES the QU number (e.g. " +
      "'QU3082 Fairmont Homes — Shellcove kitchen').\n\n" +
      "Also handle a plain enquiry email with no grid by extracting the single job it describes.\n\n" +
      "Do NOT create jobs from, and return an EMPTY array for: maintenance/report requests, requests for photos/" +
      "paperwork, cancellations, or general correspondence with no bookable job. Never invent dates or addresses.\n\n" +
      attachmentsNote +
      `Email subject: ${input.subject}\n\nEmail body:\n${input.body || "(no text body)"}\n\n` +
      "Respond as JSON: { jobs: [ { title, reference, clientName, clientPhone, description, address, date, time, durationMins, days, attachments } ] }. " +
      "Return an empty array if there are no bookable jobs.",
  });

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 2000,
      messages: [{ role: "user", content }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              jobs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    reference: { type: "string" },
                    clientName: { type: "string" },
                    clientPhone: { type: "string" },
                    description: { type: "string" },
                    address: { type: "string" },
                    date: { type: "string" },
                    time: { type: "string" },
                    durationMins: { type: "number" },
                    days: { type: "number" },
                    attachments: { type: "array", items: { type: "string" } },
                  },
                  required: ["title", "description"],
                  additionalProperties: false,
                },
              },
            },
            required: ["jobs"],
            additionalProperties: false,
          },
        },
      },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return { ok: true, jobs: [] };
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return { ok: true, jobs: [] };
    const parsed = JSON.parse(text.text) as { jobs?: ExtractedJob[] };
    return { ok: true, jobs: Array.isArray(parsed.jobs) ? parsed.jobs.slice(0, 20) : [] };
  } catch {
    // A transient API/network error — distinct from "ran, found no jobs" so the
    // caller retries the scan rather than marking the email processed.
    return { ok: false };
  }
}

export async function analyzeJobImages(
  images: JobImage[]
): Promise<{ title?: string; description: string } | null> {
  if (!visionConfigured()) return null;

  const usable = images
    .map((img) => ({ ...img, media: mediaType(img.mimeType) }))
    .filter((img) => img.media);
  if (usable.length === 0) return null;

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const content: Anthropic.ContentBlockParam[] = usable.map((img) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.media!, data: img.data.toString("base64") },
  }));
  content.push({
    type: "text",
    text:
      "These image(s) are attachments from a kitchen job enquiry emailed by a kitchen/joinery company. " +
      "Read them and extract the job details a joiner would need. Capture measurements, materials, " +
      "quantities, room/location, the client or site address, and any reference/order numbers shown. " +
      "Respond as JSON with `title` (a short job title, max ~60 chars) and `description` " +
      "(a clear plain-text brief of the work required). Omit a field only if nothing relevant is visible.",
  });

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
            },
            required: ["description"],
            additionalProperties: false,
          },
        },
      },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const parsed = JSON.parse(text.text) as { title?: string; description?: string };
    if (!parsed.description) return null;
    return { title: parsed.title?.trim() || undefined, description: parsed.description.trim() };
  } catch {
    return null;
  }
}
