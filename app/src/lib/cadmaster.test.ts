import { describe, it, expect } from "vitest";
import {
  parseBoardReport,
  parsePanelLine,
  parseEdging,
  parseMaterial,
  countPanels,
  cabinetTypeTally,
  panelCodeTally,
  boardSummary,
  isEmptyBoardReport,
  type Grid,
} from "./cadmaster";

// Rows lifted verbatim from a real CADMaster Cabinet Board Report, including its
// letterhead, its indentation and its trailing spaces. The column positions here
// are that template's, and several tests below deliberately move them to prove
// the parser doesn't depend on them.
function row(cells: Record<number, string>): string[] {
  const out: string[] = new Array(17).fill("");
  for (const [i, v] of Object.entries(cells)) out[Number(i)] = v;
  return out;
}

const LETTERHEAD: Grid = [
  row({}),
  row({}),
  row({ 10: "Phone: 0404 070 153\nEmail:  azkitchens@mail.com\nWebsite: www.azkitchens.com.au\nABN: \n27/07/2026" }),
  row({}),
  row({ 2: "Board 1 Column (Cut Size)" }),
  row({}),
  row({}),
  row({}),
  row({ 3: "Account Name: Test Drawing for Load On Load Off Check list", 9: "Contact: " }),
];

const FLOOR_1_DOOR: Grid = [
  row({ 0: "1: Floor 1 Door (1)" }),
  row({ 0: "Dimensions : 890.0mm x 402.0mm x 555.0mm" }),
  row({ 4: "Polytec: Carcass Satin MR MDF 21mm White x21.0mm" }),
  row({ 4: "DoorLeft", 6: "1   @    ", 8: " 746.0mm", 11: "x", 12: "399.0mm", 13: "2L2S  (T1mm B1mm L1mm R1mm )" }),
  row({ 4: "MELAMINE: White HMR - 16.5mm  x16.5mm" }),
  row({ 4: "Bak", 6: "1   @    ", 8: " 750.0mm", 11: "x", 12: "369.0mm", 13: "  " }),
  row({ 4: "Bot", 6: "1   @    ", 8: " 369.0mm", 11: "x", 12: "538.5mm", 13: "1S  (R1mm )" }),
  row({ 4: "EnL", 6: "1   @    ", 8: " 750.0mm", 11: "x", 12: "555.0mm", 13: "1L  (R1mm )" }),
];

const KICKBOARD: Grid = [
  row({ 0: "7: Kickboard AZ * (7)" }),
  row({ 0: "Dimensions : 140.0mm x 2494.2mm x 480.0mm" }),
  row({ 4: "MELAMINE: White HMR - 16.5mm  x16.5mm" }),
  row({ 4: "Kic", 6: "2   @    ", 8: " 447.0mm", 11: "x", 12: "110.0mm", 13: "  " }),
  row({ 4: "Kic", 6: "2   @    ", 8: " 2494.2mm", 11: "x", 12: "140.0mm", 13: "  " }),
  row({ 4: "Ral", 6: "5   @    ", 8: " 100.0mm", 11: "x", 12: "447.0mm", 13: "  " }),
];

const FULL: Grid = [...LETTERHEAD, ...FLOOR_1_DOOR, [], ...KICKBOARD];

