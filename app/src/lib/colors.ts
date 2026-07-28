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
//
// The hues are hand-mixed rather than taken from Tailwind's default ramps: the
// stock tints are candy-bright and fight the warm stone shell, and a calendar
// is mostly colour blocks, so the fills set the tone of the whole screen. These
// are the same ten families knocked back to pigments you'd find in a workshop —
// clay, slate-blue, ochre, sage, mauve, dusty pink, eucalypt, apricot, denim,
// olive — each still clearly its own colour, none of them shouting over the
// brand orange.
export const COMPANY_PALETTE = [
  { dot: "bg-[#b07b5e]", bar: "border-[#b07b5e]", chip: "bg-[#f3e2d8] text-[#5c3722]", swatch: "bg-[#b07b5e]", block: "bg-[#eccdbe] text-[#46281a] dark:bg-[#4a3428] dark:text-[#f0dccf]" },
  { dot: "bg-[#6d8b95]", bar: "border-[#6d8b95]", chip: "bg-[#dfe9ec] text-[#274047]", swatch: "bg-[#6d8b95]", block: "bg-[#c9d4d8] text-[#1f3238] dark:bg-[#2c3a3f] dark:text-[#dceaef]" },
  { dot: "bg-[#c09a2e]", bar: "border-[#c09a2e]", chip: "bg-[#f6ead0] text-[#584312]", swatch: "bg-[#c09a2e]", block: "bg-[#ecd9a0] text-[#40320c] dark:bg-[#463c1c] dark:text-[#f4e6bd]" },
  { dot: "bg-[#7d9463]", bar: "border-[#7d9463]", chip: "bg-[#e4ecda] text-[#3a4a2a]", swatch: "bg-[#7d9463]", block: "bg-[#cbd8bd] text-[#2a361f] dark:bg-[#333f28] dark:text-[#e2ecd4]" },
  { dot: "bg-[#96789e]", bar: "border-[#96789e]", chip: "bg-[#ece2ee] text-[#4a3552]", swatch: "bg-[#96789e]", block: "bg-[#d8cfda] text-[#34263a] dark:bg-[#3b3040] dark:text-[#ebdff0]" },
  { dot: "bg-[#b2757f]", bar: "border-[#b2757f]", chip: "bg-[#f3dfe2] text-[#59303a]", swatch: "bg-[#b2757f]", block: "bg-[#e6c9cd] text-[#40222a] dark:bg-[#452a31] dark:text-[#f2dade]" },
  { dot: "bg-[#6b9285]", bar: "border-[#6b9285]", chip: "bg-[#dcebe5] text-[#2c493f]", swatch: "bg-[#6b9285]", block: "bg-[#c2d5cd] text-[#1f342c] dark:bg-[#2b3c35] dark:text-[#d8ece4]" },
  { dot: "bg-[#c08a55]", bar: "border-[#c08a55]", chip: "bg-[#f6e6d5] text-[#5c3c1c]", swatch: "bg-[#c08a55]", block: "bg-[#efd0b4] text-[#452c15] dark:bg-[#4a3722] dark:text-[#f5e2cd]" },
  { dot: "bg-[#7883a5]", bar: "border-[#7883a5]", chip: "bg-[#e2e5ef] text-[#333b58]", swatch: "bg-[#7883a5]", block: "bg-[#cbd0de] text-[#262c40] dark:bg-[#313648] dark:text-[#e0e5f0]" },
  { dot: "bg-[#9aa055]", bar: "border-[#9aa055]", chip: "bg-[#ebeed2] text-[#454a1f]", swatch: "bg-[#9aa055]", block: "bg-[#d7dcb4] text-[#333719] dark:bg-[#3b4023] dark:text-[#eaeecb]" },
] as const;

// `block` is the full-bleed cell fill (background + readable text, both
// themes): a board cell is painted in its client-company's colour, so a row of
// them reads as a run of clients before a word is read.
export type CompanyPalette = { dot: string; bar: string; chip: string; swatch: string; block: string };

/** djb2-ish hash → palette index. Stable across runs for the same key. */
function hashKey(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return h;
}

export function companyPalette(job: CompanyLike): CompanyPalette {
  return COMPANY_PALETTE[hashKey(companyKeyOf(job)) % COMPANY_PALETTE.length];
}

export type LegendEntry = { key: string; label: string; palette: CompanyPalette };

/**
 * The distinct client-companies among `jobs`, each with a colour — for the
 * calendar legend, and for the chips and board cells, which look up the same
 * map so what's on a day always matches its legend row. Deduped by company key,
 * sorted by label.
 *
 * Colours start from the stable per-company hash, so a company keeps its colour
 * across views and matches the Google Calendar sync. But if two companies IN
 * THIS SET land on the same swatch, the later one (by label) is bumped to the
 * next free slot, so everything on screen is distinguishable. With more
 * companies than palette entries some colours must repeat — the label resolves
 * it, which is exactly why the legend carries text and not just swatches.
 */
export function legendFor(jobs: CompanyLike[]): LegendEntry[] {
  const labelByKey = new Map<string, string>();
  for (const job of jobs) {
    const key = companyKeyOf(job);
    if (!labelByKey.has(key)) labelByKey.set(key, companyLabel(job));
  }

  const keys = [...labelByKey.keys()].sort((a, b) => labelByKey.get(a)!.localeCompare(labelByKey.get(b)!));
  const used = new Set<number>();

  return keys.map((key) => {
    let index = hashKey(key) % COMPANY_PALETTE.length;
    for (let guard = 0; used.has(index) && guard < COMPANY_PALETTE.length; guard++) {
      index = (index + 1) % COMPANY_PALETTE.length;
    }
    used.add(index);
    return { key, label: labelByKey.get(key)!, palette: COMPANY_PALETTE[index] };
  });
}

/**
 * A key → palette map from a legend, so a chip can colour a job the same way
 * the legend does: `map.get(companyKeyOf(job)) ?? companyPalette(job)`.
 */
export function paletteMap(entries: LegendEntry[]): Map<string, CompanyPalette> {
  return new Map(entries.map((e) => [e.key, e.palette]));
}

// Google Calendar event colour IDs are the strings "1".."11". Map each company
// onto one so the real Google Calendar is colour-coded by company too.
const GOOGLE_COLOR_IDS = ["1", "2", "3", "4", "5", "6", "7", "9", "10", "11"];

export function googleColorId(job: CompanyLike): string {
  return GOOGLE_COLOR_IDS[hashKey(companyKeyOf(job)) % GOOGLE_COLOR_IDS.length];
}
