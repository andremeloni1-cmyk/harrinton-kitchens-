// Read a CADMaster "Cabinet Board Report" into structured cabinets and panels.
//
// The report is a printed document that happens to live in a spreadsheet: merged
// cells, a letterhead block, group headings, and one indented line per panel. It
// is not a table, so it cannot be read row-by-column. It is read the way you'd
// read it on paper — top to bottom, holding on to which cabinet and which
// material you are currently under:
//
//   1: Floor 1 Door (1)                                  <- cabinet
//   Dimensions : 890.0mm x 402.0mm x 555.0mm             <- height x width x depth
//       Polytec: Carcass Satin MR MDF 21mm White x21.0mm <- material, until the next one
//       DoorLeft   1 @    746.0mm  x  399.0mm  2L2S (T1mm B1mm L1mm R1mm)
//       Bak        1 @    750.0mm  x  369.0mm
//
// **Nothing here keys off a column letter.** The sample this was built from puts
// the quantity in column G and the length in column I, but that is a property of
// one company's report template, not of CADMaster. A panel line is instead found
// by its shape — the cell that reads "1   @", with a label before it and two
// millimetre figures after — so a template that indents differently still reads.
//
// Pure, and takes a grid of strings rather than a file, so the same code serves
// the .xlsx path, the .csv path and the tests.

/** A sheet as rows of already-stringified cells. Blank cells are "". */
export type Grid = string[][];

/** Which edges are taped, and with what thickness. */
export type Edging = {
  /** The spec exactly as printed, e.g. "2L2S". Empty when the panel is raw. */
  spec: string;
  /** Tape thickness in mm per edge, present only for the edges that carry it. */
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

export type BoardPanel = {
  /** The report's own part code — "DoorLeft", "Bak", "Shelf Adj". */
  code: string;
  qty: number;
  lengthMm: number | null;
  widthMm: number | null;
  /** The material group this panel was listed under, as printed. */
  material: string;
  materialThicknessMm: number | null;
  edging: Edging;
};

export type BoardCabinet = {
  /** The number the report prints, 1-based. */
  index: number;
  /** The identifier in brackets after the name — often, but not always, the index. */
  id: string;
  /** The cabinet type as printed, e.g. "Floor 2 Door". The hardware rules key on this. */
  type: string;
  heightMm: number | null;
  widthMm: number | null;
  depthMm: number | null;
  panels: BoardPanel[];
};

export type ParseWarning = { row: number; text: string; reason: string };

export type BoardReport = {
  /** "Account Name:" off the letterhead, when the template carries one. */
  accountName: string;
  cabinets: BoardCabinet[];
  warnings: ParseWarning[];
};

// "1: Floor 1 Door (1)" / "7: Kickboard AZ * (7)"
const CABINET_HEADER = /^(\d+)\s*:\s*(.+?)\s*\(([^()]*)\)\s*$/;
// "Dimensions : 890.0mm x 402.0mm x 555.0mm"
const DIMENSIONS = /^dimensions\s*:\s*([\d.]+)\s*mm\s*x\s*([\d.]+)\s*mm\s*x\s*([\d.]+)\s*mm/i;
// "Polytec: Carcass Satin MR MDF 21mm White x21.0mm" — the trailing "x<thickness>mm"
// is what separates a material heading from any other colon-bearing line.
const MATERIAL = /^(.+?):\s*(.+?)\s*x\s*([\d.]+)\s*mm\s*$/i;
// "Account Name: Test Drawing for ..."
const ACCOUNT = /^account\s*name\s*:\s*(.*)$/i;
// The quantity cell, "1   @    ", which anchors a panel line.
const QTY = /^(\d+)\s*@\s*$/;
// A bare dimension cell, " 746.0mm".
const MM = /^\s*([\d.]+)\s*mm\s*$/i;
// "2L2S", "1L" — the count of long/short edges taped.
const EDGE_SPEC = /(\d+\s*[LS])+/i;
// "T1mm B1mm L1mm R1mm" inside the brackets.
const EDGE_THICKNESS = /([TBLR])\s*([\d.]+)\s*mm/gi;

function num(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * A millimetre figure, kept exactly as printed.
 *
 * Deliberately not rounded. The report prints one decimal because it means it:
 * a bottom is 538.5mm and a kickboard run is 2494.2mm, and rounding either would
 * hand the saw a different part. Half-millimetres don't matter for counting
 * hinges, but this parser is the only reading of the file and it should not lose
 * information the next consumer might need.
 */
function mm(raw: string): number | null {
  return num(raw);
}

/**
 * Read an edging cell.
 *
 * The spec ("2L2S") and the per-edge thicknesses ("T1mm B1mm L1mm R1mm") say
 * overlapping things, and the sample disagrees with itself: "1S (R1mm)" tapes a
 * short edge but names it R. Both are kept exactly as printed rather than
 * reconciled — the edgebander operator reads the spec, and guessing which one is
 * "right" would silently change a panel.
 */
export function parseEdging(raw: string): Edging {
  const text = (raw || "").trim();
  if (!text) return { spec: "" };

  const specMatch = EDGE_SPEC.exec(text);
  const edging: Edging = { spec: specMatch ? specMatch[0].replace(/\s+/g, "").toUpperCase() : "" };

  const inner = /\(([^)]*)\)/.exec(text);
  if (inner) {
    EDGE_THICKNESS.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EDGE_THICKNESS.exec(inner[1])) !== null) {
      const thickness = num(m[2]);
      if (thickness == null) continue;
      const edge = m[1].toUpperCase();
      if (edge === "T") edging.top = thickness;
      else if (edge === "B") edging.bottom = thickness;
      else if (edge === "L") edging.left = thickness;
      else if (edge === "R") edging.right = thickness;
    }
  }
  return edging;
}

