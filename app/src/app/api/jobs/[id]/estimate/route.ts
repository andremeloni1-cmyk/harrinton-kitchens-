import { prisma } from "@/lib/db";
import { json } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { visionConfigured } from "@/lib/vision";
import { suggestInvoiceLines } from "@/lib/invoice-ai";
import { computeTotals, type LineItem } from "@/lib/invoices";
import { logActivity } from "@/lib/automations";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseItems(raw: string): LineItem[] {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr
        .filter((i) => i && typeof i.description === "string")
        .map((i) => ({
          description: String(i.description),
          quantity: Number(i.quantity) || 0,
          unitAmount: Number(i.unitAmount) || 0,
        }));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function sanitize(body: unknown): LineItem[] {
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => ({
      description: String((i as LineItem).description || "").trim(),
      quantity: Number((i as LineItem).quantity) || 0,
      unitAmount: Number((i as LineItem).unitAmount) || 0,
    }))
    .filter((i) => i.description);
}

// Estimates are ex-GST component sums, matching how quoteAmount is used.
const estimateTotal = (items: LineItem[]) => computeTotals(items).subtotal;

export async function GET(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);
  const items = parseItems(job.estimateItems);
  return json({ items, total: estimateTotal(items), aiConfigured: visionConfigured() });
}

/** Save the estimate; with `setQuote: true` also set the job's quote amount. */
export async function PATCH(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const id = (await params).id;
  const body = await req.json().catch(() => ({}));
  const items = sanitize(body);
  const total = estimateTotal(items);

  let job;
  try {
    job = await prisma.job.update({
      where: { id },
      data: {
        estimateItems: JSON.stringify(items),
        ...(body.setQuote ? { quoteAmount: total } : {}),
      },
    });
  } catch {
    return json({ error: "not found" }, 404); // deleted job → let offline queue drop it
  }
  if (body.setQuote) {
    await logActivity(job.id, "note", `Quote set from estimate — ${items.length} component(s)`, { total });
  }
  return json({ items: parseItems(job.estimateItems), total, quoteAmount: job.quoteAmount });
}

/** AI-suggest estimate lines from the job description + price list. Returns
 * the lines for review — does not save. */
export async function POST(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const job = await prisma.job.findUnique({ where: { id: (await params).id } });
  if (!job) return json({ error: "not found" }, 404);
  if (!visionConfigured()) {
    return json({ error: "AI isn't configured — add ANTHROPIC_API_KEY to suggest lines." }, 400);
  }

  const items = await prisma.priceItem.findMany({ where: { active: true } });
  if (items.length === 0) {
    return json({ error: "Add some items to your price list first." }, 400);
  }
  const lines = await suggestInvoiceLines(job, items);
  if (lines === null) return json({ error: "Couldn't suggest lines just now." }, 502);
  return json({ lines });
}
