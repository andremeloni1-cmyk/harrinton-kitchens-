import type { Expense } from "@prisma/client";
import { xeroGet, xeroFetch } from "@/lib/xero/client";

export type XeroBankAccount = { accountId: string; name: string; code?: string };

type XeroAccount = { AccountID: string; Name?: string; Code?: string; Type?: string; Status?: string };
type AccountsResponse = { Accounts?: XeroAccount[] };

/** Lists the org's bank accounts (spend-money must post against one). Returns
 * null when Xero isn't connected. */
export async function listBankAccounts(): Promise<XeroBankAccount[] | null> {
  const res = await xeroGet<AccountsResponse>(`/Accounts?where=${encodeURIComponent('Type=="BANK"')}`);
  if (res === null) return null;
  return (res.Accounts ?? [])
    .filter((a) => a.Status !== "ARCHIVED")
    .map((a) => ({ accountId: a.AccountID, name: a.Name || "Bank account", code: a.Code }));
}

// Xero wants a calendar date (YYYY-MM-DD) in the business timezone (see
// xero/invoices.ts for why UTC truncation is wrong).
const BUSINESS_TZ = process.env.BUSINESS_TZ || "Australia/Sydney";
const ymd = (d: Date) => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

type BankTransaction = { BankTransactionID: string; Status?: string };
type BankTransactionsResponse = { BankTransactions?: BankTransaction[] };

/**
 * Posts a receipt as a SPEND bank transaction against the chosen bank account.
 * The line is GST-inclusive; the expense account's default tax rate decides the
 * GST, so a one-tap reconcile in Xero matches the bank-feed line. Returns the
 * new BankTransactionID, or null when Xero isn't connected.
 */
export async function pushSpendMoney(
  expense: Expense,
  opts: { bankAccountId: string; expenseAccountCode: string }
): Promise<string | null> {
  const res = await xeroFetch<BankTransactionsResponse>("/BankTransactions", {
    method: "POST",
    body: JSON.stringify({
      BankTransactions: [
        {
          Type: "SPEND",
          Contact: { Name: (expense.vendor || "Supplier").slice(0, 500) },
          BankAccount: { AccountID: opts.bankAccountId },
          Date: ymd(expense.date),
          Reference: expense.description?.slice(0, 255) || undefined,
          LineAmountTypes: "Inclusive",
          LineItems: [
            {
              Description: (expense.description || expense.vendor || "Expense").slice(0, 4000),
              Quantity: 1,
              UnitAmount: expense.total,
              AccountCode: opts.expenseAccountCode,
              // No TaxType: let the expense account's default GST treatment apply,
              // which is the most org-portable way to get the right GST.
            },
          ],
        },
      ],
    }),
  });
  return res?.BankTransactions?.[0]?.BankTransactionID ?? null;
}

/** Attaches the receipt image to a spend-money transaction so it's visible in
 * Xero when reconciling. Best-effort — failure here doesn't undo the push. */
export async function attachReceipt(
  bankTransactionId: string,
  filename: string,
  bytes: Buffer,
  mime: string
): Promise<boolean> {
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "receipt.jpg";
  const res = await xeroFetch<{ Attachments?: unknown[] }>(
    `/BankTransactions/${bankTransactionId}/Attachments/${encodeURIComponent(safe)}`,
    {
      method: "PUT",
      body: new Uint8Array(bytes),
      headers: { "content-type": mime },
    }
  );
  return res !== null;
}
