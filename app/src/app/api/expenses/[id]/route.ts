import { prisma } from "@/lib/db";
import { json, parseDate } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { splitGst, toExpenseDTO } from "@/lib/expenses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const expense = await prisma.expense.findUnique({ where: { id: (await params).id } });
  if (!expense) return json({ error: "not found" }, 404);
  return json({ expense: toExpenseDTO(expense) });
}

/** Edit a captured expense. Blocked once pushed to Xero (409) — the Xero copy is
 * authoritative then; delete and re-capture if it's wrong. */
export async function PATCH(req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const id = (await params).id;
  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return json({ error: "not found" }, 404);
  if (existing.xeroBankTransactionId) {
    return json({ error: "Already pushed to Xero — delete and re-capture to change it." }, 409);
  }

  const body = await req.json().catch(() => ({}));
  const total = "total" in body ? round2(Number(body.total) || 0) : existing.total;
  const hasGst = "hasGst" in body ? body.hasGst !== false : existing.hasGst;
  const explicitGst = "gst" in body ? Number(body.gst) : null;
  const { gst, net } = splitGst(total, hasGst, explicitGst);

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      vendor: "vendor" in body ? String(body.vendor || "").trim() || null : existing.vendor,
      description: "description" in body ? String(body.description || "").trim() || null : existing.description,
      category: "category" in body ? String(body.category || "").trim() || null : existing.category,
      date: "date" in body ? parseDate(body.date) ?? existing.date : existing.date,
      jobId: "jobId" in body ? (typeof body.jobId === "string" ? body.jobId : null) : existing.jobId,
      total,
      hasGst,
      gst,
      net,
    },
  });
  return json({ expense: toExpenseDTO(expense) });
}

export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  try {
    await prisma.expense.delete({ where: { id: (await params).id } });
  } catch {
    return json({ error: "not found" }, 404);
  }
  return json({ ok: true });
}

const round2 = (n: number) => Math.round(n * 100) / 100;
