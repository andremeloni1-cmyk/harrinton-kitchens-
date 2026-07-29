import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { loadOrderList } from "@/lib/hardware-order-server";
import { packsFor } from "@/lib/hardware-order";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * Record hardware coming off the shelf for a job.
 *
 * This is where a reservation stops being a promise and becomes a movement: the
 * job's picked figure goes up (shrinking what it holds against the shelf) and
 * the stock line's on-hand comes down by the same amount. Doing only one of the
 * two would double-count — the classic way an inventory drifts.
 *
 * On-hand is counted in packs and picks happen in pieces, so a part pack
 * drawn down is only deducted once a whole pack has gone. The remainder stays
 * as an opened box on the shelf, which is what is physically true.
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;

  const body = await req.json().catch(() => ({}));
  const hardwareItemId = typeof body.hardwareItemId === "string" ? body.hardwareItemId : "";
  const pieces = Number(body.pieces);
  if (!hardwareItemId || !Number.isFinite(pieces) || pieces === 0) {
    return json({ error: "hardwareItemId and a non-zero pieces are required" }, 400);
  }

  const row = await prisma.jobHardware.findUnique({
    where: { jobId_hardwareItemId: { jobId, hardwareItemId } },
    include: { hardwareItem: true },
  });
  if (!row) return json({ error: "That line isn't on this job's list." }, 404);

  // Never past what the job needs, and never below nothing. A pick beyond the
  // requirement is a data-entry slip, and letting it through would turn the
  // job's reservation negative and hand other jobs stock that isn't there.
  const target = Math.min(Math.max(row.pickedPieces + Math.round(pieces), 0), row.requiredPieces);
  const delta = target - row.pickedPieces;
  if (delta === 0) {
    return json({ ok: true, unchanged: true, lines: await loadOrderList(jobId) });
  }

  const per = row.hardwareItem.piecesPerPack > 0 ? row.hardwareItem.piecesPerPack : 1;
  // Whole packs consumed before this pick versus after it — the difference is
  // what actually leaves the shelf count.
  const packsBefore = packsFor(row.pickedPieces, per) === 0 ? 0 : Math.floor(row.pickedPieces / per);
  const packsAfter = Math.floor(target / per);
  const packDelta = packsAfter - packsBefore;

  await prisma.$transaction(async (tx) => {
    await tx.jobHardware.update({ where: { id: row.id }, data: { pickedPieces: target } });
    if (packDelta !== 0) {
      await tx.hardwareItem.update({
        where: { id: hardwareItemId },
        data: { qtyOnHand: { decrement: packDelta } },
      });
      await tx.hardwareEvent.create({
        data: {
          itemId: hardwareItemId,
          type: "adjusted",
          qty: -packDelta,
          note: `Picked ${delta > 0 ? delta : -delta} piece${Math.abs(delta) === 1 ? "" : "s"} ${delta > 0 ? "for" : "back from"} a job`,
        },
      });
    }
  });

  return json({ ok: true, pickedPieces: target, lines: await loadOrderList(jobId) });
}
