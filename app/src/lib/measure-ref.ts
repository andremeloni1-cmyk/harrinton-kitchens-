// The check-measure reference scheme — the handle everything on site gets
// written against, so a dimension can still be cross-referenced a year later.
//
// A check measure is the one record every downstream argument comes back to:
// "the plan shows 3600 but the wall is 3550", "which side was the GPO on",
// "whose photo is this". None of that is answerable from a cuid, and a job
// reference alone isn't enough once a job has three rooms and forty photos. So
// the check measure gets its own human reference, and every part of it hangs
// off that reference in a way you can say out loud, write on a site sheet, and
// look back up:
//
//   CM-1042             the check measure for JOB-1042
//   CM-1042-R2          its second room
//   CM-1042-R2-P1       the first power point in that room
//   CM-1042-R2-IMG3     the third photo of that room
//
// Positional, not database-issued: a room's ref falls out of its position in
// the record, so the same numbers appear on screen, on the printed sheet and on
// the plan without anything having to be stored per row. The cost is that
// reordering rooms renumbers them, which is why the register prints refs
// against a completed measure — by then the order is fixed.
//
// Pure and dependency-free, so the capture form, the printed sheet, the plan
// and the register all derive identical refs.

import type { ServiceKind, Room } from "./measure";

/** The prefix that marks a reference as a check measure. */
export const CM_PREFIX = "CM";

/** One letter per service, for the point refs. Waste is D for drain — W is water. */
export const SERVICE_CODE: Record<ServiceKind, string> = {
  power: "P",
  water: "W",
  waste: "D",
  gas: "G",
  data: "N",
};

const CODE_SERVICE: Record<string, ServiceKind> = {
  P: "power",
  W: "water",
  D: "waste",
  G: "gas",
  N: "data",
};

/**
 * The check-measure reference for a job.
 *
 * It reuses the job's own number so the two read as a pair — JOB-1042 is
 * measured by CM-1042 — rather than making the office hold two unrelated
 * numbers in their head. A job reference in an unexpected shape (an imported
 * one, say) is slugged rather than rejected, because a slightly ugly reference
 * beats a job that can't be measured.
 */
export function checkMeasureRef(jobReference: string): string {
  const trimmed = (jobReference || "").trim().toUpperCase();
  const digits = /(\d+)\s*$/.exec(trimmed);
  if (digits) return `${CM_PREFIX}-${digits[1]}`;
  const slug = trimmed.replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `${CM_PREFIX}-${slug}` : CM_PREFIX;
}

/** The reference for a room — its position in the measure, 1-based. */
export function roomRef(cmRef: string, index: number): string {
  return `${cmRef}-R${index + 1}`;
}

/**
 * The reference for a service point: its kind's letter and its position among
 * points of that same kind, so the power points read P1, P2, P3 rather than
 * being numbered around the water.
 */
export function servicePointRef(cmRef: string, roomIndex: number, kind: ServiceKind, kindIndex: number): string {
  return `${roomRef(cmRef, roomIndex)}-${SERVICE_CODE[kind]}${kindIndex + 1}`;
}

/** The reference for a photo of a room. */
export function photoRef(cmRef: string, roomIndex: number, photoIndex: number): string {
  return `${roomRef(cmRef, roomIndex)}-IMG${photoIndex + 1}`;
}

/**
 * Every service point in a room paired with its ref, in capture order.
 *
 * The per-kind counter lives here rather than in the caller so the form, the
 * plan and the register can't drift from one another.
 */
export function refServicePoints(cmRef: string, roomIndex: number, room: Room): { ref: string; pointId: string }[] {
  const seen: Partial<Record<ServiceKind, number>> = {};
  return room.servicePoints.map((point) => {
    const n = seen[point.kind] ?? 0;
    seen[point.kind] = n + 1;
    return { ref: servicePointRef(cmRef, roomIndex, point.kind, n), pointId: point.id };
  });
}

export type ParsedRef = {
  /** The check measure the ref belongs to, e.g. "CM-1042". */
  cmRef: string;
  /** 0-based room index, when the ref named a room. */
  roomIndex: number | null;
  /** The service, when the ref named a service point. */
  kind: ServiceKind | null;
  /** 0-based index within that service, or within the room's photos. */
  itemIndex: number | null;
  /** True when the ref named a photo rather than a service point. */
  photo: boolean;
};

const REF_PATTERN = new RegExp(
  `^${CM_PREFIX}-([A-Z0-9][A-Z0-9-]*?)` + // the measure's own number/slug
    `(?:-R(\\d+)` + // room
    `(?:-(IMG|[PWDGN])(\\d+))?` + // photo or service point
    `)?$`,
  "i"
);

/**
 * Read a reference back into its parts — what the register's search box does
 * with "cm-1042-r2" typed off a site sheet.
 *
 * Deliberately forgiving about case and surrounding whitespace, and about
 * being handed only part of a ref: "CM-1042" resolves to the whole measure,
 * "CM-1042-R2" to a room. Returns null for anything that isn't a ref at all, so
 * the caller can fall back to a plain text search.
 */
export function parseMeasureRef(text: string): ParsedRef | null {
  const m = REF_PATTERN.exec((text || "").trim());
  if (!m) return null;

  const [, body, room, code, item] = m;
  // A slug ref like CM-KITCHEN-2 would otherwise swallow its own suffix; the
  // pattern is non-greedy, so the body is whatever came before -R.
  const cmRef = `${CM_PREFIX}-${body.toUpperCase()}`;
  const roomIndex = room ? Number(room) - 1 : null;
  if (roomIndex != null && roomIndex < 0) return null;

  const upper = code ? code.toUpperCase() : null;
  const photo = upper === "IMG";
  const itemIndex = item ? Number(item) - 1 : null;
  if (itemIndex != null && itemIndex < 0) return null;

  return {
    cmRef,
    roomIndex,
    kind: upper && !photo ? (CODE_SERVICE[upper] ?? null) : null,
    itemIndex,
    photo,
  };
}

/** True when the text looks like a check-measure reference. */
export function looksLikeRef(text: string): boolean {
  return parseMeasureRef(text) !== null;
}
