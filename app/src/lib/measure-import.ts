// Import room dimensions from pasted text.
//
// Measurements arrive from site in whatever form the person holding the laser
// had to hand: a column pasted out of a spreadsheet, a text message typed at
// the kerb, the notes app, an export from a measuring app. Retyping forty
// dimensions into a form is where the errors come from, so this reads what
// they already have.
//
// Two shapes are accepted, and which one you pasted is detected rather than
// declared:
//
//   Delimited (CSV/TSV, with a header row naming the columns)
//     room,type,label,mm,wall,offset,height,qty
//     Kitchen,wall,Wall A,3600
//     Kitchen,power,Fridge GPO,,Wall A,2400,1750,1
//
//   Freeform (a room name, then one measurement per line)
//     Kitchen
//     ceiling 2400
//     wall A 3600
//     window 1200 @ wall A 800
//     power double GPO x2 @ wall A 2400 h1100
//     water sink mixer @ wall A 900
//
// Nothing here invents a dimension. A line that can't be read comes back as a
// warning against its line number so the importer can show it rather than
// silently dropping it — a quietly missing wall is far worse than a visible
// "couldn't read line 12".

import {
  emptyRoom,
  SERVICE_KINDS,
  type Measurement,
  type Room,
  type ServiceKind,
  type ServicePoint,
} from "./measure";

export type ImportWarning = { line: number; text: string; reason: string };

export type ImportResult = {
  rooms: Room[];
  warnings: ImportWarning[];
  /** How the paste was read, so the UI can say which shape it detected. */
  format: "delimited" | "freeform" | "empty";
};

// What each row type means, and the synonyms a real site sheet uses for it.
const ROW_TYPES = {
  wall: ["wall", "run", "walls"],
  opening: ["opening", "door", "window", "doorway", "archway", "arch", "cased opening"],
  ceiling: ["ceiling", "height", "ceiling height"],
  power: ["power", "powerpoint", "power point", "gpo", "outlet", "socket", "powerpoints"],
  water: ["water", "tap", "mixer", "supply", "plumbing", "cold", "hot"],
  waste: ["waste", "drain", "drainage", "trap", "sewer"],
  gas: ["gas", "gas point", "bayonet"],
  data: ["data", "comms", "ethernet", "network", "tv", "antenna"],
  appliance: ["appliance", "appliances"],
  note: ["note", "notes", "comment"],
  room: ["room", "area", "space"],
} as const;

type RowType = keyof typeof ROW_TYPES;

function matchRowType(word: string): RowType | null {
  const w = word.trim().toLowerCase().replace(/[:.]+$/, "");
  if (!w) return null;
  for (const [type, synonyms] of Object.entries(ROW_TYPES) as [RowType, readonly string[]][]) {
    if (synonyms.includes(w)) return type;
  }
  return null;
}

function asServiceKind(type: RowType): ServiceKind | null {
  return (SERVICE_KINDS as string[]).includes(type) ? (type as ServiceKind) : null;
}

/**
 * A dimension out of free text.
 *
 * Metres and centimetres are converted rather than rejected, because a site
 * sheet written in metres is still a site sheet — but a bare number is always
 * read as mm, which is what the trade actually writes. The two-digit guard
 * stops "3.6" being read as 3mm.
 */
export function parseMm(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/,/g, "");
  const m = /^(\d+(?:\.\d+)?)\s*(mm|cm|m)?$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  const unit = m[2] || (t.includes(".") ? "m" : "mm");
  const mm = unit === "m" ? n * 1000 : unit === "cm" ? n * 10 : n;
  return Math.round(mm);
}

// ---------------------------------------------------------------------------
// Delimited (CSV / TSV)
// ---------------------------------------------------------------------------

/** Split one delimited line, honouring double quotes around a field. */
export function splitDelimited(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(field.trim());
      field = "";
    } else field += ch;
  }
  out.push(field.trim());
  return out;
}

const HEADER_ALIASES: Record<string, string> = {
  room: "room",
  area: "room",
  type: "type",
  kind: "type",
  category: "type",
  label: "label",
  name: "label",
  description: "label",
  mm: "mm",
  size: "mm",
  length: "mm",
  width: "mm",
  dimension: "mm",
  wall: "wall",
  offset: "offset",
  from: "offset",
  position: "offset",
  height: "height",
  h: "height",
  qty: "qty",
  quantity: "qty",
  count: "qty",
  notes: "notes",
  note: "notes",
  existing: "existing",
};

function headerMap(cells: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  cells.forEach((cell, i) => {
    const key = HEADER_ALIASES[cell.trim().toLowerCase()];
    if (key && !(key in map)) map[key] = i;
  });
  // A header row has to name at least a type and a room, otherwise a freeform
  // paste whose first line happens to say "Kitchen" would be eaten as a header.
  return "type" in map && "room" in map ? map : null;
}

