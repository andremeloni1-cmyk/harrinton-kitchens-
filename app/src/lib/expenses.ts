import { prisma } from "@/lib/db";
import type { Expense } from "@prisma/client";
import { logActivity } from "@/lib/automations";
import { isXeroConnected } from "@/lib/xero/oauth";
import { pushSpendMoney, attachReceipt } from "@/lib/xero/banktransactions";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type ExpenseDTO = {
  id: string;
  vendor: string | null;
  description: string | null;
  category: string | null;
  date: string;
  currency: string;
  total: number;
  gst: number;
  net: number;
  hasGst: boolean;
  status: string;
  jobId: string | null;
  hasReceipt: boolean;
  pushedAt: string | null;
  createdAt: string;
};

/** List/detail shape — omits the heavy base64 receipt image (fetched separately
 * via the receipt endpoint) so list payloads stay small. */
export function toExpenseDTO(e: Expense): ExpenseDTO {
  return {
    id: e.id,
    vendor: e.vendor,
    description: e.description,
    category: e.category,
    date: e.date.toISOString(),
    currency: e.currency,
    total: e.total,
    gst: e.gst,
    net: e.net,
    hasGst: e.hasGst,
    status: e.status,
    jobId: e.jobId,
    hasReceipt: Boolean(e.receiptData),
    pushedAt: e.pushedAt ? e.pushedAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
  };
}

/** Default expense account to book spend-money against (Xero's AU chart uses
 * 400+ for expenses; 400 = "Advertising" varies, so it's overridable). */
export function defaultExpenseAccountCode(): string {
  return process.env.XERO_EXPENSE_ACCOUNT_CODE || "400";
}

/**
 * Split a GST-inclusive total into GST (1B credit) and net. In Australia GST is
 * 1/11th of the inclusive total. An explicit GST figure from the receipt wins;
 * otherwise it's derived, and a GST-free receipt has zero.
 */
export function splitGst(total: number, hasGst: boolean, explicitGst?: number | null): { gst: number; net: number } {
  if (!hasGst) return { gst: 0, net: round2(total) };
  const gst =
    explicitGst != null && Number.isFinite(explicitGst) && explicitGst >= 0
      ? round2(explicitGst)
      : round2(total / 11);
  return { gst, net: round2(total - gst) };
}

export type CreateExpenseInput = {
  vendor?: string | null;
  description?: string | null;
  category?: string | null;
  date?: Date;
  total: number;
  hasGst?: boolean;
  gst?: number | null;
  jobId?: string | null;
  receiptData?: string | null; // base64, no data: prefix
  receiptMime?: string | null;
};

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  const total = round2(Number(input.total) || 0);
  const hasGst = input.hasGst ?? true;
  const { gst, net } = splitGst(total, hasGst, input.gst);
  const expense = await prisma.expense.create({
    data: {
      vendor: input.vendor?.trim() || null,
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      date: input.date ?? new Date(),
      total,
      gst,
      net,
      hasGst,
      jobId: input.jobId || null,
      receiptData: input.receiptData || null,
      receiptMime: input.receiptMime || null,
    },
  });
  await logActivity(expense.jobId, "expense", `Receipt captured — ${expense.vendor || "expense"} ${total.toFixed(2)}`, {
    expenseId: expense.id,
  });
  return expense;
}

/**
 * Pushes an expense to Xero as a spend-money BankTransaction (attaching the
 * receipt image) so it's a one-tap reconcile against the bank feed. Throws a
 * user-facing error when Xero isn't connected or no bank account is chosen.
 */
export async function pushExpenseToXero(expenseId: string): Promise<Expense> {
  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw new Error("Expense not found");
  if (expense.xeroBankTransactionId) return expense; // already pushed — idempotent

  if (!(await isXeroConnected())) throw new Error("Connect Xero in Settings first");
  const account = await prisma.companySettings.findFirst();
  if (!account?.xeroBankAccountId) {
    throw new Error("Choose which Xero bank account receipts post to (Settings → Xero)");
  }

  const bankTxnId = await pushSpendMoney(expense, {
    bankAccountId: account.xeroBankAccountId,
    expenseAccountCode: account.xeroExpenseAccountCode || defaultExpenseAccountCode(),
  });
  if (!bankTxnId) throw new Error("Xero did not accept the spend-money transaction");

  // Attach the receipt image (best-effort — the transaction already exists).
  if (expense.receiptData && expense.receiptMime) {
    const ext = expense.receiptMime.includes("png") ? "png" : "jpg";
    await attachReceipt(
      bankTxnId,
      `receipt-${expense.id}.${ext}`,
      Buffer.from(expense.receiptData, "base64"),
      expense.receiptMime
    ).catch(() => false);
  }

  const updated = await prisma.expense.update({
    where: { id: expense.id },
    data: { status: "pushed", xeroBankTransactionId: bankTxnId, pushedAt: new Date() },
  });
  await logActivity(
    expense.jobId,
    "expense",
    `Receipt pushed to Xero (${expense.vendor || "expense"}) — reconcile against your bank feed`,
    { expenseId: expense.id, xeroBankTransactionId: bankTxnId }
  );
  return updated;
}

/** GST paid on purchases (BAS 1B) over a date range — sum of expense GST. */
export async function gstOnPurchases(from: Date, to?: Date): Promise<{ gst: number; net: number; count: number }> {
  const expenses = await prisma.expense.findMany({
    where: { date: { gte: from, ...(to ? { lt: to } : {}) } },
    select: { gst: true, net: true },
  });
  return {
    gst: round2(expenses.reduce((s, e) => s + e.gst, 0)),
    net: round2(expenses.reduce((s, e) => s + e.net, 0)),
    count: expenses.length,
  };
}
