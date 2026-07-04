import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { PRICE_UNITS, toDTO } from "@/lib/price-list";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if ("name" in body) {
    const name = String(body.name || "").trim();
    if (!name) return json({ error: "name cannot be empty" }, 400);
    data.name = name;
  }
  if ("unit" in body) data.unit = PRICE_UNITS.includes(body.unit) ? body.unit : "each";
  if ("price" in body) data.price = Number(body.price) || 0;
  if ("category" in body) data.category = String(body.category || "").trim() || null;
  if ("active" in body) data.active = Boolean(body.active);
  if ("companyPrices" in body) {
    data.companyPrices = JSON.stringify(
      body.companyPrices && typeof body.companyPrices === "object" ? body.companyPrices : {}
    );
  }

  try {
    const item = await prisma.priceItem.update({ where: { id: (await params).id }, data });
    return json({ item: toDTO(item) });
  } catch {
    return json({ error: "not found" }, 404);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  try {
    await prisma.priceItem.delete({ where: { id: (await params).id } });
    return json({ ok: true });
  } catch {
    return json({ error: "not found" }, 404);
  }
}
