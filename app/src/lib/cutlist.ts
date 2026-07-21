// The cut-list data shape (P8) — extracted from a CAD job PDF, reviewed, then
// saved as Cabinet/Part rows. Pure and testable; shared by the AI extractor,
// the review screen and the confirm route.

export type ExtractedPart = {
  name: string;
  material: string;
  edging: string;
  widthMm: number | null;
  heightMm: number | null;
  qty: number;
};

export type ExtractedCabinet = { name: string; parts: ExtractedPart[] };
export type ExtractedHardware = { name: string; qty: number };
export type CutList = { cabinets: ExtractedCabinet[]; hardware: ExtractedHardware[] };

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function qty(v: unknown): number {
  const n = num(v);
  return n != null && n > 0 ? n : 1;
}

function normPart(v: unknown): ExtractedPart | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const name = str(r.name);
  if (!name) return null;
  return {
    name,
    material: str(r.material),
    edging: str(r.edging),
    widthMm: num(r.widthMm ?? r.width),
    heightMm: num(r.heightMm ?? r.height),
    qty: qty(r.qty),
  };
}

/** Coerce a raw (AI or edited) object into a well-formed CutList. */
export function normalizeCutList(raw: unknown): CutList {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cabinets = Array.isArray(r.cabinets)
    ? r.cabinets
        .map((c): ExtractedCabinet | null => {
          if (!c || typeof c !== "object") return null;
          const cr = c as Record<string, unknown>;
          const name = str(cr.name);
          if (!name) return null;
          const parts = Array.isArray(cr.parts) ? cr.parts.map(normPart).filter((p): p is ExtractedPart => p !== null) : [];
          return { name, parts };
        })
        .filter((c): c is ExtractedCabinet => c !== null)
    : [];
  const hardware = Array.isArray(r.hardware)
    ? r.hardware
        .map((h): ExtractedHardware | null => {
          if (!h || typeof h !== "object") return null;
          const hr = h as Record<string, unknown>;
          const name = str(hr.name);
          return name ? { name, qty: qty(hr.qty) } : null;
        })
        .filter((h): h is ExtractedHardware => h !== null)
    : [];
  return { cabinets, hardware };
}

export function cutListSummary(cl: CutList): { cabinets: number; parts: number; hardware: number } {
  return {
    cabinets: cl.cabinets.length,
    parts: cl.cabinets.reduce((s, c) => s + c.parts.length, 0),
    hardware: cl.hardware.length,
  };
}

export function isEmptyCutList(cl: CutList): boolean {
  const s = cutListSummary(cl);
  return s.cabinets === 0 && s.parts === 0 && s.hardware === 0;
}
