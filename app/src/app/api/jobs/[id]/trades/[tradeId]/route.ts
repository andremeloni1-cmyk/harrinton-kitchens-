import { prisma } from "@/lib/db";
import { json, parseDate } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; tradeId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const { id, tradeId } = await params;
  const existing = await prisma.tradeVisit.findFirst({ where: { id: tradeId, jobId: id } });
  if (!existing) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("trade" in body && typeof body.trade === "string" && body.trade.trim()) data.trade = body.trade.trim();
  if ("company" in body) data.company = body.company?.trim() || null;
  if ("notes" in body) data.notes = body.notes?.trim() || null;
  if ("scheduledStart" in body) {
    const d = parseDate(body.scheduledStart);
    if (d) data.scheduledStart = d;
  }
  if ("scheduledEnd" in body) data.scheduledEnd = parseDate(body.scheduledEnd);
  if ("status" in body && ["scheduled", "done", "cancelled"].includes(body.status)) data.status = body.status;

  const visit = await prisma.tradeVisit.update({ where: { id: tradeId }, data });
  return json({ visit });
}

export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const { id, tradeId } = await params;
  const existing = await prisma.tradeVisit.findFirst({ where: { id: tradeId, jobId: id } });
  if (!existing) return json({ error: "not found" }, 404);
  await prisma.tradeVisit.delete({ where: { id: tradeId } });
  return json({ ok: true });
}