describe("parseBoardReport", () => {
  it("reads the cabinets, their type and their dimensions", () => {
    const report = parseBoardReport(FULL);
    expect(report.warnings).toEqual([]);
    expect(report.cabinets).toHaveLength(2);
    expect(report.cabinets[0]).toMatchObject({
      index: 1,
      id: "1",
      type: "Floor 1 Door",
      heightMm: 890,
      widthMm: 402,
      depthMm: 555,
    });
  });

  it("takes the account name off the letterhead and ignores the rest of it", () => {
    expect(parseBoardReport(FULL).accountName).toBe("Test Drawing for Load On Load Off Check list");
  });

  it("attaches each panel to the material heading above it", () => {
    const panels = parseBoardReport(FULL).cabinets[0].panels;
    expect(panels[0]).toMatchObject({
      code: "DoorLeft",
      material: "Polytec: Carcass Satin MR MDF 21mm White",
      materialThicknessMm: 21,
    });
    expect(panels[1]).toMatchObject({ code: "Bak", material: "MELAMINE: White HMR - 16.5mm", materialThicknessMm: 16.5 });
  });

  it("does not leak a material heading across a cabinet boundary", () => {
    // The kickboard restates its own material; if the previous cabinet's
    // heading survived, its first panel would carry the wrong board.
    const kick = parseBoardReport(FULL).cabinets[1];
    expect(kick.panels[0].material).toBe("MELAMINE: White HMR - 16.5mm");
  });

  it("keeps half-millimetres exactly as printed", () => {
    const report = parseBoardReport(FULL);
    expect(report.cabinets[0].panels.find((p) => p.code === "Bot")!.widthMm).toBe(538.5);
    expect(report.cabinets[1].widthMm).toBe(2494.2);
  });

  it("reads a line quantity as pieces rather than as one part", () => {
    const kick = parseBoardReport(FULL).cabinets[1];
    expect(kick.panels.map((p) => [p.code, p.qty])).toEqual([
      ["Kic", 2],
      ["Kic", 2],
      ["Ral", 5],
    ]);
  });

  it("reads a report whose template indents differently", () => {
    // The same content shifted to different columns — a different company's
    // report template. Nothing here keys off a column letter.
    const shifted: Grid = [
      row({ 2: "1: Floor 2 Door (1)" }),
      row({ 2: "Dimensions : 890.0mm x 850.0mm x 555.0mm" }),
      row({ 0: "MELAMINE: White HMR - 16.5mm  x16.5mm" }),
      row({ 0: "Bak", 1: "3 @", 2: "750.0mm", 3: "x", 4: "817.0mm", 5: "1L (R1mm )" }),
    ];
    const report = parseBoardReport(shifted);
    expect(report.warnings).toEqual([]);
    expect(report.cabinets[0]).toMatchObject({ type: "Floor 2 Door", widthMm: 850 });
    expect(report.cabinets[0].panels[0]).toMatchObject({ code: "Bak", qty: 3, lengthMm: 750, widthMm: 817 });
  });

  it("warns rather than guessing when a panel appears before any cabinet", () => {
    const orphan: Grid = [row({ 4: "Bak", 6: "1   @    ", 8: " 750.0mm", 11: "x", 12: "369.0mm" })];
    const report = parseBoardReport(orphan);
    expect(report.cabinets).toEqual([]);
    expect(report.warnings[0]).toMatchObject({ row: 1, reason: "a panel listed before any cabinet" });
  });

  it("keeps a panel with no size but says so", () => {
    const noSize: Grid = [row({ 0: "1: Floor 1 Door (1)" }), row({ 4: "Bak", 6: "1   @    " })];
    const report = parseBoardReport(noSize);
    expect(report.cabinets[0].panels).toHaveLength(1);
    expect(report.warnings[0]).toMatchObject({ reason: "a panel with no size on the line" });
  });

  it("handles a cabinet name containing brackets and punctuation", () => {
    const odd: Grid = [row({ 0: "7: Kickboard AZ * (7)" })];
    expect(parseBoardReport(odd).cabinets[0]).toMatchObject({ index: 7, type: "Kickboard AZ *", id: "7" });
  });

  it("reads a report with no dimensions line without inventing any", () => {
    const noDims: Grid = [
      row({ 0: "1: Floor 1 Door (1)" }),
      row({ 4: "MELAMINE: White HMR - 16.5mm  x16.5mm" }),
      row({ 4: "Bak", 6: "1   @    ", 8: " 750.0mm", 11: "x", 12: "369.0mm" }),
    ];
    const cab = parseBoardReport(noDims).cabinets[0];
    expect(cab).toMatchObject({ heightMm: null, widthMm: null, depthMm: null });
    expect(cab.panels).toHaveLength(1);
  });

  it("returns an empty report for a file that isn't a board report", () => {
    const report = parseBoardReport([row({ 0: "Invoice" }), row({ 0: "Total due" })]);
    expect(isEmptyBoardReport(report)).toBe(true);
    expect(report.cabinets).toEqual([]);
  });

  it("survives an empty grid", () => {
    expect(parseBoardReport([])).toEqual({ accountName: "", cabinets: [], warnings: [] });
  });
});

