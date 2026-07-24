import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const item = await prisma.hardwareItem.findUnique({
    where: { id: (await params).id },
    include: { events: { orderBy: { createdAt: "desc" }, take: 30 } },
  });
  if (!item) return json({ error: "not found" }, 404);
  return json({ item });
}

export async function PATCH(req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const id = (await params).id;
  const existing = await prisma.hardwareItem.findUnique({ where: { id } });
  if (!existing) return json({ error: "not found" }, 404);

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const f of ["name", "category", "supplier", "unit", "packSize", "location", "notes", "orderNote"]) {
    if (f in body) data[f] = typeof body[f] === "string" ? body[f].trim() || null : null;
  }
  if ("name" in data && !data.name) data.name = existing.name;
  if ("unit" in data && !data.unit) data.unit = "box";
  for (const f of ["qtyOnHand", "reorderLevel", "orderQty"] as const) {
    if (f in body) {
      const n = Number(body[f]);
      data[f] = Number.isFinite(n) ? Math.max(0, Math.round(n)) : f === "orderQty" ? null : 0;
    }
  }

  const item = await prisma.hardwareItem.update({ where: { id }, data });
  return json({ item });
}

export async function DELETE(_req: Request, { params }: Params) {
  const gate = await requirePermission("factory_board");
  if (gate instanceof Response) return gate;
  const id = (await params).id;
  const existing = await prisma.hardwareItem.findUnique({ where: { id } });
  if (!existing) return json({ error: "not found" }, 404);
  await prisma.hardwareItem.delete({ where: { id } });
  return json({ ok: true });
}
