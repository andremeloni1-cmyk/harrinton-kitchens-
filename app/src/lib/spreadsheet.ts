// Turn an uploaded spreadsheet into the plain grid of strings the report
// parsers read.
//
// The only job here is file format. Everything about what the rows *mean* lives
// in the parser that consumes the grid, so a CADMaster report exported as .xlsx
// and the same report saved as .csv go down identical code paths and cannot
// drift apart.
//
// Format is decided by sniffing the bytes, not the filename: an .xlsx is a ZIP
// and starts "PK", and someone will eventually rename a .csv to .xlsx or email
// one with no extension at all.

import type { Grid } from "./cadmaster";
import { splitDelimited, detectDelimiter } from "./delimited";

export type SheetFormat = "xlsx" | "csv";

/** True when the bytes are a ZIP container, which is what an .xlsx is. */
export function looksLikeXlsx(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
}

/**
 * Read delimited text into a grid.
 *
 * The delimiter is decided from the line with the most fields rather than the
 * first line, because a report's first line is its letterhead — often a single
 * cell with no delimiter in it at all.
 */
export function csvToGrid(text: string): Grid {
  // Strip a BOM; Excel writes one on "CSV UTF-8" and it would otherwise become
  // part of the first cell's text.
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r\n|\r|\n/);
  if (lines.length === 0) return [];

  let delimiter = ",";
  let best = 0;
  for (const line of lines.slice(0, 50)) {
    const candidate = detectDelimiter(line);
    if (!candidate) continue;
    const count = splitDelimited(line, candidate).length;
    if (count > best) {
      best = count;
      delimiter = candidate;
    }
  }

  return lines.map((line) => splitDelimited(line, delimiter));
}

/**
 * Read a spreadsheet's first sheet into a grid.
 *
 * Empty cells are preserved as "" rather than collapsed, because the parsers
 * that consume this locate a value by what sits either side of it on the row.
 * Dropping blanks would silently reshape every line.
 */
export async function readSheetGrid(bytes: Buffer, format?: SheetFormat): Promise<Grid> {
  const kind = format ?? (looksLikeXlsx(bytes) ? "xlsx" : "csv");
  if (kind === "csv") return csvToGrid(bytes.toString("utf8"));

  // Imported lazily so the CSV path — and every other route in the app — never
  // pays to load a spreadsheet reader it doesn't use.
  const { default: readXlsxFile } = await import("read-excel-file/node");
  const result = await readXlsxFile(bytes);
  return toGrid(result);
}

/**
 * Normalise whatever the reader hands back.
 *
 * It returns bare rows for some workbooks and `[{ sheet, data }]` for others,
 * so both shapes are accepted rather than depending on which one this file
 * happens to produce.
 */
export function toGrid(result: unknown): Grid {
  if (!Array.isArray(result) || result.length === 0) return [];

  const first = result[0];
  const rows: unknown[] =
    Array.isArray(first) || first == null
      ? (result as unknown[])
      : ((first as { data?: unknown[] }).data ?? []);

  return rows.map((row) =>
    Array.isArray(row) ? row.map((cell) => (cell == null ? "" : String(cell))) : []
  );
}
