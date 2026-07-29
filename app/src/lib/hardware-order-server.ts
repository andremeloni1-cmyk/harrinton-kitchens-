// Loading the pieces the order arithmetic needs out of the database.
//
// Kept apart from lib/hardware-order.ts so that stays pure and testable, and so
// the one genuinely subtle query in this feature — "what have *other* jobs
// already spoken for" — has a single definition every caller shares.

import { prisma } from "@/lib/db";
import { isDesignStage } from "@/lib/design-queue";
import {
  buildOrderList,
  type OrderLine,
  type Requirement,
  type StockLine,
} from "@/lib/hardware-order";

/**
 * Jobs whose reservations still hold stock.
 *
 * A job that is finished or dead is not holding anything, and counting it would
 * make the shelf look permanently empty. Everything from the enquiry through to
 * installation is holding — its hardware either hasn't been picked yet or is
 * about to be.
 */
const RELEASED_STAGES = ["COMPLETE", "MAINTENANCE", "LOST", "CANCELLED"];

/** Every stock line, keyed by id, in the shape the arithmetic expects. */
export async function loadStock(): Promise<Map<string, StockLine>> {
  const items = await prisma.hardwareItem.findMany();
  return new Map(items.map((i) => [i.id, i as StockLine]));
}

/**
 * Outstanding pieces held by live jobs *other* than this one, per stock line.
 *
 * Passing the job to exclude rather than filtering afterwards matters: a job
 * must never count its own requirement as competition with itself, which would
 * make every line look twice as short as it is.
 */
export async function loadReservedElsewhere(exceptJobId: string): Promise<Map<string, number>> {
  const rows = await prisma.jobHardware.findMany({
    where: {
      jobId: { not: exceptJobId },
      job: { pipelineStage: { notIn: RELEASED_STAGES } },
    },
    select: { hardwareItemId: true, requiredPieces: true, pickedPieces: true },
  });

  const held = new Map<string, number>();
  for (const row of rows) {
    // Only what is still to come off the shelf. Picked stock has already left
    // qtyOnHand, so counting it here would subtract it twice.
    const outstanding = Math.max(0, row.requiredPieces - row.pickedPieces);
    if (outstanding === 0) continue;
    held.set(row.hardwareItemId, (held.get(row.hardwareItemId) ?? 0) + outstanding);
  }
  return held;
}

export async function loadRequirements(jobId: string): Promise<Requirement[]> {
  const rows = await prisma.jobHardware.findMany({
    where: { jobId },
    select: { hardwareItemId: true, requiredPieces: true, pickedPieces: true },
  });
  return rows.map((r) => ({
    hardwareItemId: r.hardwareItemId,
    requiredPieces: r.requiredPieces,
    pickedPieces: r.pickedPieces,
  }));
}

/** The job's order list, netted against everything else currently in flight. */
export async function loadOrderList(jobId: string): Promise<OrderLine[]> {
  const [requirements, stock, reservedElsewhere] = await Promise.all([
    loadRequirements(jobId),
    loadStock(),
    loadReservedElsewhere(jobId),
  ]);
  return buildOrderList({ requirements, stock, reservedElsewhere });
}

/** True when a job is far enough along for its hardware to be worth ordering. */
export function isOrderableStage(stage: string): boolean {
  return !RELEASED_STAGES.includes(stage) && !isDesignStage(stage);
}

export { RELEASED_STAGES };
