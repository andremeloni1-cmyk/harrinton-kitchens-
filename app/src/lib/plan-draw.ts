// Draw a clean floor plan from captured check-measure data.
//
// The mudmap that comes back from site is a biro sketch on the back of a job
// sheet. The AI reader turns it into rooms, walls and openings; this turns that
// into a scaled, labelled plan the designer can actually work off. It renders
// SVG as a string with no DOM, so it runs on the server, in a test, or inside a
// print page unchanged.
//
// The one assumption worth stating plainly: **consecutive walls meet at right
// angles**, turning clockwise, because that is what a kitchen mudmap is. A
// sketch listing four walls is a rectangle, three is a U, two is an L. Angles
// are not captured on site, so the alternative to assuming 90° is not drawing
// anything at all. Nothing here invents a dimension — a plan only ever shows
// numbers that were measured.

import {
  SERVICE_LABELS,
  isPlaceable,
  servicePosition,
  type Room,
  type Measurement,
  type ServiceKind,
  type ServicePoint,
} from "./measure";

export type Point = { x: number; y: number };

export type PlanWall = {
  label: string;
  mm: number;
  start: Point; // millimetre space, before scaling
  end: Point;
  /** Unit vector pointing out of the room, for pushing labels clear. */
  outward: Point;
};

export type PlanOpening = {
  label: string;
  mm: number;
  wallLabel: string;
  start: Point;
  end: Point;
  /** The host wall's outward normal — the label goes the other way, so it
   *  can't land on top of that wall's dimension text. */
  outward: Point;
};

/** A power point, tap or drain located on a wall. */
export type PlanService = {
  kind: ServiceKind;
  label: string;
  /** Short code drawn in the marker — "P", "W", "D", "G", "N". */
  code: string;
  at: Point;
  /** The host wall's outward normal, for pushing the marker clear of the wall. */
  outward: Point;
  existing: boolean;
};

export type PlanGeometry = {
  walls: PlanWall[];
  openings: PlanOpening[];
  /** Openings that named no wall (or an unknown one) — listed, not drawn. */
  unplaced: Measurement[];
  /** Service points pinned to a wall and drawn on it. */
  services: PlanService[];
  /** Service points with no usable position — listed beside the plan instead. */
  unplacedServices: ServicePoint[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** True when the last wall ends back near the first wall's start. */
  closed: boolean;
};

// Headings, clockwise from east, in screen coordinates (y grows downward).
const HEADINGS: Point[] = [
  { x: 1, y: 0 }, // east
  { x: 0, y: 1 }, // south
  { x: -1, y: 0 }, // west
  { x: 0, y: -1 }, // north
];

/** The room's outward normal for a heading — 90° anticlockwise of travel. */
function outwardFor(heading: Point): Point {
  return { x: heading.y, y: -heading.x };
}

function usableWalls(room: Room): Measurement[] {
  return room.walls.filter((w) => w.mm != null && w.mm > 0);
}

/**
 * Lay the walls out end to end, turning 90° clockwise at each corner.
 * Returns null when there is nothing measurable to draw.
 */
export function planGeometry(room: Room): PlanGeometry | null {
  const runs = usableWalls(room);
  if (runs.length === 0) return null;

  const walls: PlanWall[] = [];
  let cursor: Point = { x: 0, y: 0 };

  runs.forEach((run, i) => {
    const heading = HEADINGS[i % HEADINGS.length];
    const mm = run.mm as number;
    const end = { x: cursor.x + heading.x * mm, y: cursor.y + heading.y * mm };
    walls.push({
      label: run.label || `Wall ${String.fromCharCode(65 + i)}`,
      mm,
      start: cursor,
      end,
      outward: outwardFor(heading),
    });
    cursor = end;
  });

  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
  const bounds = {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };

  // "Closed" is judged against the room's own size, not a fixed tolerance: 50mm
  // out on a 6m kitchen is a rounding error, on a 400mm return it is a wall.
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  const gap = Math.hypot(cursor.x - walls[0].start.x, cursor.y - walls[0].start.y);
  const closed = walls.length >= 3 && gap <= span * 0.02;

  const byLabel = new Map(walls.map((w) => [w.label.trim().toLowerCase(), w]));
  const openings: PlanOpening[] = [];
  const unplaced: Measurement[] = [];

  for (const opening of room.openings) {
    const wall = opening.wall ? byLabel.get(opening.wall.trim().toLowerCase()) : undefined;
    const width = opening.mm;
    const offset = opening.offsetMm;
    if (!wall || width == null || width <= 0 || offset == null || offset < 0 || offset > wall.mm) {
      unplaced.push(opening);
      continue;
    }
    const dir = { x: (wall.end.x - wall.start.x) / wall.mm, y: (wall.end.y - wall.start.y) / wall.mm };
    // Clamp so an opening that overruns the wall end still draws inside it.
    const from = Math.min(offset, Math.max(0, wall.mm - width));
    openings.push({
      label: opening.label || "Opening",
      mm: width,
      wallLabel: wall.label,
      start: { x: wall.start.x + dir.x * from, y: wall.start.y + dir.y * from },
      end: { x: wall.start.x + dir.x * (from + width), y: wall.start.y + dir.y * (from + width) },
      outward: wall.outward,
    });
  }

  const services: PlanService[] = [];
  const unplacedServices: ServicePoint[] = [];

  for (const point of room.servicePoints) {
    const wall = point.wall ? byLabel.get(point.wall.trim().toLowerCase()) : undefined;
    // Unlike an opening, a service has no width — it just needs a spot on a
    // wall. An offset past the end of the wall is clamped rather than dropped:
    // it is a typo in a number, not a reason to lose a power point.
    if (!wall || !isPlaceable(point)) {
      unplacedServices.push(point);
      continue;
    }
    const along = Math.min(Math.max(point.offsetMm as number, 0), wall.mm);
    const dir = { x: (wall.end.x - wall.start.x) / wall.mm, y: (wall.end.y - wall.start.y) / wall.mm };
    services.push({
      kind: point.kind,
      label: point.label || SERVICE_LABELS[point.kind],
      code: SERVICE_MARK[point.kind],
      at: { x: wall.start.x + dir.x * along, y: wall.start.y + dir.y * along },
      outward: wall.outward,
      existing: point.existing,
    });
  }

  return { walls, openings, unplaced, services, unplacedServices, bounds, closed };
}

// One letter per service in the drawn marker, matching the reference scheme in
// measure-ref.ts so a marker on the plan and a ref on the sheet read alike.
const SERVICE_MARK: Record<ServiceKind, string> = {
  power: "P",
  water: "W",
  waste: "D",
  gas: "G",
  data: "N",
};

// Marker colours, chosen to stay distinct in a black-and-white print as well as
// on screen — a plan drawn off this gets printed and taken back to site.
const SERVICE_FILL: Record<ServiceKind, string> = {
  power: "#d97706",
  water: "#0284c7",
  waste: "#57534e",
  gas: "#ea580c",
  data: "#7c3aed",
};

/** XML-escape a string for safe interpolation into SVG text. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const round = (n: number) => Math.round(n * 100) / 100;

export type PlanOptions = {
  width?: number;
  height?: number;
  /** Room name and ceiling height in the corner. On by default. */
  title?: boolean;
};

