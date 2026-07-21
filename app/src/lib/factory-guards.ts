import { prisma } from "@/lib/db";
import { dispatchReadiness, isQcStation, isDispatchStation } from "@/lib/factory";

// Production hold-backs (P8.3). QC can't be signed off until every cabinet has
// passed; the dispatch/last station can't complete until every part is scanned
// out. Both are overridable with a reason (recorded by the caller).

export type GateResult =
  | { blocked: false }
  | { blocked: true; kind: "qc" | "dispatch"; message: string };

async function qcGate(jobId: string): Promise<GateResult> {
  const cabinets = await prisma.cabinet.findMany({ where: { jobId }, select: { name: true, qcPassedAt: true } });
  if (cabinets.length === 0) return { blocked: false }; // no cut list → nothing to hold
  const pending = cabinets.filter((c) => !c.qcPassedAt);
  if (pending.length === 0) return { blocked: false };
  return { blocked: true, kind: "qc", message: `QC not signed off on ${pending.length} of ${cabinets.length} cabinets.` };
}

async function dispatchGate(jobId: string, dispatchPosition: number): Promise<GateResult> {
  const [stations, parts] = await Promise.all([
    prisma.station.findMany({ where: { active: true }, select: { id: true, position: true } }),
    prisma.part.findMany({ where: { jobId, kind: "panel" }, select: { lastStationId: true, cabinet: { select: { name: true } } } }),
  ]);
  if (parts.length === 0) return { blocked: false };
  const posById = new Map(stations.map((s) => [s.id, s.position]));
  const readiness = dispatchReadiness(
    parts.map((p) => ({
      cabinet: p.cabinet?.name ?? null,
      reached: p.lastStationId != null && (posById.get(p.lastStationId) ?? -1) >= dispatchPosition,
    }))
  );
  if (readiness.ready) return { blocked: false };
  const short = readiness.cabinets.filter((c) => c.out < c.total);
  return { blocked: true, kind: "dispatch", message: `Not all parts scanned out — ${short.map((c) => `${c.name} ${c.out}/${c.total}`).join(", ")}.` };
}

/** Gate for completing a single station on the floor. */
export async function stationGate(jobId: string, station: { name: string; position: number }, isLast: boolean): Promise<GateResult> {
  if (isQcStation(station.name)) return qcGate(jobId);
  if (isLast || isDispatchStation(station.name)) return dispatchGate(jobId, station.position);
  return { blocked: false };
}

/** Gate for finishing production in one action — QC first, then dispatch. */
export async function finishGate(jobId: string): Promise<GateResult> {
  const qc = await qcGate(jobId);
  if (qc.blocked) return qc;
  return dispatchReadyGate(jobId);
}

/** Dispatch-only gate: are all of the job's parts scanned out to the last
 * station? Used to gate booking an install (P10.1). */
export async function dispatchReadyGate(jobId: string): Promise<GateResult> {
  const stations = await prisma.station.findMany({ where: { active: true }, orderBy: { position: "desc" }, take: 1, select: { position: true } });
  return dispatchGate(jobId, stations[0]?.position ?? 0);
}
