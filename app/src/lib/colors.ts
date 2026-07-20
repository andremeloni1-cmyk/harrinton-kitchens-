// Per-company colour coding, shared by the in-app calendar (Tailwind classes)
// and the Google Calendar sync (Google's numeric colorId). Pure — no imports —
// so it can run on both the server and the client.

type CompanyLike = {
  companyId?: string | null;
  companyName?: string | null;
  leadSource?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
};

/** A stable key identifying the client-company a job belongs to. Prefers the
 * explicit companyId, then the resolved company name, then the trusted-sender
 * domain, then the site-contact name / email domain. */
export function companyKeyOf(job: CompanyLike): string {
  if (job.companyId) return `id:${job.companyId}`;
  if (job.companyName) return job.companyName.trim().toLowerCase();
  if (job.leadSource) return job.leadSource.trim().toLowerCase();
  if (job.clientName) return job.clientName.trim().toLowerCase();
  if (job.clientEmail) {
    const at = job.clientEmail.indexOf("@");
    if (at >= 0) return job.clientEmail.slice(at + 1).trim().toLowerCase();
    return job.clientEmail.trim().toLowerCase();
  }
  return "—";
}

/** A short, human label for a job's client-company. Prefers the resolved
 * company name, then the site-contact name, then the sender. */
export function companyLabel(job: CompanyLike): string {
  if (job.companyName) return job.companyName.trim();
  if (job.clientName) return job.clientName.trim();
  if (job.leadSource) return job.leadSource.trim();
  if (job.clientEmail) return job.clientEmail.trim();
  return "Other";
}

// Deterministic, well-separated palette. Each entry's classes are written as
// full literal strings so Tailwind's content scanner keeps them in the build.
export const COMPANY_PALETTE = [
  { dot: "bg-rose-500", bar: "border-rose-400", chip: "bg-rose-50 text-rose-700", swatch: "bg-rose-400" },
  { dot: "bg-sky-500", bar: "border-sky-400", chip: "bg-sky-50 text-sky-700", swatch: "bg-sky-400" },
  { dot: "bg-amber-500", bar: "border-amber-400", chip: "bg-amber-50 text-amber-700", swatch: "bg-amber-400" },
  { dot: "bg-emerald-500", bar: "border-emerald-400", chip: "bg-emerald-50 text-emerald-700", swatch: "bg-emerald-400" },
  { dot: "bg-violet-500", bar: "border-violet-400", chip: "bg-violet-50 text-violet-700", swatch: "bg-violet-400" },
  { dot: "bg-fuchsia-500", bar: "border-fuchsia-400", chip: "bg-fuchsia-50 text-fuchsia-700", swatch: "bg-fuchsia-400" },
  { dot: "bg-teal-500", bar: "border-teal-400", chip: "bg-teal-50 text-teal-700", swatch: "bg-teal-400" },
  { dot: "bg-orange-500", bar: "border-orange-400", chip: "bg-orange-50 text-orange-700", swatch: "bg-orange-400" },
  { dot: "bg-indigo-500", bar: "border-indigo-400", chip: "bg-indigo-50 text-indigo-700", swatch: "bg-indigo-400" },
  { dot: "bg-lime-600", bar: "border-lime-500", chip: "bg-lime-50 text-lime-700", swatch: "bg-lime-500" },
] as const;

export type CompanyPalette = (typeof COMPANY_PALETTE)[number];

/** djb2-ish hash → palette index. Stable across runs for the same key. */
function hashKey(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return h;
}

export function companyPalette(job: CompanyLike): CompanyPalette {
  return COMPANY_PALETTE[hashKey(companyKeyOf(job)) % COMPANY_PALETTE.length];
}

// Google Calendar event colour IDs are the strings "1".."11". Map each company
// onto one so the real Google Calendar is colour-coded by company too.
const GOOGLE_COLOR_IDS = ["1", "2", "3", "4", "5", "6", "7", "9", "10", "11"];

export function googleColorId(job: CompanyLike): string {
  return GOOGLE_COLOR_IDS[hashKey(companyKeyOf(job)) % GOOGLE_COLOR_IDS.length];
}
