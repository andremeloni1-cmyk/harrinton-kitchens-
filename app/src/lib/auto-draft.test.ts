import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "@prisma/client";

// P1-10: autoDraftInvoiceOnComplete must draft the OUTSTANDING BALANCE (contract
// minus already-invoiced), not skip whenever any invoice exists — so completing
// a deposit-only job still bills the remaining balance, without double-billing.
let priorInvoices: { total: number }[] = [];
let acceptedQuote: { subtotalCents: number } | null = null;
const invoiceCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "inv", ...data }));

vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: {
      create: (...a: unknown[]) => invoiceCreate(...(a as [{ data: Record<string, unknown> }])),
      // Discriminate the two findMany callers: autoDraft selects `total`,
      // nextInvoiceNumber selects `number`.
      findMany: async (args?: { select?: { total?: boolean } }) => (args?.select?.total ? priorInvoices : []),
    },
    variation: { findMany: async () => [] },
    quote: { findFirst: async () => acceptedQuote },
  },
}));
vi.mock("@/lib/clients", () => ({ findOrCreateClientForJob: async () => ({ id: "c1" }) }));
vi.mock("@/lib/automations", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/xero/oauth", () => ({ isXeroConnected: async () => false }));

import { autoDraftInvoiceOnComplete } from "./invoices";

const job = { id: "j1", reference: "JOB-1", title: "Kitchen", address: null, estimateItems: "[]", quoteAmount: 1000, currency: "AUD" } as unknown as Job;
const lastData = () => invoiceCreate.mock.calls[invoiceCreate.mock.calls.length - 1][0].data as Record<string, unknown>;

beforeEach(() => {
  priorInvoices = [];
  acceptedQuote = null;
  invoiceCreate.mockClear();
});

describe("autoDraftInvoiceOnComplete (P1-10)", () => {
  it("drafts the balance when a deposit already exists (not a duplicate full invoice)", async () => {
    acceptedQuote = { subtotalCents: 100000 }; // $1,000 ex → $1,100 inc
    priorInvoices = [{ total: 330 }]; // deposit $330 inc
    await autoDraftInvoiceOnComplete(job);
    expect(invoiceCreate).toHaveBeenCalledTimes(1);
    const data = lastData();
    expect(JSON.parse(data.lineItems as string)[0].unitAmount).toBeCloseTo(700, 2); // (1100−330)/1.1
    expect(data.total).toBeCloseTo(770, 2);
  });

  it("skips when the contract is already fully invoiced", async () => {
    acceptedQuote = { subtotalCents: 100000 };
    priorInvoices = [{ total: 1100 }];
    await autoDraftInvoiceOnComplete(job);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("drafts the full contract when there are no prior invoices", async () => {
    priorInvoices = [];
    await autoDraftInvoiceOnComplete(job); // uses job.quoteAmount 1000
    expect(invoiceCreate).toHaveBeenCalledTimes(1);
    expect(lastData().total).toBeCloseTo(1100, 2);
  });

  it("skips when there is no contract value and nothing invoiced", async () => {
    priorInvoices = [];
    await autoDraftInvoiceOnComplete({ ...job, quoteAmount: null, estimateItems: "[]" } as unknown as Job);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });
});