/** The material heading's description and thickness, or null if it isn't one. */
export function parseMaterial(raw: string): { name: string; thicknessMm: number | null } | null {
  const text = (raw || "").trim();
  const m = MATERIAL.exec(text);
  if (!m) return null;
  // "Polytec: Carcass Satin MR MDF 21mm White x21.0mm" — brand and description
  // are kept together, because that whole string is how the sheet is ordered and
  // splitting it would lose the brand on a panel label.
  const name = `${m[1].trim()}: ${m[2].trim()}`.replace(/\s+/g, " ");
  return { name, thicknessMm: num(m[3]) };
}

type PanelLine = { code: string; qty: number; lengthMm: number | null; widthMm: number | null; edging: Edging };

/**
 * Read a panel line out of a row, by shape rather than by column.
 *
 * The quantity cell is the anchor: the label is the last thing written before
 * it, and the two millimetre figures after it are the length and the width.
 * Everything else on the line — the literal "x" separator, the indent padding —
 * is noise, so it is filtered rather than counted on to be in a fixed place.
 */
export function parsePanelLine(cells: string[]): PanelLine | null {
  const qtyIndex = cells.findIndex((c) => QTY.test((c || "").trim()));
  if (qtyIndex < 0) return null;

  const qty = Number(QTY.exec(cells[qtyIndex].trim())![1]);

  let code = "";
  for (let i = qtyIndex - 1; i >= 0; i--) {
    const cell = (cells[i] || "").trim();
    if (cell) {
      code = cell;
      break;
    }
  }
  if (!code) return null;

  const rest = cells
    .slice(qtyIndex + 1)
    .map((c) => (c || "").trim())
    .filter((c) => c !== "" && c.toLowerCase() !== "x");

  const dims: number[] = [];
  let edgingRaw = "";
  for (const cell of rest) {
    const m = MM.exec(cell);
    if (m && dims.length < 2) {
      const value = mm(m[1]);
      if (value != null) dims.push(value);
      continue;
    }
    if (!edgingRaw) edgingRaw = cell;
  }

  return {
    code,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    lengthMm: dims[0] ?? null,
    widthMm: dims[1] ?? null,
    edging: parseEdging(edgingRaw),
  };
}

/**
 * Read the whole report.
 *
 * Everything above the first cabinet heading is letterhead and is skipped, save
 * for the account name. A panel found before any cabinet heading is reported as
 * a warning rather than attached to a guessed cabinet — an ordering list built
 * on a panel filed under the wrong cabinet is worse than one that says it
 * couldn't place it.
 */
