// P9.1 capacity engine — pure, deterministic factory scheduling. No prisma / no
// wall-clock reads, so it's fully unit-testable and safe on the client too.
//
// The unit of work is a ScheduleBlock: `hours` of a job's work at one station on
// one business `day` ('YYYY-MM-DD'). Station capacity is `hoursPerDay`. From
// these we derive per-station-per-day utilisation, propose blocks backward from a
// due date, and answer "what's the earliest we could finish / is date X feasible".

export type CapStation = { id: string; hoursPerDay: number };
export type CapBlock = { stationId: string; day: string; hours: number };
export type StationHours = { stationId: string; hours: number; hoursPerDay: number };

const DAY_MS = 86_400_000;
const EPS = 1e-9;

// --- date helpers (operate on 'YYYY-MM-DD', anchored at UTC noon to dodge TZ/DST) ---

export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
export function addDays(day: string, n: number): string {
  return toDay(new Date(parseDay(day).getTime() + n * DAY_MS));
}
export function weekdayOf(day: string): number {
  return parseDay(day).getUTCDay(); // 0 Sun … 6 Sat
}
export function isWeekendDay(day: string): boolean {
  const w = weekdayOf(day);
  return w === 0 || w === 6;
}
export function isWorkingDay(day: string, holidays: ReadonlySet<string> = new Set()): boolean {
  return !isWeekendDay(day) && !holidays.has(day);
}
export function nextWorkingDay(day: string, holidays?: ReadonlySet<string>): string {
  let d = addDays(day, 1);
  for (let g = 0; g < 400 && !isWorkingDay(d, holidays); g++) d = addDays(d, 1);
  return d;
}
export function prevWorkingDay(day: string, holidays?: ReadonlySet<string>): string {
  let d = addDays(day, -1);
  for (let g = 0; g < 400 && !isWorkingDay(d, holidays); g++) d = addDays(d, -1);
  return d;
}
/** Every working day in [start, end] inclusive. */
export function workingDays(start: string, end: string, holidays?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (let d = start, g = 0; d <= end && g < 1000; d = addDays(d, 1), g++) {
    if (isWorkingDay(d, holidays)) out.push(d);
  }
  return out;
}
/** N calendar days from start (inclusive), for a week/board grid. */
export function dayRange(start: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(start, i));
}

/** The Monday of the week containing `day`. */
export function mondayOf(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse the CompanySettings.holidays JSON into a validated set of ISO days. */
export function parseHolidays(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.filter((d): d is string => typeof d === "string" && DAY_RE.test(d)))].sort();
  } catch {
    return [];
  }
}

/** A station's usable hours on a day (0 on weekends / holidays). */
export function capacityOn(station: CapStation, day: string, holidays?: ReadonlySet<string>): number {
  return isWorkingDay(day, holidays) ? Math.max(0, station.hoursPerDay) : 0;
}

// --- utilisation ---

export type UtilCell = { stationId: string; day: string; booked: number; capacity: number; pct: number; overloaded: boolean };

/** Booked-vs-capacity for every (station, day) in `days`. pct is 999 when work is
 * booked onto a zero-capacity day (weekend/holiday) so overload is unmissable. */
export function utilisation(
  stations: CapStation[],
  blocks: CapBlock[],
  days: string[],
  holidays?: ReadonlySet<string>
): UtilCell[] {
  const booked = new Map<string, number>();
  for (const b of blocks) {
    const k = `${b.stationId}|${b.day}`;
    booked.set(k, (booked.get(k) ?? 0) + b.hours);
  }
  const cells: UtilCell[] = [];
  for (const s of stations) {
    for (const day of days) {
      const capacity = capacityOn(s, day, holidays);
      const bk = booked.get(`${s.id}|${day}`) ?? 0;
      const pct = capacity > 0 ? Math.round((bk / capacity) * 100) : bk > 0 ? 999 : 0;
      cells.push({ stationId: s.id, day, booked: round1(bk), capacity, pct, overloaded: bk > capacity + EPS });
    }
  }
  return cells;
}

// --- job hour estimates ---

/** Default workshop hours a single cabinet needs at one station. Deliberately
 * conservative; per-station overrides refine it. */
export const DEFAULT_HOURS_PER_CABINET = 0.75;

export function estimateStationHours(cabinetCount: number, hoursPerCabinet: number = DEFAULT_HOURS_PER_CABINET): number {
  return round1(Math.max(0, cabinetCount) * Math.max(0, hoursPerCabinet));
}

/** Per-station hour estimate for a job of `cabinetCount` cabinets, honouring any
 * per-station override (hours-per-cabinet keyed by station id). */
export function estimateJobHours(
  cabinetCount: number,
  stations: CapStation[],
  overrides: Record<string, number> = {}
): StationHours[] {
  return stations.map((s) => ({
    stationId: s.id,
    hoursPerDay: s.hoursPerDay,
    hours: estimateStationHours(cabinetCount, overrides[s.id] ?? DEFAULT_HOURS_PER_CABINET),
  }));
}

// --- forward feasibility ---

/** Earliest day the job could finish if started on/after `startDay`, running the
 * stations in order (each starts the working day after the previous finishes).
 * Returns null if there's no work. */
export function earliestFinish(startDay: string, hoursByStation: StationHours[], holidays?: ReadonlySet<string>): string | null {
  let cursor = isWorkingDay(startDay, holidays) ? startDay : nextWorkingDay(startDay, holidays);
  let last: string | null = null;
  for (const st of hoursByStation) {
    if (st.hours <= EPS) continue;
    const cap = Math.max(0.5, st.hoursPerDay);
    let remaining = st.hours;
    for (let g = 0; remaining > EPS && g < 2000; g++) {
      remaining -= Math.min(remaining, cap);
      last = cursor;
      if (remaining > EPS) cursor = nextWorkingDay(cursor, holidays);
    }
    cursor = nextWorkingDay(cursor, holidays);
  }
  return last;
}

/** Could the job finish on or before `target` if started on/after `startDay`? */
export function feasibleBy(target: string, startDay: string, hoursByStation: StationHours[], holidays?: ReadonlySet<string>): boolean {
  const f = earliestFinish(startDay, hoursByStation, holidays);
  return f != null && f <= target;
}

// --- backward proposal ---

/** Propose blocks so the job finishes by `dueDate`, filling each station's daily
 * capacity backwards and keeping stations in order (station N+1 never starts
 * before station N finishes). Weekends/holidays are skipped. */
export function proposeBlocks(hoursByStation: StationHours[], dueDate: string, holidays?: ReadonlySet<string>): CapBlock[] {
  const blocks: CapBlock[] = [];
  let endCursor = isWorkingDay(dueDate, holidays) ? dueDate : prevWorkingDay(dueDate, holidays);
  for (let i = hoursByStation.length - 1; i >= 0; i--) {
    const st = hoursByStation[i];
    if (st.hours <= EPS) continue;
    const cap = Math.max(0.5, st.hoursPerDay);
    let remaining = st.hours;
    let day = endCursor;
    let earliest = endCursor;
    for (let g = 0; remaining > EPS && g < 2000; g++) {
      if (isWorkingDay(day, holidays)) {
        const use = Math.min(remaining, cap);
        blocks.push({ stationId: st.stationId, day, hours: round1(use) });
        remaining -= use;
        earliest = day;
      }
      day = addDays(day, -1);
    }
    endCursor = prevWorkingDay(earliest, holidays);
  }
  return blocks.sort((a, b) => a.day.localeCompare(b.day));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
