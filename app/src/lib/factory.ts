// Pure factory helpers (P7) — shared by the board, the tablet view and the
// station init. Kept free of prisma so it's client-safe and testable.

export const DEFAULT_STATIONS = [
  "Programming",
  "Cutting",
  "Edging",
  "Assembly",
  "Finishing",
  "QC",
  "Dispatch",
];

export const JOB_STATION_STATUSES = ["pending", "in_progress", "done"] as const;
export type JobStationStatus = (typeof JOB_STATION_STATUSES)[number];

/** Station-role predicates by name (P8.3) — the QC station gets a per-cabinet
 * sign-off; the dispatch station gates on parts being scanned out. */
export const isQcStation = (name: string) => /\bqc\b|quality/i.test(name);
export const isDispatchStation = (name: string) => /dispatch|despatch|ship/i.test(name);

export type ChecklistItem = { label: string; done: boolean };

export function parseChecklist(raw: string | null | undefined): ChecklistItem[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((i) => i && typeof i.label === "string")
      .map((i) => ({ label: i.label as string, done: Boolean(i.done) }));
  } catch {
    return [];
  }
}

/** The job's current station — the first not-yet-done station by position, or
 * null when every station is done (or there are none). */
export function currentStation<T extends { status: string; position: number }>(stations: T[]): T | null {
  const sorted = [...stations].sort((a, b) => a.position - b.position);
  return sorted.find((s) => s.status !== "done") ?? null;
}

/** How far a job is through the line. */
export function factoryProgress(stations: { status: string }[]): { done: number; total: number; pct: number } {
  const total = stations.length;
  const done = stations.filter((s) => s.status === "done").length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** True if any of the job's stations is flagged blocked. */
export function isJobBlocked(stations: { blocked: boolean }[]): boolean {
  return stations.some((s) => s.blocked);
}

/** How many parts have reached a station — a part whose furthest scanned
 * position is at or beyond this station counts (P8.2). */
export function reachedCount(partLastPositions: (number | null)[], stationPosition: number): number {
  return partLastPositions.filter((p) => p != null && p >= stationPosition).length;
}

/** Per-station part progress, derived from where each part has been scanned. */
export function partProgressByStation(
  partLastPositions: (number | null)[],
  stations: { id: string; position: number }[]
): { stationId: string; done: number; total: number; pct: number }[] {
  const total = partLastPositions.length;
  return stations.map((s) => {
    const done = reachedCount(partLastPositions, s.position);
    return { stationId: s.id, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  });
}

/** A single client-safe "how far through the line" %, averaged across parts.
 * Inputs are each part's furthest station *index* (0-based ordinal, or null if
 * never scanned) and the number of stations. A part at the last station = 100%. */
export function overallPartProgress(partLastIndices: (number | null)[], stationCount: number): number {
  if (!partLastIndices.length || stationCount <= 0) return 0;
  const sum = partLastIndices.reduce<number>(
    (acc, i) => acc + (i == null ? 0 : Math.min(i + 1, stationCount) / stationCount),
    0
  );
  return Math.round((sum / partLastIndices.length) * 100);
}

/** Dispatch readiness (P8.3): grouped by cabinet, whether every part has been
 * scanned out to the dispatch station. Empty (no cut list) = ready. */
export function dispatchReadiness(
  parts: { cabinet: string | null; reached: boolean }[]
): { ready: boolean; cabinets: { name: string; out: number; total: number }[] } {
  const byCab = new Map<string, { out: number; total: number }>();
  for (const p of parts) {
    const key = p.cabinet ?? "Loose parts";
    const e = byCab.get(key) ?? { out: 0, total: 0 };
    e.total++;
    if (p.reached) e.out++;
    byCab.set(key, e);
  }
  return {
    ready: parts.every((p) => p.reached),
    cabinets: [...byCab.entries()].map(([name, v]) => ({ name, out: v.out, total: v.total })),
  };
}
