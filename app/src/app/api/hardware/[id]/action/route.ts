import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// The scan-driven state machine for a hardware line:
//   delivered — stock arrives: qty += n, clears any needs_order/on_order flag
//   flag      — box empty / running low: joins the order list
//   ordered   — office placed the order: needs_order -> on_order
//   unflag    — flagged by mistake: back to ok
export async function POST(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const id = (await params).id;
  const item = await prisma.hardwareItem.findUnique({ where: { id } });
  if (!item) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const qtyRaw = Number(body.qty);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.min(9999, Math.round(qtyRaw)) : 1;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  if (action === "delivered") {
    const updated = await prisma.hardwareItem.update({
      where: { id },
      data: {
        qtyOnHand: item.qtyOnHand + qty,
        orderStatus: "ok",
        orderQty: null,
        orderNote: null,
        flaggedAt: null,
        orderedAt: null,
      },
    });
    await prisma.hardwareEvent.create({
      data: { itemId: id, type: "delivered", qty, note: note || null },
    });
    return json({ item: updated, message: `Delivery logged — ${qty} ${item.unit}${qty === 1 ? "" : "es"} booked in.` });
  }

  if (action === "flag") {
    const updated = await prisma.hardwareItem.update({
      where: { id },
      data: {
        orderStatus: "needs_order",
        orderQty: qty,
        orderNote: note || null,
        flaggedAt: new Date(),
        orderedAt: null,
        // An empty box means that stock is gone — knock it off the count.
        qtyOnHand: Math.max(0, item.qtyOnHand - (body.emptied ? 1 : 0)),
      },
    });
    await prisma.hardwareEvent.create({
      data: { itemId: id, type: "flagged", qty, note: note || null },
    });
    return json({ item: updated, message: "Added to the order list." });
  }

  if (action === "ordered") {
    if (item.orderStatus !== "needs_order") return json({ error: "item is not on the order list" }, 400);
    const updated = await prisma.hardwareItem.update({
      where: { id },
      data: { orderStatus: "on_order", orderedAt: new Date() },
    });
    await prisma.hardwareEvent.create({
      data: { itemId: id, type: "ordered", qty: item.orderQty, note: note || null },
    });
    return json({ item: updated, message: "Marked as ordered." });
  }

  if (action === "unflag") {
    const updated = await prisma.hardwareItem.update({
      where: { id },
      data: { orderStatus: "ok", orderQty: null, orderNote: null, flaggedAt: null, orderedAt: null },
    });
    await prisma.hardwareEvent.create({ data: { itemId: id, type: "adjusted", note: "Removed from order list" } });
    return json({ item: updated, message: "Removed from the order list." });
  }

  return json({ error: "unknown action" }, 400);
}
