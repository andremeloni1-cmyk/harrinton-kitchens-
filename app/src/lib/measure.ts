// The check-measure data model — structured rooms captured on site. Kept pure
// so parsing/normalising and summaries are unit-testable and shared by the
// capture form, the AI site-sheet reader (P5.3) and the discrepancy hook (P5.4).

// A labelled measurement in millimetres (the trade works in mm).
//
// Openings carry two extra, optional hints: which wall they sit in and how far
// along it they start. Both are optional because a hand-drawn mudmap often
// doesn't say — a plan drawn from this places the ones it knows and lists the
// rest rather than inventing positions.
export type Measurement = {
  label: string;
  mm: number | null;
  /** Wall label this opening belongs to, e.g. "Wall A". Openings only. */
  wall?: string;
  /** Distance from the start of that wall to the opening, in mm. */
  offsetMm?: number | null;
};

export type RoomServices = { power: string; water: string; gas: string };

export type Room = {
  id: string;
  name: string;
  ceilingMm: number | null;
  walls: Measurement[]; // wall runs
  openings: Measurement[]; // doors / windows
  services: RoomServices; // power / water / gas positions
  appliances: string; // free-text list, one per line
  notes: string;
  photoIds: string[]; // attached document ids
};

export type CheckMeasureData = { rooms: Room[] };

export function emptyRoom(id: string, name = "Kitchen"): Room {
  return {
    id,
    name,
    ceilingMm: null,
    walls: [{ label: "Wall A", mm: null }],
    openings: [],
    services: { power: "", water: "", gas: "" },
    appliances: "",
    notes: "",
    photoIds: [],
  };
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normMeasurements(v: unknown): Measurement[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((m): Measurement | null => {
      if (!m || typeof m !== "object") return null;
      const r = m as Record<string, unknown>;
      const out: Measurement = { label: typeof r.label === "string" ? r.label : "", mm: num(r.mm) };
      // Only carried when present, so a wall run stays a plain {label, mm}.
      if (typeof r.wall === "string" && r.wall.trim()) out.wall = r.wall.trim();
      const offset = num(r.offsetMm);
      if (offset != null) out.offsetMm = offset;
      return out;
    })
    .filter((m): m is Measurement => m !== null);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normRoom(v: unknown, i: number): Room | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const services = (r.services && typeof r.services === "object" ? r.services : {}) as Record<string, unknown>;
  return {
    id: typeof r.id === "string" && r.id ? r.id : `room-${i + 1}`,
    name: str(r.name) || `Room ${i + 1}`,
    ceilingMm: num(r.ceilingMm),
    walls: normMeasurements(r.walls),
    openings: normMeasurements(r.openings),
    services: { power: str(services.power), water: str(services.water), gas: str(services.gas) },
    appliances: str(r.appliances),
    notes: str(r.notes),
    photoIds: Array.isArray(r.photoIds) ? r.photoIds.filter((x): x is string => typeof x === "string") : [],
  };
}

/** Parse the stored JSON into a safe, well-formed CheckMeasureData. */
export function parseMeasure(raw: string | null | undefined): CheckMeasureData {
  if (!raw) return { rooms: [] };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { rooms: [] };
  }
  const rooms = data && typeof data === "object" && Array.isArray((data as { rooms?: unknown }).rooms)
    ? (data as { rooms: unknown[] }).rooms
    : [];
  return { rooms: rooms.map(normRoom).filter((r): r is Room => r !== null) };
}

/** A one-line summary of what's been captured for a room. */
export function roomSummary(room: Room): string {
  const parts: string[] = [];
  const wallCount = room.walls.filter((w) => w.mm != null).length;
  if (wallCount) parts.push(`${wallCount} wall${wallCount === 1 ? "" : "s"}`);
  if (room.ceilingMm != null) parts.push(`ceiling ${room.ceilingMm}mm`);
  const openCount = room.openings.filter((o) => o.mm != null).length;
  if (openCount) parts.push(`${openCount} opening${openCount === 1 ? "" : "s"}`);
  if (room.photoIds.length) parts.push(`${room.photoIds.length} photo${room.photoIds.length === 1 ? "" : "s"}`);
  return parts.join(" · ") || "Nothing captured yet";
}

/** True once a room has at least one real dimension — the "captured" bar. */
export function roomHasData(room: Room): boolean {
  return room.ceilingMm != null || room.walls.some((w) => w.mm != null) || room.openings.some((o) => o.mm != null);
}
