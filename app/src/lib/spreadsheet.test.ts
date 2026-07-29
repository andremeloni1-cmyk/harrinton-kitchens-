import { describe, it, expect } from "vitest";
import { csvToGrid, looksLikeXlsx, toGrid, readSheetGrid } from "./spreadsheet";
import { parseBoardReport, boardSummary } from "./cadmaster";

describe("looksLikeXlsx", () => {
  it("recognises a ZIP container, which is what an xlsx is", () => {
    expect(looksLikeXlsx(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(looksLikeXlsx(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true); // empty archive
  });

  it("does not mistake text for a workbook", () => {
    expect(looksLikeXlsx(Buffer.from("room,type,label\n", "utf8"))).toBe(false);
    expect(looksLikeXlsx(Buffer.from([]))).toBe(false);
  });
});

describe("csvToGrid", () => {
  it("keeps empty cells so the row shape survives", () => {
    expect(csvToGrid("a,,c")).toEqual([["a", "", "c"]]);
  });

  it("picks the delimiter from the widest line, not the letterhead", () => {
    // The first line is a one-cell letterhead with a comma in its text; the
    // real delimiter is the tab further down.
    const grid = csvToGrid(["Phone: 0404 070 153, Wollongong", "Bak\t1 @\t750.0mm\tx\t369.0mm"].join("\n"));
    expect(grid[1]).toEqual(["Bak", "1 @", "750.0mm", "x", "369.0mm"]);
  });

  it("strips the BOM Excel writes on a UTF-8 CSV", () => {
    expect(csvToGrid("﻿1: Floor 1 Door (1),")[0][0]).toBe("1: Floor 1 Door (1)");
  });

  it("keeps a delimiter that sits inside a quoted field", () => {
    expect(csvToGrid('a,"Carcass, White",c')).toEqual([["a", "Carcass, White", "c"]]);
  });

  it("handles CRLF line endings", () => {
    expect(csvToGrid("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("returns a single row for text with no delimiter at all", () => {
    expect(csvToGrid("just one line")).toEqual([["just one line"]]);
  });
});

describe("toGrid", () => {
  it("accepts bare rows", () => {
    expect(toGrid([["a", null, 1]])).toEqual([["a", "", "1"]]);
  });

  it("accepts the { sheet, data } shape the reader returns for some workbooks", () => {
    expect(toGrid([{ sheet: "Sheet1", data: [["a", null]] }])).toEqual([["a", ""]]);
  });

  it("stringifies numbers and dates rather than dropping them", () => {
    expect(toGrid([[746, 399.5]])).toEqual([["746", "399.5"]]);
  });

  it("survives nothing at all", () => {
    expect(toGrid([])).toEqual([]);
    expect(toGrid(null)).toEqual([]);
  });
});

describe("readSheetGrid", () => {
  // The same CADMaster content in both formats must parse identically —
  // that equivalence is the whole reason format detection lives in one place.
  const csv = [
    "1: Floor 1 Door (1)",
    "Dimensions : 890.0mm x 402.0mm x 555.0mm",
    ",,,,MELAMINE: White HMR - 16.5mm  x16.5mm",
    ',,,,Bak,,1   @    ,, 750.0mm,,,x,369.0mm,"  "',
  ].join("\n");

  it("reads delimited bytes into a parseable grid", async () => {
    const report = parseBoardReport(await readSheetGrid(Buffer.from(csv, "utf8")));
    expect(report.warnings).toEqual([]);
    expect(boardSummary(report)).toMatchObject({ cabinets: 1, panels: 1 });
    expect(report.cabinets[0]).toMatchObject({ type: "Floor 1 Door", widthMm: 402 });
    expect(report.cabinets[0].panels[0]).toMatchObject({ code: "Bak", qty: 1, lengthMm: 750, widthMm: 369 });
  });

  it("treats bytes that aren't a workbook as delimited text", async () => {
    const grid = await readSheetGrid(Buffer.from("a,b\nc,d", "utf8"));
    expect(grid).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});
