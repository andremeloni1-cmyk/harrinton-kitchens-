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

/**
 * The services whose positions get pinned on site.
 *
 * `power` is a power point (GPO) — the thing the electrician has to land, and
 * the single most common cause of a cabinet being cut on site. `waste` is
 * separate from `water` because the plumber's supply and his drain rarely come
 * out of the same place and a sink cabinet has to clear both.
 */
export type ServiceKind = "power" | "water" | "waste" | "gas" | "data";

export const SERVICE_KINDS: ServiceKind[] = ["power", "water", "waste", "gas", "data"];

export const SERVICE_LABELS: Record<ServiceKind, string> = {
  power: "Power point",
  water: "Water",
  waste: "Waste",
  gas: "Gas",
  data: "Data",
};

/**
 * One service pinned to a position in the room.
 *
 * Position is the same wall-plus-offset the openings use, and is optional for
 * the same reason: a site sheet often says "GPO behind the fridge" and nothing
 * more. A point without a position is still worth recording — it just gets
 * listed beside the plan rather than drawn on it.
 *
 * `existing` separates what is on the wall today from what the trade still has
 * to provide, which is the difference between a measurement and a work order.
 */
export type ServicePoint = {
  id: string;
  kind: ServiceKind;
  label: string;
  /** Wall label this point sits on, e.g. "Wall A". */
  wall?: string;
  /** Distance from the start of that wall, in mm. */
  offsetMm: number | null;
  /** Height off the finished floor, in mm. */
  heightMm: number | null;
  /** Outlets/taps at this point — a double GPO is 2. */
  qty: number;
  /** True when it is already on site; false when a trade still has to run it. */
  existing: boolean;
  notes: string;
};

export type Room = {
  id: string;
  name: string;
  ceilingMm: number | null;
  walls: Measurement[]; // wall runs
  openings: Measurement[]; // doors / windows
  services: RoomServices; // free-text power / water / gas notes (pre-dates servicePoints)
  servicePoints: ServicePoint[]; // positioned power points, water, waste, gas, data
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
    servicePoints: [],
    appliances: "",
    notes: "",
    photoIds: [],
  };
}

export function emptyServicePoint(id: string, kind: ServiceKind = "power"): ServicePoint {
  return {
    id,
    kind,
    label: "",
    offsetMm: null,
    // Bench height for a power point, the usual splashback GPO. Everything
    // else starts blank because there is no sensible default to guess.
    heightMm: kind === "power" ? 1100 : null,
    qty: kind === "power" ? 2 : 1,
    existing: true,
    notes: "",
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

function isServiceKind(v: unknown): v is ServiceKind {
  return typeof v === "string" && (SERVICE_KINDS as string[]).includes(v);
}

function normServicePoints(v: unknown, roomIndex: number): ServicePoint[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((p, i): ServicePoint | null => {
      if (!p || typeof p !== "object") return null;
      const r = p as Record<string, unknown>;
      // An unrecognised kind falls back to power rather than dropping the row:
      // losing a recorded position silently is worse than mislabelling one.
      const kind = isServiceKind(r.kind) ? r.kind : "power";
      const qty = num(r.qty);
      const out: ServicePoint = {
        id: typeof r.id === "string" && r.id ? r.id : `r${roomIndex + 1}-sp-${i + 1}`,
        kind,
        label: str(r.label),
        offsetMm: num(r.offsetMm),
        heightMm: num(r.heightMm),
        qty: qty != null && qty > 0 ? Math.floor(qty) : 1,
        // Anything not explicitly marked as "to be provided" is read as already
        // on site, which is what an unqualified note on a site sheet means.
        existing: r.existing !== false,
        notes: str(r.notes),
      };
      if (typeof r.wall === "string" && r.wall.trim()) out.wall = r.wall.trim();
      return out;
    })
    .filter((p): p is ServicePoint => p !== null);
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
    servicePoints: normServicePoints(r.servicePoints, i),
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

/** How many points of each service were recorded in a room. */
export function serviceCounts(room: Room): Record<ServiceKind, number> {
  const counts = { power: 0, water: 0, waste: 0, gas: 0, data: 0 };
  for (const p of room.servicePoints) counts[p.kind] += 1;
  return counts;
}

/**
 * A service point's position in words — "Wall A, 1200 from start, 1100 high".
 * Empty when nothing about the position was captured, so the caller can fall
 * back to the label rather than print a stub.
 */
export function servicePosition(point: ServicePoint): string {
  const parts: string[] = [];
  if (point.wall) parts.push(point.wall);
  if (point.offsetMm != null) parts.push(`${point.offsetMm} from start`);
  if (point.heightMm != null) parts.push(`${point.heightMm} high`);
  return parts.join(", ");
}

/** True once a service point can be placed on a drawn plan. */
export function isPlaceable(point: ServicePoint): boolean {
  return Boolean(point.wall) && point.offsetMm != null && point.offsetMm >= 0;
}

/** A one-line summary of what's been captured for a room. */
export function roomSummary(room: Room): string {
  const parts: string[] = [];
  const wallCount = room.walls.filter((w) => w.mm != null).length;
  if (wallCount) parts.push(`${wallCount} wall${wallCount === 1 ? "" : "s"}`);
  if (room.ceilingMm != null) parts.push(`ceiling ${room.ceilingMm}mm`);
  const openCount = room.openings.filter((o) => o.mm != null).length;
  if (openCount) parts.push(`${openCount} opening${openCount === 1 ? "" : "s"}`);
  const counts = serviceCounts(room);
  // Power and water are called out by name because they are what gets asked
  // about later; the rest fold into one count so the line stays readable.
  if (counts.power) parts.push(`${counts.power} power`);
  if (counts.water) parts.push(`${counts.water} water`);
  const other = counts.waste + counts.gas + counts.data;
  if (other) parts.push(`${other} other service${other === 1 ? "" : "s"}`);
  if (room.photoIds.length) parts.push(`${room.photoIds.length} photo${room.photoIds.length === 1 ? "" : "s"}`);
  return parts.join(" · ") || "Nothing captured yet";
}

/** True once a room has at least one real dimension — the "captured" bar. */
export function roomHasData(room: Room): boolean {
  return room.ceilingMm != null || room.walls.some((w) => w.mm != null) || room.openings.some((o) => o.mm != null);
}
