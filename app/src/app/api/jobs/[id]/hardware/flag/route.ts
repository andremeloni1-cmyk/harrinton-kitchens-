import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { logActivity } from "@/lib/automations";
import { loadOrderList } from "@/lib/hardware-order-server";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * Flag this job's shortfalls for reordering.
 *
 * The ordering loop already exists — ok → needs_order → on_order → ok — and is
 * driven from the shop floor by scanning an empty box. This is the same loop
 * entered from the other end: the office knows a job is short before anyone
 * reaches for the last one.
 *
 * Nothing already on order is touched. Re-flagging a line the office has
 * already acted on is how something gets ordered twice.
 */
export async function POST(_req: Request, { params }: Params) {
  const gate = await requirePermission("manage_jobs");
  if (gate instanceof Response) return gate;
  const jobId = (await params).id;

  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, reference: true } });
  if (!job) return json({ error: "not found" }, 404);

  const lines = await loadOrderList(jobId);
  const short = lines.filter((l) => l.status === "short");
  if (short.length === 0) return json({ ok: true, flagged: 0, lines });

  for (const line of short) {
    const item = await prisma.hardwareItem.findUnique({
      where: { id: line.hardwareItemId },
      select: { id: true, orderStatus: true, orderQty: true },
    });
    if (!item || item.orderStatus === "on_order") continue;

    // A line already flagged for another job keeps the larger quantity — the
    // order has to cover both, and taking the newer figure could shrink it.
    const orderQty = Math.max(item.orderQty ?? 0, line.orderPacks);
    await prisma.hardwareItem.update({
      where: { id: item.id },
      data: {
        orderStatus: "needs_order",
        orderQty,
        orderNote: `Short for ${job.reference}`,
        flaggedAt: new Date(),
      },
    });
    await prisma.hardwareEvent.create({
      data: {
        itemId: item.id,
        type: "flagged",
        qty: line.orderPacks,
        note: `${job.reference} short ${line.shortfallPieces} piece${line.shortfallPieces === 1 ? "" : "s"}`,
      },
    });
  }

  await logActivity(jobId, "note", `Flagged ${short.length} hardware line${short.length === 1 ? "" : "s"} for reorder`).catch(
    () => {}
  );
  return json({ ok: true, flagged: short.length, lines: await loadOrderList(jobId) });
}
