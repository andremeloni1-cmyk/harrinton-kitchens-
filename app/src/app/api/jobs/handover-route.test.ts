import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LineItem } from "@/lib/invoices";

// P0-8 + P1-9: the handover final invoice must bill the ACCEPTED QUOTE (not the
// stale estimate) and credit amounts already invoiced to the client by their
// invoice TOTAL (so an authorised-but-unpaid deposit is credited). The real
// handover math (@/lib/handover) is kept; only IO is mocked.
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn(async (..._a: unknown[]) => ({ id: "u", role: "OFFICE", name: "o", email: "o@x" })),
}));

const jobFindUnique = vi.fn();
const invoiceFindMany = vi.fn(async (..._a: unknown[]) => [] as { status: string; total: number }[]);
const quoteFindFirst = vi.fn(async (..._a: unknown[]) => null as unknown);
vi.mock("@/lib/db", () => ({
  prisma: {
    job: { findUnique: (...a: unknown[]) => jobFindUnique(...a), update: vi.fn(async () => ({ id: "j1", reference: "JOB-1", title: "Kitchen", pipelineStage: "HANDOVER" })) },
    companySettings: { findFirst: vi.fn(async () => ({ name: "Co" })) },
    drawingSet: { findMany: vi.fn(async () => []) },
    snagItem: { findMany: vi.fn(async () => []) },
    variation: { findMany: vi.fn(async () => []) },
    invoice: { findMany: (...a: unknown[]) => invoiceFindMany(...a) },
    quote: { findFirst: (...a: unknown[]) => quoteFindFirst(...a) },
    approval: { create: vi.fn(async () => ({})) },
    document: { create: vi.fn(async () => ({})) },
  },
}));

let capturedLines: LineItem[] | undefined;
const createInvoiceFromJob = vi.fn(async (_job: unknown, opts?: { lineItems?: LineItem[] }) => {
  capturedLines = opts?.lineItems;
  return { id: "inv1", number: "INV-1" };
});
vi.mock("@/lib/invoices", async (orig) => ({
  ...(await orig<typeof import("@/lib/invoices")>()),
  createInvoiceFromJob: (...a: unknown[]) => (createInvoiceFromJob as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/handover-pdf", () => ({ generateHandoverPdf: vi.fn(async () => null) }));
vi.mock("@/lib/automations", () => ({ runStageTransition: vi.fn(async () => {}), logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/google/gmail", () => ({ sendEmail: vi.fn(async () => true) }));

import { POST } from "./[id]/handover/route";

const post = () =>
  POST(new Request("http://t", { method: "POST", body: JSON.stringify({ signerName: "Jane Doe" }) }), {
    params: Promise.resolve({ id: "j1" }),
  });

beforeEach(() => {
  jobFindUnique.mockReset();
  invoiceFindMany.mockReset().mockResolvedValue([]);
  quoteFindFirst.mockReset().mockResolvedValue(null);
  createInvoiceFromJob.mockClear();
  capturedLines = undefined;
});

const jobWithStaleEstimate = {
  id: "j1",
  reference: "JOB-1",
  title: "Kitchen",
  clientName: "C",
  clientEmail: null,
  address: "1 St",
  estimateItems: JSON.stringify([{ description: "STALE estimate", quantity: 1, unitAmount: 5000 }]), // $5,000
  quoteAmount: 5000,
  pipelineStage: "INSTALL",
};

describe("POST handover — final invoice from accepted quote + credit raised invoices", () => {
  it("bills the accepted quote (ignoring the stale estimate) and credits the authorised deposit's total", async () => {
    jobFindUnique.mockResolvedValue(jobWithStaleEstimate);
    // Accepted contract: $1,000 ex (inc $1,100). Deposit invoice authorised, not paid, total $330 inc.
    quoteFindFirst.mockResolvedValue({ sections: JSON.stringify([{ title: "", lines: [{ description: "Cabinets", quantity: 1, unitAmount: 1000 }] }]), marginPct: 0, subtotalCents: 100000 });
    invoiceFindMany.mockResolvedValue([{ status: "authorised", total: 330 }]);

    const res = await post();
    const body = await res.json();
    // balance = contract inc 1100 − deposit 330 = 770
    expect(body.balance).toBe(770);
    // The invoice lines came from the quote, not the stale estimate.
    expect(capturedLines?.some((l) => l.description === "Cabinets")).toBe(true);
    expect(capturedLines?.some((l) => /STALE/.test(l.description))).toBe(false);
  });

  it("never produces a negative balance for a quote-only job (no estimate)", async () => {
    jobFindUnique.mockResolvedValue({ ...jobWithStaleEstimate, estimateItems: null, quoteAmount: null });
    quoteFindFirst.mockResolvedValue({ sections: JSON.stringify([{ title: "", lines: [{ description: "Cabinets", quantity: 1, unitAmount: 1000 }] }]), marginPct: 0, subtotalCents: 100000 });
    // A deposit larger-than-usual, still <= contract.
    invoiceFindMany.mockResolvedValue([{ status: "paid", total: 1100 }]);
    const res = await post();
    const body = await res.json();
    expect(body.balance).toBeGreaterThanOrEqual(0); // old code would go negative here
  });

  it("excludes voided/draft invoices from the credit", async () => {
    jobFindUnique.mockResolvedValue(jobWithStaleEstimate);
    quoteFindFirst.mockResolvedValue({ sections: JSON.stringify([{ title: "", lines: [{ description: "Cabinets", quantity: 1, unitAmount: 1000 }] }]), marginPct: 0, subtotalCents: 100000 });
    invoiceFindMany.mockResolvedValue([
      { status: "authorised", total: 330 },
      { status: "voided", total: 999 }, // must NOT be credited
      { status: "draft", total: 999 }, // must NOT be credited
    ]);
    const res = await post();
    const body = await res.json();
    expect(body.balance).toBe(770); // only the authorised 330 credited
  });
});
