import { prisma } from "@/lib/db";
import { isOverdue } from "@/lib/invoices";
import { productionRisk, scheduleForWeek } from "@/lib/capacity-server";
import { currentStation } from "@/lib/factory";
import { fmtMoney } from "@/lib/format";
import { businessYMD } from "@/lib/business-day";

// Role-aware morning briefs (P12.1). Every number here is computed deterministically
// from the database — an AI layer may phrase the intro, but never the figures.

export type OfficeBrief = {
  role: "OFFICE";
  money: { invoicedWeek: number; paidWeek: number; overdue: number; overdueCount: number };
  approvals: { unsignedQuotes: number; drawingsAwaiting: number };
  atRisk: { title: string; reason: string }[];
};
export type FactoryBrief = {
  role: "FACTORY";
  stations: { name: string; jobs: number }[];
  blockers: { job: string; note: string | null }[];
  overloadedToday: number;
};
export type InstallerBrief = {
  role: "INSTALLER";
  installs: { title: string; time: string | null; address: string | null }[];
};
export type Brief = OfficeBrief | FactoryBrief | InstallerBrief;

function weekAgo(now: Date): Date {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

async function officeBrief(now: Date): Promise<OfficeBrief> {
  const from = weekAgo(now);
  const [invoicedWeek, paidWeek, openInvoices, unsignedQuotes, drawingsAwaiting, risk] = await Promise.all([
    prisma.invoice.findMany({ where: { createdAt: { gte: from, lte: now }, status: { in: ["submitted", "authorised", "paid"] } }, select: { total: true } }),
    prisma.invoice.findMany({ where: { status: "paid", updatedAt: { gte: from, lte: now } }, select: { total: true } }),
    prisma.invoice.findMany({ where: { status: "authorised", amountDue: { gt: 0 } }, select: { amountDue: true, dueDate: true, status: true } }),
    prisma.quote.count({ where: { status: "sent" } }),
    prisma.drawingRevision.count({ where: { status: "sent" } }),
    productionRisk(),
  ]);
  const overdue = openInvoices.filter((i) => isOverdue(i));
  return {
    role: "OFFICE",
    money: {
      invoicedWeek: invoicedWeek.reduce((a, i) => a + i.total, 0),
      paidWeek: paidWeek.reduce((a, i) => a + i.total, 0),
      overdue: overdue.reduce((a, i) => a + i.amountDue, 0),
      overdueCount: overdue.length,
    },
    approvals: { unsignedQuotes, drawingsAwaiting },
    atRisk: risk.filter((r) => r.atRisk).map((r) => ({ title: r.title, reason: r.reason || "at risk" })),
  };
}

async function factoryBrief(now: Date): Promise<FactoryBrief> {
  const [stations, jobs, schedule] = await Promise.all([
    prisma.station.findMany({ where: { active: true }, orderBy: { position: "asc" }, select: { id: true, name: true } }),
    prisma.job.findMany({ where: { pipelineStage: "PRODUCTION" }, select: { title: true, jobStations: { orderBy: { position: "asc" }, select: { id: true, stationId: true, position: true, status: true, blocked: true, blockerNote: true } } } }),
    scheduleForWeek(businessYMD(now)),
  ]);
  const countByStation = new Map<string, number>();
  const blockers: { job: string; note: string | null }[] = [];
  for (const j of jobs) {
    const cur = currentStation(j.jobStations);
    if (cur) countByStation.set(cur.stationId, (countByStation.get(cur.stationId) ?? 0) + 1);
    for (const s of j.jobStations) if (s.blocked) blockers.push({ job: j.title, note: s.blockerNote });
  }
  const today = businessYMD(now);
  const overloadedToday = schedule.cells.filter((c) => c.day === today && c.overloaded).length;
  return {
    role: "FACTORY",
    stations: stations.map((s) => ({ name: s.name, jobs: countByStation.get(s.id) ?? 0 })).filter((s) => s.jobs > 0),
    blockers,
    overloadedToday,
  };
}

async function installerBrief(now: Date, installerId: string | null): Promise<InstallerBrief> {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const jobs = await prisma.job.findMany({
    where: {
      pipelineStage: "INSTALL",
      scheduledStart: { lte: todayEnd },
      OR: [{ scheduledEnd: { gte: todayStart } }, { scheduledEnd: null, scheduledStart: { gte: todayStart } }],
      ...(installerId ? { installerId } : {}),
    },
    orderBy: { scheduledStart: "asc" },
    select: { title: true, address: true, scheduledStart: true },
  });
  return {
    role: "INSTALLER",
    installs: jobs.map((j) => ({ title: j.title, address: j.address, time: j.scheduledStart ? j.scheduledStart.toISOString() : null })),
  };
}

export async function buildBrief(role: string, ctx: { installerId?: string | null } = {}, now = new Date()): Promise<Brief> {
  if (role === "FACTORY") return factoryBrief(now);
  if (role === "INSTALLER") return installerBrief(now, ctx.installerId ?? null);
  return officeBrief(now); // ADMIN / OFFICE / DESIGNER
}

/** A short, deterministic plain-text brief. Numbers are rendered verbatim from
 * the structured brief — no AI in this path. */
export function formatBrief(brief: Brief, currency = "AUD"): string[] {
  if (brief.role === "OFFICE") {
    const lines = [
      `💷 This week: ${fmtMoney(brief.money.invoicedWeek, currency)} invoiced · ${fmtMoney(brief.money.paidWeek, currency)} paid`,
    ];
    if (brief.money.overdueCount > 0) lines.push(`⚠️ ${brief.money.overdueCount} overdue invoice(s) owing ${fmtMoney(brief.money.overdue, currency)}`);
    if (brief.approvals.unsignedQuotes > 0) lines.push(`✍️ ${brief.approvals.unsignedQuotes} quote(s) awaiting the client's signature`);
    if (brief.approvals.drawingsAwaiting > 0) lines.push(`📐 ${brief.approvals.drawingsAwaiting} drawing(s) awaiting approval`);
    if (brief.atRisk.length) {
      lines.push(`🚩 ${brief.atRisk.length} job(s) at schedule risk:`);
      for (const r of brief.atRisk.slice(0, 5)) lines.push(`   • ${r.title} — ${r.reason}`);
    }
    if (lines.length === 1) lines.push("All quiet — nothing needs chasing.");
    return lines;
  }
  if (brief.role === "FACTORY") {
    const lines: string[] = [];
    if (brief.stations.length) lines.push(`🏭 On the floor: ${brief.stations.map((s) => `${s.name} (${s.jobs})`).join(" · ")}`);
    else lines.push("🏭 No jobs on the floor right now.");
    if (brief.overloadedToday > 0) lines.push(`📈 ${brief.overloadedToday} station-day(s) overloaded today — rebalance the schedule.`);
    if (brief.blockers.length) {
      lines.push(`⛔ ${brief.blockers.length} blocker(s):`);
      for (const b of brief.blockers.slice(0, 5)) lines.push(`   • ${b.job}${b.note ? ` — ${b.note}` : ""}`);
    } else lines.push("✅ No blockers.");
    return lines;
  }
  // INSTALLER
  if (!brief.installs.length) return ["🔧 No installs booked for today."];
  const lines = [`🔧 ${brief.installs.length} install(s) today:`];
  for (const i of brief.installs) {
    const t = i.time ? new Date(i.time).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) : "";
    lines.push(`   • ${t ? t + " · " : ""}${i.title}${i.address ? ` — ${i.address}` : ""}`);
  }
  return lines;
}