export function parseBoardReport(grid: Grid): BoardReport {
  const cabinets: BoardCabinet[] = [];
  const warnings: ParseWarning[] = [];
  let accountName = "";
  let current: BoardCabinet | null = null;
  let material = "";
  let materialThicknessMm: number | null = null;

  const rowText = (cells: string[]) =>
    cells
      .map((c) => (c || "").trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 120);

  for (let r = 0; r < grid.length; r++) {
    const cells = (grid[r] || []).map((c) => (c ?? "").toString());
    const filled = cells.map((c) => c.trim()).filter(Boolean);
    if (filled.length === 0) continue;

    // A panel line is checked first: it is the only row carrying a quantity
    // cell, so this can never swallow a heading.
    const panel = parsePanelLine(cells);
    if (panel) {
      if (!current) {
        warnings.push({ row: r + 1, text: rowText(cells), reason: "a panel listed before any cabinet" });
        continue;
      }
      if (panel.lengthMm == null || panel.widthMm == null) {
        warnings.push({ row: r + 1, text: rowText(cells), reason: "a panel with no size on the line" });
      }
      current.panels.push({ ...panel, material, materialThicknessMm });
      continue;
    }

    let handled = false;
    for (const cell of filled) {
      const header = CABINET_HEADER.exec(cell);
      if (header) {
        current = {
          index: Number(header[1]),
          id: header[3].trim(),
          type: header[2].trim(),
          heightMm: null,
          widthMm: null,
          depthMm: null,
          panels: [],
        };
        // A new cabinet restates its materials, so the previous one's heading
        // must not leak across the boundary.
        material = "";
        materialThicknessMm = null;
        cabinets.push(current);
        handled = true;
        break;
      }

      const dims = DIMENSIONS.exec(cell);
      if (dims && current) {
        current.heightMm = mm(dims[1]);
        current.widthMm = mm(dims[2]);
        current.depthMm = mm(dims[3]);
        handled = true;
        break;
      }

      const account = ACCOUNT.exec(cell);
      if (account) {
        accountName = account[1].trim();
        handled = true;
        break;
      }

      // Checked last: the material pattern is the loosest, and a heading is
      // only a heading once nothing more specific has claimed the row.
      const mat = parseMaterial(cell);
      if (mat && current) {
        material = mat.name;
        materialThicknessMm = mat.thicknessMm;
        handled = true;
        break;
      }
    }
    if (handled) continue;
    // Anything left is letterhead, a page title or a column ruling. Silent by
    // design — warning on every line of a letterhead would bury the real ones.
  }

  return { accountName, cabinets, warnings };
}

// ---------------------------------------------------------------------------
// Reading a parsed report
// ---------------------------------------------------------------------------

/** Total pieces of a panel code in a cabinet — quantities, not lines. */
export function countPanels(cabinet: BoardCabinet, matches: (code: string) => boolean): number {
  return cabinet.panels.filter((p) => matches(p.code)).reduce((n, p) => n + p.qty, 0);
}

/**
 * How many of each cabinet type the report holds.
 *
 * This is what the hardware rules are written against, and what the import
 * screen shows so a type nobody has a rule for is visible rather than silently
 * contributing nothing to the order.
 */
export function cabinetTypeTally(report: BoardReport): { type: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const cabinet of report.cabinets) {
    counts.set(cabinet.type, (counts.get(cabinet.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/** Every distinct panel code in the report, with total pieces. */
export function panelCodeTally(report: BoardReport): { code: string; qty: number }[] {
  const counts = new Map<string, number>();
  for (const cabinet of report.cabinets) {
    for (const panel of cabinet.panels) counts.set(panel.code, (counts.get(panel.code) ?? 0) + panel.qty);
  }
  return [...counts.entries()]
    .map(([code, qty]) => ({ code, qty }))
    .sort((a, b) => b.qty - a.qty || a.code.localeCompare(b.code));
}

export type BoardSummary = { cabinets: number; panels: number; pieces: number; types: number };

export function boardSummary(report: BoardReport): BoardSummary {
  const panels = report.cabinets.reduce((n, c) => n + c.panels.length, 0);
  const pieces = report.cabinets.reduce((n, c) => n + c.panels.reduce((m, p) => m + p.qty, 0), 0);
  return { cabinets: report.cabinets.length, panels, pieces, types: cabinetTypeTally(report).length };
}

/** True when the file parsed but held nothing a board report would hold. */
export function isEmptyBoardReport(report: BoardReport): boolean {
  return report.cabinets.length === 0;
}
