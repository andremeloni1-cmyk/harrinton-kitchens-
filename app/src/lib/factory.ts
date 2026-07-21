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