describe("parsePanelLine", () => {
  it("finds the label before the quantity and the sizes after it", () => {
    expect(
      parsePanelLine(row({ 4: "Shelf Adj", 6: "1   @    ", 8: " 367.0mm", 11: "x", 12: "488.5mm", 13: "1S  (R1mm )" }))
    ).toMatchObject({ code: "Shelf Adj", qty: 1, lengthMm: 367, widthMm: 488.5 });
  });

  it("is not a panel line when there is no quantity cell", () => {
    expect(parsePanelLine(row({ 4: "Polytec: Carcass Satin MR MDF 21mm White x21.0mm" }))).toBeNull();
    expect(parsePanelLine(row({ 0: "Dimensions : 890.0mm x 402.0mm x 555.0mm" }))).toBeNull();
  });

  it("is not a panel line when the quantity has no label before it", () => {
    expect(parsePanelLine(row({ 6: "1   @    ", 8: " 367.0mm" }))).toBeNull();
  });

  it("falls back to a quantity of one when the figure is unusable", () => {
    expect(parsePanelLine(row({ 4: "Bak", 6: "0   @", 8: "750.0mm", 12: "369.0mm" }))!.qty).toBe(1);
  });
});

describe("parseEdging", () => {
  it("reads the spec and every taped edge", () => {
    expect(parseEdging("2L2S  (T1mm B1mm L1mm R1mm )")).toEqual({
      spec: "2L2S",
      top: 1,
      bottom: 1,
      left: 1,
      right: 1,
    });
  });

  it("reads a single edge", () => {
    expect(parseEdging("1L  (R1mm )")).toEqual({ spec: "1L", right: 1 });
    expect(parseEdging("2L  (L1mm R1mm )")).toEqual({ spec: "2L", left: 1, right: 1 });
  });

  it("keeps the spec and the edges as printed even when they disagree", () => {
    // "1S" is a short edge but the bracket names R. Reconciling the two would
    // silently change which edge the operator tapes.
    expect(parseEdging("1S  (R1mm )")).toEqual({ spec: "1S", right: 1 });
  });

  it("reads an unedged panel as unedged", () => {
    expect(parseEdging("  ")).toEqual({ spec: "" });
    expect(parseEdging("")).toEqual({ spec: "" });
  });

  it("reads a thicker tape", () => {
    expect(parseEdging("1L (R2.0mm )")).toEqual({ spec: "1L", right: 2 });
  });
});

describe("parseMaterial", () => {
  it("keeps the brand with the description", () => {
    expect(parseMaterial("Polytec: Carcass Satin MR MDF 21mm White x21.0mm")).toEqual({
      name: "Polytec: Carcass Satin MR MDF 21mm White",
      thicknessMm: 21,
    });
  });

  it("collapses the double space the template prints", () => {
    expect(parseMaterial("MELAMINE: White HMR - 16.5mm  x16.5mm")).toEqual({
      name: "MELAMINE: White HMR - 16.5mm",
      thicknessMm: 16.5,
    });
  });

  it("is not a material without the trailing thickness", () => {
    expect(parseMaterial("Account Name: Test Drawing for Load On Load Off Check list")).toBeNull();
    expect(parseMaterial("Contact: ")).toBeNull();
  });
});

describe("reading a parsed report", () => {
  const report = parseBoardReport(FULL);

  it("counts panels by a predicate, in pieces", () => {
    expect(countPanels(report.cabinets[1], (c) => c === "Kic")).toBe(4);
    expect(countPanels(report.cabinets[0], (c) => c.startsWith("Door"))).toBe(1);
  });

  it("tallies cabinet types — what the hardware rules are written against", () => {
    expect(cabinetTypeTally(report)).toEqual([
      { type: "Floor 1 Door", count: 1 },
      { type: "Kickboard AZ *", count: 1 },
    ]);
  });

  it("tallies panel codes in pieces, busiest first", () => {
    expect(panelCodeTally(report)).toEqual([
      { code: "Ral", qty: 5 },
      { code: "Kic", qty: 4 },
      { code: "Bak", qty: 1 },
      { code: "Bot", qty: 1 },
      { code: "DoorLeft", qty: 1 },
      { code: "EnL", qty: 1 },
    ]);
  });

  it("summarises the report", () => {
    // 7 panel lines, but 13 pieces — the kickboard's lines carry 2, 2 and 5.
    expect(boardSummary(report)).toEqual({ cabinets: 2, panels: 7, pieces: 13, types: 2 });
  });
});
