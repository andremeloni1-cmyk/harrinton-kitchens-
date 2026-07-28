"use client";

import type { JobDTO } from "@/lib/job";
import {
  companyKeyOf,
  companyLabel,
  companyPalette,
  paletteMap,
  type CompanyPalette,
  type LegendEntry,
} from "@/lib/colors";

export type BoardJob = JobDTO & { _segStart: string; _segEnd: string; _dayIndex: number; _dayCount: number };

export type BoardLane = {
  id: string;
  name: string;
  /** Installer colour, when they have one — the lane's own identity. */
  color?: string | null;
};

const UNASSIGNED: BoardLane = { id: "__unassigned", name: "Unassigned" };

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * The board: one row per crew, one column per day, a filled cell where they're
 * on something.
 *
 * A month grid answers "what's happening"; this answers "who is on what, and
 * who is free" — the question you actually ask when a job needs slotting in.
 * It scrolls sideways rather than compressing, because a legible week beats an
 * illegible fortnight.
 */
export function CalendarBoard({
  days,
  jobs,
  lanes,
  legend,
  today,
  jobsForDay,
  onOpen,
  onDropOnLaneDay,
  dragId,
  setDragId,
}: {
  days: Date[];
  jobs: JobDTO[];
  lanes: BoardLane[];
  legend: LegendEntry[];
  today: Date;
  jobsForDay: (day: Date) => BoardJob[];
  onOpen: (job: BoardJob) => void;
  onDropOnLaneDay?: (laneId: string, day: Date) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
}) {
  const palettes = paletteMap(legend);
  const paletteOf = (job: JobDTO): CompanyPalette => palettes.get(companyKeyOf(job)) ?? companyPalette(job);

  // Only crews with something on show, plus Unassigned when anything is — an
  // empty lane per installer on the books would be all whitespace.
  const busyLaneIds = new Set<string>();
  let hasUnassigned = false;
  for (const day of days) {
    for (const job of jobsForDay(day)) {
      if (job.installerId) busyLaneIds.add(job.installerId);
      else hasUnassigned = true;
    }
  }
  const rows: BoardLane[] = [
    ...lanes.filter((l) => busyLaneIds.has(l.id)),
    ...(hasUnassigned ? [UNASSIGNED] : []),
  ];

  if (rows.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-stone-500 dark:text-slate-400">
        Nothing booked this week.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[38rem]">
        {/* Day header */}
        <div className="mb-1.5 grid grid-cols-[7rem_repeat(7,minmax(0,1fr))] gap-1">
          <div />
          {days.map((day) => {
            const isToday = sameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={`rounded-lg py-1 text-center text-[11px] font-bold uppercase tracking-wide ${
                  isToday ? "bg-brand-600 text-white" : "text-stone-400 dark:text-slate-500"
                }`}
              >
                <div>{day.toLocaleDateString("en-AU", { weekday: "short" })}</div>
                <div className={isToday ? "text-white" : "text-stone-600 dark:text-slate-300"}>{day.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* One row per crew */}
        <div className="space-y-1">
          {rows.map((lane) => (
            <div key={lane.id} className="grid grid-cols-[7rem_repeat(7,minmax(0,1fr))] items-stretch gap-1">
              <div className="flex items-center gap-1.5 rounded-xl bg-stone-100 px-2.5 py-2 dark:bg-night-850">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: lane.color || "#a8a29e" }}
                />
                <span className="min-w-0 truncate text-xs font-bold text-stone-700 dark:text-slate-200">
                  {lane.name}
                </span>
              </div>

              {days.map((day) => {
                const cellJobs = jobsForDay(day).filter((j) =>
                  lane.id === UNASSIGNED.id ? !j.installerId : j.installerId === lane.id
                );
                const empty = cellJobs.length === 0;
                return (
                  <div
                    key={day.toISOString()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragId) onDropOnLaneDay?.(lane.id, day);
                      setDragId(null);
                    }}
                    className={`flex min-h-[3.25rem] flex-col gap-0.5 rounded-xl p-0.5 transition ${
                      empty
                        ? "bg-stone-100/70 dark:bg-night-850/60"
                        : ""
                    } ${dragId ? "ring-1 ring-dashed ring-brand-400/60" : ""}`}
                  >
                    {cellJobs.map((job) => (
                      <button
                        key={job.id}
                        draggable
                        onDragStart={() => setDragId(job.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => onOpen(job)}
                        title={`${job.title} — ${companyLabel(job)}`}
                        className={`flex-1 rounded-[10px] px-1.5 py-1 text-left transition active:scale-[0.98] ${
                          paletteOf(job).block
                        } ${job.status === "lead" ? "border border-dashed border-current/40" : ""} ${
                          job.status === "completed" ? "opacity-50" : ""
                        }`}
                      >
                        <span className="block truncate text-[10px] font-bold leading-tight">{job.title}</span>
                        {job._dayCount > 1 && (
                          <span className="block text-[9px] leading-tight opacity-70">
                            day {job._dayIndex + 1}/{job._dayCount}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <p className="mt-2 text-[11px] text-stone-400 dark:text-slate-500">
          {jobs.length > 0 ? "Drag a job to another day or crew to move it." : ""}
        </p>
      </div>
    </div>
  );
}

/** Lane list from the installers endpoint's shape. */
export function lanesFromInstallers(installers: { id: string; name: string; color?: string | null }[]): BoardLane[] {
  return installers.map((i) => ({ id: i.id, name: i.name, color: i.color }));
}

export const UNASSIGNED_LANE_ID = UNASSIGNED.id;
