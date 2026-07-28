// What the client actually picked — colours, finishes and hardware, per job.
//
// This is the question everyone asks and nobody can answer from memory three
// months later: which white are the doors, whose hinges, what handle. Held as
// named slots rather than a free-text note so a choice can be looked up, put on
// a workshop sheet, and compared across jobs. Anything that doesn't fit a slot
// goes in an "other" row, which is why custom slots survive a merge.
//
// The type is `SelectionEntry`, not `Selection`: the DOM already owns that name
// and shadowing it in a shared module is a trap for whoever imports this next.

export type SelectionGroup = "colour" | "hardware";

export type SlotDef = {
  key: string;
  label: string;
  group: SelectionGroup;
  /** Placeholder guidance — a real example, in the trade's own words. */
  hint: string;
};

/** The standard slots, in the order a kitchen gets specified. */
export const SELECTION_SLOTS: readonly SlotDef[] = [
  { key: "door", label: "Doors", group: "colour", hint: "Polytec Classic White, matt" },
  { key: "carcass", label: "Carcass", group: "colour", hint: "Polytec White Melamine" },
  { key: "benchtop", label: "Benchtop", group: "colour", hint: "Caesarstone Cloudburst, 20mm" },
  { key: "splashback", label: "Splashback", group: "colour", hint: "Glass, Dulux Natural White" },
  { key: "kickboards", label: "Kickboards", group: "colour", hint: "Matching doors" },
  { key: "handles", label: "Handles", group: "hardware", hint: "Kethy L560 160mm, brushed nickel" },
  { key: "hinges", label: "Hinges", group: "hardware", hint: "Blum Clip-top, soft close" },
  { key: "runners", label: "Runners", group: "hardware", hint: "Blum Tandembox 500mm" },
] as const;

/** Slot key used for anything that doesn't fit a standard row. */
export const OTHER_SLOT = "other";

export const GROUP_LABELS: Record<SelectionGroup, string> = {
  colour: "Colours & finishes",
  hardware: "Hardware",
};

export type SelectionEntry = {
  id?: string;
  slot: string;
  label: string;
  brand: string;
  code: string;
  colour: string;
  finish: string;
  supplier: string;
  notes: string;
  /** Document id of a swatch or product photo, when one has been attached. */
  photoId: string | null;
  position: number;
};

/** The free-text fields, in the order they read on a spec line. */
const VALUE_FIELDS = ["brand", "code", "colour", "finish", "supplier", "notes"] as const;

export function slotDef(key: string): SlotDef | null {
  return SELECTION_SLOTS.find((s) => s.key === key) ?? null;
}

/** Display name for a slot — a custom row carries its own label. */
export function slotLabel(entry: SelectionEntry): string {
  return entry.label.trim() || slotDef(entry.slot)?.label || "Other";
}

export function emptySelection(slot: string, label: string, position: number): SelectionEntry {
  return {
    slot,
    label,
    brand: "",
    code: "",
    colour: "",
    finish: "",
    supplier: "",
    notes: "",
    photoId: null,
    position,
  };
}

/** A blank set — every standard slot, in order, ready to be filled in. */
export function defaultSelections(): SelectionEntry[] {
  return SELECTION_SLOTS.map((s, i) => emptySelection(s.key, s.label, i));
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Normalise one untrusted row; null when it carries no usable slot. */
export function normaliseSelection(v: unknown, index: number): SelectionEntry | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const slot = str(r.slot) || OTHER_SLOT;
  const entry: SelectionEntry = {
    slot,
    label: str(r.label) || slotDef(slot)?.label || "",
    brand: str(r.brand),
    code: str(r.code),
    colour: str(r.colour),
    finish: str(r.finish),
    supplier: str(r.supplier),
    notes: str(r.notes),
    photoId: str(r.photoId) || null,
    position: num(r.position, index),
  };
  const id = str(r.id);
  if (id) entry.id = id;
  return entry;
}

/** Parse an untrusted list (request body, offline replay) into safe rows. */
export function parseSelections(v: unknown): SelectionEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(normaliseSelection)
    .filter((s): s is SelectionEntry => s !== null);
}

/** True once a row says anything at all. */
export function isFilled(entry: SelectionEntry): boolean {
  return VALUE_FIELDS.some((f) => entry[f] !== "");
}

/**
 * The one-line reading of a selection: brand and code first (that is what gets
 * ordered), then colour and finish (that is what gets looked at), then supplier.
 * Notes are deliberately left out — they are for the workshop, not the summary.
 */
export function selectionSummary(entry: SelectionEntry): string {
  const product = [entry.brand, entry.code].filter(Boolean).join(" ");
  const look = [entry.colour, entry.finish].filter(Boolean).join(", ");
  return [product, look, entry.supplier].filter(Boolean).join(" · ");
}

/**
 * Ensure every standard slot is present exactly once, keep any custom rows, and
 * order the lot: standard slots in specification order, custom rows after, by
 * their stored position. A stored set missing a slot (added after the job was
 * created) gains a blank one rather than silently going missing from the sheet.
 */
export function mergeWithSlots(stored: SelectionEntry[]): SelectionEntry[] {
  const byStandardSlot = new Map<string, SelectionEntry>();
  const custom: SelectionEntry[] = [];

  for (const entry of stored) {
    if (slotDef(entry.slot) && !byStandardSlot.has(entry.slot)) byStandardSlot.set(entry.slot, entry);
    else custom.push(entry);
  }

  const standard = SELECTION_SLOTS.map((slot, i) => {
    const found = byStandardSlot.get(slot.key);
    return found ? { ...found, label: found.label || slot.label, position: i } : emptySelection(slot.key, slot.label, i);
  });

  const extras = [...custom]
    .sort((a, b) => a.position - b.position)
    .map((entry, i) => ({ ...entry, position: SELECTION_SLOTS.length + i }));

  return [...standard, ...extras];
}

/** Just the rows worth showing at a glance, with their one-line reading. */
export function selectionChips(entries: SelectionEntry[]): { key: string; label: string; summary: string }[] {
  return entries.filter(isFilled).map((entry, i) => ({
    key: entry.id || `${entry.slot}-${i}`,
    label: slotLabel(entry),
    summary: selectionSummary(entry),
  }));
}

/** How many of the standard slots have been decided — the "3 of 8" progress. */
export function filledProgress(entries: SelectionEntry[]): { done: number; total: number } {
  const standard = entries.filter((e) => slotDef(e.slot) !== null);
  return { done: standard.filter(isFilled).length, total: SELECTION_SLOTS.length };
}
