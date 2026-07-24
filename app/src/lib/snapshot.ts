import { prisma } from "@/lib/db";
import { productionRisk, scheduleForWeek, earliestInstall } from "@/lib/capacity-server";
import { currentStation } from "@/lib/factory";
import { computeInsights } from "@/lib/insights";
import { businessYMD } from "@/lib/business-day";

// The business snapshot the Ask-AI feature reasons over (P12.2). Every field is
// deterministic; the AI answers ONLY from what's here. Role-scoped — FACTORY
// answers never include money.

export type Snapshot = {
  role: string;
  pipeline: { stage: string; count: number }[];
  blockers: { job: string; station: string; note: string | null }[];
  production: { job: string; station: string | null }[];
  atRisk: { job: string; reason: string }[];
  capacity: { overloadedStationDaysThisWeek: number; leadTimes: { cabinets: number; earliestInstall: string }[] };
  snags: { openTotal: number; byJob: { job: string; open: number }[] };
  portal: { pendingRequests: number; recentMessages: { job: string; from: string; preview: string }[] };
  money?: { invoicedThisMonth: number; outstanding: number; overdue: number };
};

const LEAD_TIME_SIZES = [6, 10, 12, 15];

export async function buildSnapshot(role: string): Promise<Snapshot> {
  const includeMoney = role !== "FACTORY" && role !== "INSTALLER";
  const today = businessYMD();

  const [grouped, blockedStations, production, risk, schedule, snagsOpen, pendingRequests, recentMsgs, leadTimes, insights] = await Promise.all([
    prisma.job.groupBy({ by: ["pipelineStage"], _count: { _all: true } }),
    prisma.jobStation.findMany({ where: { blocked: true }, select: { blockerNote: true, job: { select: { title: true } }, station: { select: { name: true } } } }),
    prisma.job.findMany({ where: { pipelineStage: "PRODUCTION" }, select: { title: true, jobStations: { orderBy: { position: "asc" }, select: { stationId: true, position: true, status: true } } } }),
    productionRisk(),
    scheduleForWeek(today),
    prisma.snagItem.findMany({ where: { status: "open" }, select: { job: { select: { title: true } } } }),
    prisma.maintenanceRequest.count({ where: { status: "pending" } }),
    prisma.portalMessage.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { sender: true, authorName: true, body: true, job: { select: { title: true } } } }),
    Promise.all(LEAD_TIME_SIZES.map(async (n) => ({ cabinets: n, earliestInstall: (await earliestInstall(n)).install }))),
    includeMoney ? computeInsights() : Promise.resolve(null),
  ]);

  // station id → name for production current-station labels
  const stationNames = new Map((await prisma.station.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name]));

  const snagByJob = new Map<string, number>();
  for (const s of snagsOpen) snagByJob.set(s.job.title, (snagByJob.get(s.job.title) ?? 0) + 1);

  const snapshot: Snapshot = {
    role,
    pipeline: grouped.map((g) => ({ stage: g.pipelineStage, count: g._count._all })).sort((a, b) => b.count - a.count),
    blockers: blockedStations.map((b) => ({ job: b.job.title, station: b.station.name, note: b.blockerNote })),
    production: production.map((p) => {
      const cur = currentStation(p.jobStations.map((s) => ({ ...s })));
      return { job: p.title, station: cur ? stationNames.get(cur.stationId) ?? null : null };
    }),
    atRisk: risk.filter((r) => r.atRisk).map((r) => ({ job: r.title, reason: r.reason || "at risk" })),
    capacity: {
      overloadedStationDaysThisWeek: schedule.cells.filter((c) => c.overloaded).length,
      leadTimes,
    },
    snags: { openTotal: snagsOpen.length, byJob: [...snagByJob.entries()].map(([job, open]) => ({ job, open })) },
    portal: {
      pendingRequests,
      recentMessages: recentMsgs.map((m) => ({ job: m.job.title, from: m.sender === "office" ? m.authorName || "Office" : m.authorName || "Client", preview: m.body.slice(0, 120) })),
    },
  };
  if (insights) {
    snapshot.money = {
      invoicedThisMonth: insights.summary.invoicedThisMonth,
      outstanding: insights.summary.outstanding,
      overdue: insights.summary.overdue,
    };
  }
  return snapshot;
}
