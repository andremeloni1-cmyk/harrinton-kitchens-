import { prisma } from "@/lib/db";
import {
  parseHolidays, mondayOf, dayRange, workingDays, utilisation, estimateJobHours, proposeBlocks,
  type CapStation, type CapBlock, type UtilCell,
} from "@/lib/capacity";

// Server glue for the capacity engine (P9.2/P9.3): loads stations/blocks/holidays
// from prisma and hands the pure engine what it needs. Kept thin — all the real
// logic (and its tests) lives in lib/capacity.ts.

export async function holidaySet(): Promise<Set<string>> {
  const settings = await prisma.companySettings.findFirst({ select: { holidays: true } });
  return new Set(parseHolidays(settings?.holidays));
}

export type ScheduleBlockDTO = { id: string; jobId: string; jobRef: string; jobTitle: string; stationId: string; day: string; hours: number };
export type WeekSchedule = {
  weekStart: string;
  days: string[];
  stations: { id: string; name: string; hoursPerDay: number }[];
  cells: UtilCell[];
  blocks: ScheduleBlockDTO[];
};

/** The station×day grid for the (Mon–Fri) week containing `anyDay`. */
export async function scheduleForWeek(anyDay: string): Promise<WeekSchedule> {
  const weekStart = mondayOf(anyDay);
  const days = dayRange(weekStart, 5); // Mon–Fri
  const end = days[days.length - 1];
  const [stations, blocks, holidays] = await Promise.all([
    prisma.station.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    prisma.scheduleBlock.findMany({ where: { day: { gte: weekStart, lte: end } }, include: { job: { select: { reference: true, title: true } } } }),
    holidaySet(),
  ]);
  const capStations: CapStation[] = stations.map((s) => ({ id: s.id, hoursPerDay: s.hoursPerDay }));
  const capBlocks: CapBlock[] = blocks.map((b) => ({ stationId: b.stationId, day: b.day, hours: b.hours }));
  return {
    weekStart,
    days,
    stations: stations.map((s) => ({ id: s.id, name: s.name, hoursPerDay: s.hoursPerDay })),
    cells: utilisation(capStations, capBlocks, days, holidays),
    blocks: blocks.map((b) => ({ id: b.id, jobId: b.jobId, jobRef: b.job.reference, jobTitle: b.job.title, stationId: b.stationId, day: b.day, hours: b.hours })),
  };
}

export type JobRisk = {
  id: string; reference: string; title: string;
  dueDate: string | null; lastDay: string | null; scheduled: boolean;
  atRisk: boolean; reason: string | null;
};

/** Per-job scheduling risk for jobs in production — feeds both the schedule
 * board and the office dashboard. A job is at risk when it's unscheduled, its
 * work runs past its install date, or any of its blocks sit on an overloaded day. */
export async function productionRisk(): Promise<JobRisk[]> {
  const [jobs, stations, holidays] = await Promise.all([
    prisma.job.findMany({
      where: { pipelineStage: "PRODUCTION" },
      select: { id: true, reference: true, title: true, scheduledStart: true, scheduleBlocks: { select: { stationId: true, day: true, hours: true } } },
      orderBy: [{ scheduledStart: "asc" }, { createdAt: "asc" }],
    }),
    prisma.station.findMany({ where: { active: true }, select: { id: true, hoursPerDay: true } }),
    holidaySet(),
  ]);

  // Overloaded (station,day) cells across ALL production work.
  const allBlocks: CapBlock[] = jobs.flatMap((j) => j.scheduleBlocks.map((b) => ({ stationId: b.stationId, day: b.day, hours: b.hours })));
  const days = [...new Set(allBlocks.map((b) => b.day))].sort();
  const overloaded = new Set(
    utilisation(stations, allBlocks, days, holidays).filter((c) => c.overloaded).map((c) => `${c.stationId}|${c.day}`)
  );

  return jobs.map((j) => {
    const dueDate = j.scheduledStart ? j.scheduledStart.toISOString().slice(0, 10) : null;
    const blockDays = j.scheduleBlocks.map((b) => b.day).sort();
    const lastDay = blockDays.length ? blockDays[blockDays.length - 1] : null;
    let atRisk = false;
    let reason: string | null = null;
    if (j.scheduleBlocks.length === 0) {
      atRisk = true;
      reason = "Not scheduled yet";
    } else if (dueDate && lastDay && lastDay > dueDate) {
      atRisk = true;
      reason = "Production runs past the install date";
    } else if (j.scheduleBlocks.some((b) => overloaded.has(`${b.stationId}|${b.day}`))) {
      atRisk = true;
      reason = "Sits on an overloaded day";
    }
    return { id: j.id, reference: j.reference, title: j.title, dueDate, lastDay, scheduled: j.scheduleBlocks.length > 0, atRisk, reason };
  });
}

/** Auto-propose and persist schedule blocks for a job, replacing any existing.
 * Returns the number of blocks written. */
export async function autoScheduleJob(jobId: string, opts: { dueDate?: string; cabinetCount?: number } = {}): Promise<{ count: number; dueDate: string; cabinetCount: number }> {
  const [job, cabinetCount, stations, holidays] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId }, select: { id: true, scheduledStart: true } }),
    prisma.cabinet.count({ where: { jobId } }),
    prisma.station.findMany({ where: { active: true }, orderBy: { position: "asc" }, select: { id: true, hoursPerDay: true } }),
    holidaySet(),
  ]);
  if (!job) throw new Error("job not found");

  const size = opts.cabinetCount ?? (cabinetCount > 0 ? cabinetCount : 8); // sensible default before a cut list exists
  const due = opts.dueDate ?? (job.scheduledStart ? job.scheduledStart.toISOString().slice(0, 10) : defaultDueDate());
  const est = estimateJobHours(size, stations);
  const blocks = proposeBlocks(est, due, holidays);

  await prisma.$transaction([
    prisma.scheduleBlock.deleteMany({ where: { jobId } }),
    ...blocks.map((b) => prisma.scheduleBlock.create({ data: { jobId, stationId: b.stationId, day: b.day, hours: b.hours } })),
  ]);
  return { count: blocks.length, dueDate: due, cabinetCount: size };
}

// Fallback due date (~10 working days out) when a job has no install date yet.
function defaultDueDate(): string {
  const today = new Date().toISOString().slice(0, 10);
  return workingDays(today, dayRange(today, 21)[20])[9] ?? today;
}
