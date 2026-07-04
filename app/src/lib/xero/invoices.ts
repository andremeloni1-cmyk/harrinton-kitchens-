import type { Invoice } from "@prisma/client";
import { xeroGet, xeroPost } from "@/lib/xero/client";
import type { LineItem } from "@/lib/invoices";

export type XeroInvoiceState = {
  xeroInvoiceId: string;
  status: string; // DRAFT | SUBMITTED | AUTHORISED | PAID | VOIDED | DELETED
  number: string;
  subTotal: number;
  totalTax: number;
  total: number;
  amountDue: number;
  amountPaid: number;
  dueDate?: string;
};

type XeroInvoice = {
  InvoiceID: string;
  InvoiceNumber?: string;
  Status?: string;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  AmountDue?: number;
  AmountPaid?: number;
  DueDateString?: string;
};

type InvoicesResponse = { Invoices?: XeroInvoice[] };

function toState(inv: XeroInvoice): XeroInvoiceState {
  return {
    xeroInvoiceId: inv.InvoiceID,
    status: inv.Status || "DRAFT",
    number: inv.InvoiceNumber || "",
    subTotal: inv.SubTotal ?? 0,
    totalTax: inv.TotalTax ?? 0,
    total: inv.Total ?? 0,
    amountDue: inv.AmountDue ?? 0,
    amountPaid: inv.AmountPaid ?? 0,
    dueDate: inv.DueDateString,
  };
}

// Xero wants a calendar date (YYYY-MM-DD). Use the business timezone, not UTC:
// toISOString() truncates to the UTC day, so an invoice created at 08:00 AEST
// would otherwise be dated the previous day in Xero's books.
const BUSINESS_TZ = process.env.BUSINESS_TZ || "Australia/Sydney";
const ymd = (d: Date) => {
  // en-CA renders as YYYY-MM-DD; timeZone pins it to the business day.
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

/**
 * Creates or updates (when xeroInvoiceId is already set) the ACCREC invoice in
 * Xero. Returns the resulting Xero state, or null when Xero is not connected.
 */
export async function pushInvoice(
  inv: Invoice,
  contactId: string,
  status: "DRAFT" | "AUTHORISED"
): Promise<XeroInvoiceState | null> {
  let items: LineItem[] = [];
  try {
    items = JSON.parse(inv.lineItems);
  } catch {
    /* treat unparseable line items as empty */
  }

  const res = await xeroPost<InvoicesResponse>("/Invoices", {
    Invoices: [
      {
        ...(inv.xeroInvoiceId ? { InvoiceID: inv.xeroInvoiceId } : {}),
        Type: "ACCREC",
        Contact: { ContactID: contactId },
        InvoiceNumber: inv.number,
        ...(inv.reference ? { Reference: inv.reference } : {}),
        Date: ymd(inv.issueDate),
        ...(inv.dueDate ? { DueDate: ymd(inv.dueDate) } : {}),
        CurrencyCode: inv.currency,
        Status: status,
        LineAmountTypes: "Exclusive",
        LineItems: items.map((item) => ({
          Description: item.description,
          Quantity: item.quantity,
          UnitAmount: item.unitAmount,
          AccountCode: item.accountCode || process.env.XERO_SALES_ACCOUNT_CODE || "200",
          ...(item.taxType ? { TaxType: item.taxType } : {}),
        })),
      },
    ],
  });
  const created = res?.Invoices?.[0];
  return created ? toState(created) : null;
}

/** Marks an invoice DELETED (drafts) or VOIDED (authorised, unpaid) in Xero. */
export async function setInvoiceStatus(
  xeroInvoiceId: string,
  status: "DELETED" | "VOIDED"
): Promise<boolean> {
  const res = await xeroPost<InvoicesResponse>("/Invoices", {
    Invoices: [{ InvoiceID: xeroInvoiceId, Status: status }],
  });
  return res !== null;
}

/** Fetches current Xero state for a set of invoices, chunked to stay well
 * inside URL-length and rate limits. */
export async function fetchInvoiceStates(xeroIds: string[]): Promise<XeroInvoiceState[]> {
  const states: XeroInvoiceState[] = [];
  for (let i = 0; i < xeroIds.length; i += 40) {
    const chunk = xeroIds.slice(i, i + 40);
    const res = await xeroGet<InvoicesResponse>(`/Invoices?IDs=${chunk.join(",")}`);
    if (res === null) return states; // disconnected mid-way — return what we have
    for (const inv of res.Invoices ?? []) states.push(toState(inv));
  }
  return states;
}