/**
 * Render one room as an SVG plan. Returns null when the room holds no wall
 * measurements — the caller shows "not enough captured yet" rather than an
 * empty box.
 */
export function renderPlanSvg(room: Room, options: PlanOptions = {}): string | null {
  const geo = planGeometry(room);
  if (!geo) return null;

  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const margin = 72; // room for dimension text outside the walls

  const spanX = Math.max(geo.bounds.maxX - geo.bounds.minX, 1);
  const spanY = Math.max(geo.bounds.maxY - geo.bounds.minY, 1);
  const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY);

  // Centre the plan in the canvas.
  const offsetX = (width - spanX * scale) / 2 - geo.bounds.minX * scale;
  const offsetY = (height - spanY * scale) / 2 - geo.bounds.minY * scale;
  const to = (p: Point): Point => ({ x: round(p.x * scale + offsetX), y: round(p.y * scale + offsetY) });

  const parts: string[] = [];

  // Walls, drawn thick so openings can be cut into them visually.
  for (const wall of geo.walls) {
    const a = to(wall.start);
    const b = to(wall.end);
    parts.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#1c1917" stroke-width="6" stroke-linecap="square" />`
    );
  }

  // Openings sit on top of the wall in white with their own thin jamb lines,
  // which reads as a gap without having to split the wall geometry.
  for (const opening of geo.openings) {
    const a = to(opening.start);
    const b = to(opening.end);
    parts.push(
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ffffff" stroke-width="6" stroke-linecap="butt" />`,
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ea580c" stroke-width="2" stroke-linecap="butt" />`
    );
    // Inward — the wall's dimension text is already sitting outward.
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const x = round(mid.x - opening.outward.x * 14);
    const y = round(mid.y - opening.outward.y * 14 + 4);
    parts.push(
      `<text x="${x}" y="${y}" font-size="11" fill="#ea580c" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif">${esc(
        opening.label
      )} ${opening.mm}</text>`
    );
  }

  // Dimension text, pushed clear of the wall on the outside.
  for (const wall of geo.walls) {
    const a = to(wall.start);
    const b = to(wall.end);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const pad = 18;
    const x = round(mid.x + wall.outward.x * pad);
    const y = round(mid.y + wall.outward.y * pad + 4); // +4 centres the cap height
    parts.push(
      `<text x="${x}" y="${y}" font-size="13" font-weight="600" fill="#1c1917" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif">${wall.mm}</text>`,
      `<text x="${x}" y="${round(y + 13)}" font-size="10" fill="#78716c" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif">${esc(
        wall.label
      )}</text>`
    );
  }

  // Service markers sit just inside the wall, where the cabinet they clash
  // with will be. A point still to be run by a trade is drawn hollow, so
  // "there is a GPO here" and "there needs to be a GPO here" can't be confused
  // by someone reading the plan on a phone in a half-built kitchen.
  for (const service of geo.services) {
    const p = to(service.at);
    const cx = round(p.x - service.outward.x * 13);
    const cy = round(p.y - service.outward.y * 13);
    const fill = SERVICE_FILL[service.kind];
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="8" fill="${service.existing ? fill : "#ffffff"}" stroke="${fill}" stroke-width="2"${
        service.existing ? "" : ' stroke-dasharray="3 2"'
      } />`,
      `<text x="${cx}" y="${round(cy + 3.5)}" font-size="9" font-weight="700" fill="${
        service.existing ? "#ffffff" : fill
      }" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif">${esc(service.code)}</text>`,
      // The description goes a little further in again, so it can't collide
      // with the wall dimension sitting on the outside.
      `<text x="${cx}" y="${round(cy - service.outward.y * 12 - 12)}" font-size="9" fill="${fill}" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif">${esc(
        service.label
      )}</text>`
    );
  }

  if (options.title !== false) {
    const ceiling = room.ceilingMm != null ? ` · ceiling ${room.ceilingMm}` : "";
    parts.push(
      `<text x="16" y="26" font-size="15" font-weight="700" fill="#1c1917" font-family="ui-sans-serif, system-ui, sans-serif">${esc(
        room.name
      )}${esc(ceiling)}</text>`,
      `<text x="16" y="42" font-size="10" fill="#a8a29e" font-family="ui-sans-serif, system-ui, sans-serif">All dimensions in mm${
        geo.closed ? "" : " · open plan, walls shown as measured"
      }</text>`
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(
      `Floor plan of ${room.name}`
    )}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff" />`,
    ...parts,
    `</svg>`,
  ].join("");
}

