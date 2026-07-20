import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { requirePermission } from "@/lib/session";
import { PRICE_UNITS, parseCompanyPrices, relevantToCompany, toDTO } from "@/lib/price-list";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const companyId = new URL(req.url).searchParams.get("companyId");
  const items = await prisma.priceItem.findMany({
    orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
  });
  // With a companyId the caller is picking lines for that company's job —
  // only offer that company's rate card (its priced items + generic items).
  const relevant = companyId
    ? items.filter((i) => relevantToCompany(parseCompanyPrices(i.companyPrices), companyId))
    : items;
  return json({ items: relevant.map((i) => toDTO(i, companyId)) });
}

export async function POST(req: Request) {
  const gate = await requirePermission("edit_money");
  if (gate instanceof Response) return gate;
  const body = await req.json().catch(() => ({}));

  const name = String(body.name || "").trim();
  if (!name) return json({ error: "name is required" }, 400);
  const unit = PRICE_UNITS.includes(body.unit) ? body.unit : "each";

  const item = await prisma.priceItem.create({
    data: {
      name,
      unit,
      price: Number(body.price) || 0,
      category: String(body.category || "").trim() || null,
      companyPrices: JSON.stringify(
        body.companyPrices && typeof body.companyPrices === "object" ? body.companyPrices : {}
      ),
    },
  });
  return json({ item: toDTO(item) }, 201);
}