function detectDelimiter(line: string): string | null {
  if (line.includes("\t")) return "\t";
  if (line.includes(",")) return ",";
  if (line.includes(";")) return ";";
  return null;
}

// ---------------------------------------------------------------------------
// Building rooms
// ---------------------------------------------------------------------------

class RoomBuilder {
  private rooms: Room[] = [];
  private index = new Map<string, Room>();
  private seq = 0;

  constructor(private idFor: (n: number) => string) {}

  /** The room with this name, created on first mention. */
  get(name: string): Room {
    const key = name.trim().toLowerCase() || "room";
    const found = this.index.get(key);
    if (found) return found;
    const room = emptyRoom(this.idFor(this.seq++), name.trim() || `Room ${this.rooms.length + 1}`);
    // emptyRoom seeds a blank "Wall A" so the hand-entry form opens with a row
    // to type into. An import supplies its own walls, so drop the placeholder.
    room.walls = [];
    this.index.set(key, room);
    this.rooms.push(room);
    return room;
  }

  get all(): Room[] {
    return this.rooms;
  }
}

function defaultWallLabel(room: Room): string {
  return `Wall ${String.fromCharCode(65 + room.walls.length)}`;
}

/**
 * Normalise however the wall was written into the "Wall A" the rest of the app
 * uses. People write "wall A", "A" and "1" for the same thing, and the plan
 * matches openings to walls by label — so a wall that imports as "A" while its
 * openings say "Wall A" would silently fail to place any of them.
 */
function normaliseWallLabel(raw: string, room: Room): string {
  const t = raw.trim().replace(/[:,]+$/, "").trim();
  if (!t) return defaultWallLabel(room);
  if (/^wall\b/i.test(t)) return t.replace(/^wall\b/i, "Wall");
  if (/^[a-z0-9]$/i.test(t)) return `Wall ${t.toUpperCase()}`;
  return t;
}