/** One service point as a line of text, for the notes panel and the print sheet. */
export function serviceLine(point: ServicePoint): string {
  const head = [
    SERVICE_LABELS[point.kind],
    point.kind === "power" && point.qty > 1 ? `×${point.qty}` : null,
    point.label ? `— ${point.label}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const where = servicePosition(point);
  // "To be provided" goes last and in words, because it is the bit that turns
  // a measurement into an instruction for a trade.
  return [head, where, point.existing ? null : "to be provided", point.notes || null]
    .filter(Boolean)
    .join(" · ");
}

/** Everything captured that the plan can't draw, for the notes panel beside it. */
export function planNotes(room: Room): { heading: string; body: string }[] {
  const geo = planGeometry(room);
  const notes: { heading: string; body: string }[] = [];

  const unplaced = geo ? geo.unplaced : room.openings;
  if (unplaced.length > 0) {
    notes.push({
      heading: "Openings without a position",
      body: unplaced.map((o) => [o.label, o.mm != null ? `${o.mm}mm` : null].filter(Boolean).join(" ")).join("\n"),
    });
  }

  // Everything the plan drew, spelled out — a marker says where, this says
  // what and how high, which is what the electrician and plumber need.
  const placed = geo ? geo.services : [];
  if (placed.length > 0) {
    notes.push({
      heading: "Services on the plan",
      body: room.servicePoints
        .filter(isPlaceable)
        .map((p) => serviceLine(p))
        .join("\n"),
    });
  }

  const floating = geo ? geo.unplacedServices : room.servicePoints;
  if (floating.length > 0) {
    notes.push({
      heading: "Services without a position",
      body: floating.map((p) => serviceLine(p)).join("\n"),
    });
  }

  const services = [
    room.services.power ? `Power: ${room.services.power}` : null,
    room.services.water ? `Water: ${room.services.water}` : null,
    room.services.gas ? `Gas: ${room.services.gas}` : null,
  ].filter(Boolean);
  if (services.length > 0) notes.push({ heading: "Service notes", body: services.join("\n") });

  if (room.appliances.trim()) notes.push({ heading: "Appliances", body: room.appliances.trim() });
  if (room.notes.trim()) notes.push({ heading: "Site notes", body: room.notes.trim() });

  return notes;
}
