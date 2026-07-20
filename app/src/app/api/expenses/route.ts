import { prisma } from "@/lib/db";
import { json, parseDate } from "@/lib/utils";
import { isAuthenticated } from "@/lib/session";
import { isXeroConnected } from "@/lib/xero/oauth";
import { createExpense, pushExpenseToXero, toExpenseDTO } from "@/lib/expenses";

export const dynamic = "force-dynamic";

const RASTER = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function GET() {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const [expenses, account, connected] = await Promise.all([
    prisma.expense.findMany({ orderBy: { date: "desc" } }),
    prisma.companySettings.findFirst(),
    isXeroConnected(),
  ]);
  return json({
    expenses: expenses.map(toExpenseDTO),
    xero: { connected, bankReady: Boolean(account?.xeroBankAccountId) },
  });
}

/** Create an expense from a captured/edited receipt. `push: true` immediately
 * posts it to Xero as spend-money (best-effort — the local record is kept even
 * if the push fails, and the response reports the push error). */
export async function POST(req: Request) {
  if (!(await isAuthenticated())) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));

  const total = Number(body.total);
  if (!Number.isFinite(total) || total <= 0) return json({ error: "A receipt total is required" }, 400);

  const receiptMime = typeof body.receiptMime === "string" && RASTER.has(body.receiptMime) ? body.receiptMime : null;
  const receiptData = receiptMime && typeof body.receiptData === "string" ? body.receiptData : null;

  const expense = await createExpense({
    vendor: body.vendor,
    description: body.description,
    category: body.category,
    date: parseDate(body.date) ?? new Date(),
    total,
    hasGst: body.hasGst !== false,
    gst: body.gst != null ? Number(body.gst) : null,
    jobId: typeof body.jobId === "string" ? body.jobId : null,
    receiptData,
    receiptMime,
  });

  let pushError: string | null = null;
  if (body.push) {
    try {
      await pushExpenseToXero(expense.id);
    } catch (e) {
      pushError = e instanceof Error ? e.message : "Couldn't push to Xero";
    }
  }

  const saved = await prisma.expense.findUnique({ where: { id: expense.id } });
  return json({ expense: saved ? toExpenseDTO(saved) : toExpenseDTO(expense), pushError }, 201);
}