/** The word the person actually typed, as a label — "doorway" → "Doorway". */
function titleCase(word: string): string {
  const t = word.trim().replace(/[:.]+$/, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/**
 * Resolve a wall name against the walls already imported for the room, so
 * "wall a", "A" and "Wall A" all land on the same wall. Returns the stored
 * label, or the input untouched when it names a wall that wasn't imported —
 * the plan lists those rather than placing them, which is the honest outcome.
 */
function resolveWall(room: Room, raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const bare = t.replace(/^wall\s+/i, "").trim().toLowerCase();
  for (const wall of room.walls) {
    const label = wall.label.trim().toLowerCase();
    if (label === t.toLowerCase() || label.replace(/^wall\s+/, "") === bare) return wall.label;
  }
  return /^[a-z]$/i.test(t) ? `Wall ${t.toUpperCase()}` : t;
}

type RowValues = {
  room: string;
  type: string;
  label: string;
  mm: string;
  wall: string;
  offset: string;
  height: string;
  qty: string;
  notes: string;
  existing: string;
};

/**
 * Apply one parsed row to its room. Returns a reason string when the row named
 * something readable but didn't carry enough to use, or null on success.
 */
function applyRow(builder: RoomBuilder, values: RowValues): string | null {
  const type = matchRowType(values.type);
  if (!type) return `unknown type "${values.type}"`;

  const room = builder.get(values.room);
  const mm = values.mm ? parseMm(values.mm) : null;
  const offsetMm = values.offset ? parseMm(values.offset) : null;
  const heightMm = values.height ? parseMm(values.height) : null;

  if (type === "room") {
    if (values.label.trim()) room.name = values.label.trim();
    return null;
  }

  if (type === "ceiling") {
    if (mm == null) return "no ceiling height on the line";
    room.ceilingMm = mm;
    return null;
  }

  if (type === "note") {
    const text = [values.label, values.notes].filter((s) => s.trim()).join(" ").trim();
    if (!text) return "empty note";
    room.notes = room.notes ? `${room.notes}\n${text}` : text;
    return null;
  }

  if (type === "appliance") {
    const text = [values.label, values.notes].filter((s) => s.trim()).join(" ").trim();
    if (!text) return "empty appliance";
    room.appliances = room.appliances ? `${room.appliances}\n${text}` : text;
    return null;
  }

  if (type === "wall") {
    if (mm == null) return "no length on the line";
    room.walls.push({ label: normaliseWallLabel(values.label, room), mm });
    return null;
  }

  if (type === "opening") {
    if (mm == null) return "no width on the line";
    // An unlabelled opening takes the word that was typed, so "doorway 820"
    // reads as a doorway on the plan rather than a generic "Opening".
    const opening: Measurement = { label: values.label.trim() || titleCase(values.type) || "Opening", mm };
    const wall = resolveWall(room, values.wall);
    if (wall) opening.wall = wall;
    if (offsetMm != null) opening.offsetMm = offsetMm;
    room.openings.push(opening);
    return null;
  }

  const kind = asServiceKind(type);
  if (!kind) return `unknown type "${values.type}"`;

  // A service point is worth keeping even with no position — "there is a GPO
  // behind the fridge" is a fact about the room. Only a row with nothing at all
  // on it is refused.
  const label = values.label.trim();
  if (!label && !values.wall.trim() && offsetMm == null && heightMm == null && !values.notes.trim()) {
    return "nothing to record on the line";
  }

  // Built field by field rather than from emptyServicePoint, whose bench-height
  // and double-outlet defaults exist to give the hand-entry form a sensible
  // starting value the user can see and correct. An import has no such moment,
  // so inheriting them would write a height and a quantity nobody measured.
  const qty = values.qty ? Number(values.qty) : null;
  const point: ServicePoint = {
    id: `${room.id}-sp-${room.servicePoints.length + 1}`,
    kind,
    label,
    offsetMm,
    heightMm,
    qty: qty != null && Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
    existing: true,
    notes: values.notes.trim(),
  };
  // "new", "proposed" and "to be provided" all mean the trade still owes it.
  if (/^(new|proposed|no|false|tbp|to be provided|required)$/i.test(values.existing.trim())) point.existing = false;
  const wall = resolveWall(room, values.wall);
  if (wall) point.wall = wall;
  room.servicePoints.push(point);
  return null;
}

const EMPTY_ROW: RowValues = {
  room: "",
  type: "",
  label: "",
  mm: "",
  wall: "",
  offset: "",
  height: "",
  qty: "",
  notes: "",
  existing: "",
};

// ---------------------------------------------------------------------------
// Freeform
// ---------------------------------------------------------------------------

// "@ wall A 2400" / "on wall B 900" / "@ A 2400" — where along which wall.
const AT_WALL = /\s(?:@|on|at)\s+(?:wall\s+)?([A-Za-z][\w' -]*?)\s+(\d+(?:\.\d+)?\s*(?:mm|cm|m)?)\s*$/i;
// "h1100" / "h 1100" / "height 1100" — the height off the floor.
const HEIGHT = /\s(?:h|ht|height)\s*[:=]?\s*(\d+(?:\.\d+)?\s*(?:mm|cm|m)?)\b/i;
// "x2" / "×3" — how many outlets at the one point.
const QTY = /\s[x×]\s*(\d+)\b/i;

/**
 * Read one freeform line into a row. Returns null when the line names no
 * recognisable type, which is how a bare "Kitchen" is detected as a room
 * heading by the caller.
 */
function parseFreeformLine(line: string, room: string): RowValues | null {
  let rest = line.trim();
  if (!rest) return null;

  // A leading bullet or numbering is noise from a notes app.
  rest = rest.replace(/^[-*•·]\s*/, "").replace(/^\d+[).]\s+/, "");

  // "wall A: 3600" and "wall A 3600" are the same line to the person writing it.
  const colon = rest.indexOf(":");
  const firstWord = (colon > 0 ? rest.slice(0, colon) : rest).trim().split(/\s+/)[0] ?? "";
  const type = matchRowType(firstWord);
  if (!type) return null;
  rest = rest.slice(firstWord.length).replace(/^\s*:\s*/, "").trim();

  const values: RowValues = { ...EMPTY_ROW, room, type: firstWord };

  // Quantity and height come off first. The wall clause has to be anchored to
  // the end of the line — otherwise "@ wall A 2400" would swallow the 1100 out
  // of a trailing "h1100" — so it can only match once the suffixes are gone.
  const qty = QTY.exec(rest);
  if (qty) {
    values.qty = qty[1];
    rest = (rest.slice(0, qty.index) + rest.slice(qty.index + qty[0].length)).trim();
  }

  const height = HEIGHT.exec(rest);
  if (height) {
    values.height = height[1].trim();
    rest = (rest.slice(0, height.index) + rest.slice(height.index + height[0].length)).trim();
  }

  const at = AT_WALL.exec(rest);
  if (at) {
    values.wall = at[1].trim();
    values.offset = at[2].trim();
    rest = rest.slice(0, at.index).trim();
  }

  // Whatever number is left at the end of the line is the measurement itself,
  // and everything before it is the label: "double GPO 2400" → "double GPO".
  const trailing = /(?:^|\s)(\d+(?:\.\d+)?\s*(?:mm|cm|m)?)\s*$/i.exec(rest);
  if (trailing) {
    values.mm = trailing[1].trim();
    rest = rest.slice(0, trailing.index).trim();
  }
  values.label = rest.replace(/[-–,:]\s*$/, "").trim();

  // A ceiling line is only ever a number; a stray label would be the unit.
  if (type === "ceiling" && !values.mm && values.label) {
    const mm = parseMm(values.label);
    if (mm != null) {
      values.mm = values.label;
      values.label = "";
    }
  }
  return values;
}

/** True when a line reads as a room heading rather than a measurement. */
function isRoomHeading(line: string): boolean {
  const t = line.trim().replace(/[:—-]+$/, "").trim();
  if (!t || t.length > 40) return false;
  if (/\d/.test(t)) return false; // headings don't carry dimensions
  return matchRowType(t.split(/\s+/)[0]) === null || matchRowType(t) === "room";
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export type ImportOptions = {
  /** Room name for measurements pasted with no heading above them. */
  defaultRoom?: string;
  /** Injected so tests get stable ids and the browser gets unique ones. */
  idFor?: (n: number) => string;
};

/**
 * Read pasted text into rooms.
 *
 * The result is a proposal, never a commit: the caller shows what was read and
 * the person who was on site confirms it. That is the whole safety model here —
 * a parser that guesses is fine as long as a human sees the guess.
 */
export function importMeasurements(text: string, options: ImportOptions = {}): ImportResult {
  const defaultRoom = options.defaultRoom?.trim() || "Kitchen";
  const idFor = options.idFor ?? ((n: number) => `import-${n + 1}`);
  const builder = new RoomBuilder(idFor);
  const warnings: ImportWarning[] = [];

  const rawLines = (text || "").split(/\r?\n/);
  const nonEmpty = rawLines.filter((l) => l.trim());
  if (nonEmpty.length === 0) return { rooms: [], warnings: [], format: "empty" };

  // Delimited only when the first non-empty line is a header naming its
  // columns. Anything else is read as freeform, so a pasted note with a comma
  // in it isn't mistaken for a spreadsheet.
  const firstIndex = rawLines.findIndex((l) => l.trim());
  const delimiter = detectDelimiter(rawLines[firstIndex]);
  const header = delimiter ? headerMap(splitDelimited(rawLines[firstIndex], delimiter)) : null;

  if (header && delimiter) {
    const pick = (cells: string[], key: string): string =>
      header[key] != null ? (cells[header[key]] ?? "").trim() : "";

    for (let i = firstIndex + 1; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (!line.trim()) continue;
      const cells = splitDelimited(line, delimiter);
      const values: RowValues = {
        room: pick(cells, "room") || defaultRoom,
        type: pick(cells, "type"),
        label: pick(cells, "label"),
        mm: pick(cells, "mm"),
        wall: pick(cells, "wall"),
        offset: pick(cells, "offset"),
        height: pick(cells, "height"),
        qty: pick(cells, "qty"),
        notes: pick(cells, "notes"),
        existing: pick(cells, "existing"),
      };
      const reason = applyRow(builder, values);
      if (reason) warnings.push({ line: i + 1, text: line.trim(), reason });
    }
    return { rooms: builder.all, warnings, format: "delimited" };
  }

  let current = defaultRoom;
  let sawMeasurement = false;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line.trim()) continue;

    const values = parseFreeformLine(line, current);
    if (!values) {
      if (isRoomHeading(line)) {
        current = line.trim().replace(/[:—-]+$/, "").trim();
        // Name the room now even if nothing follows, so an empty heading is
        // visible in the preview rather than silently vanishing.
        builder.get(current);
        continue;
      }
      warnings.push({ line: i + 1, text: line.trim(), reason: "didn't start with a measurement type" });
      continue;
    }

    const reason = applyRow(builder, values);
    if (reason) warnings.push({ line: i + 1, text: line.trim(), reason });
    else sawMeasurement = true;
  }

  // A paste that yielded no measurement at all was prose, not a site sheet —
  // most likely someone pasted into the wrong box. Returning the room headings
  // it happened to "find" would offer to add empty rooms to a real measure.
  if (!sawMeasurement) {
    if (warnings.length === 0) {
      warnings.push({ line: firstIndex + 1, text: rawLines[firstIndex].trim(), reason: "no measurements in the paste" });
    }
    return { rooms: [], warnings, format: "freeform" };
  }
  return { rooms: builder.all, warnings, format: "freeform" };
}

/** A one-line summary of an import, for the confirm button. */
export function importSummary(result: ImportResult): string {
  const rooms = result.rooms.length;
  if (rooms === 0) return "Nothing readable in that paste";
  const walls = result.rooms.reduce((n, r) => n + r.walls.length, 0);
  const openings = result.rooms.reduce((n, r) => n + r.openings.length, 0);
  const points = result.rooms.reduce((n, r) => n + r.servicePoints.length, 0);
  const parts = [`${rooms} room${rooms === 1 ? "" : "s"}`];
  if (walls) parts.push(`${walls} wall${walls === 1 ? "" : "s"}`);
  if (openings) parts.push(`${openings} opening${openings === 1 ? "" : "s"}`);
  if (points) parts.push(`${points} service point${points === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
