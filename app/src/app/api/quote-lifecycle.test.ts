import { describe, it, expect, vi, beforeEach } from "vitest";

// P0-9: quote accept must be exactly-once (a conditional claim is the lock), and
// sending a version must refuse an already-accepted quote and supersede older
// still-sent versions.
const getPortalClient = vi.fn(async (..._a: unknown[]) => ({ id: "c1" }));
vi.mock("@/lib/portal-session", () => ({
  getPortalClient: (...a: unknown[]) => getPortalClient(...a),
  newPortalToken: () => ({ token: "t", tokenHash: "h" }),
}));
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn(async (..._a: unknown[]) => ({ id: "u", role: "OFFICE", name: "o", email: "o@x" })),
}));

const quoteFindFirst = vi.fn();
const quoteUpdateMany = vi.fn(async (..._a: unknown[]) => ({ count: 1 }));
const quoteUpdate = vi.fn(async (..._a: unknown[]) => ({}));
const approvalCreate = vi.fn(async (..._a: unknown[]) => ({}));
const jobUpdate = vi.fn(async (..._a: unknown[]) => ({ id: "j1", reference: "JOB-1", title: "T", pipelineStage: "DEPOSIT" }));
const jobFindUnique = vi.fn(async (..._a: unknown[]) => ({ id: "j1", client: null, clientId: null, clientName: "C", clientEmail: null, title: "T" }));
vi.mock("@/lib/db", () => ({
  prisma: {
    quote: {
      findFirst: (...a: unknown[]) => quoteFindFirst(...a),
      updateMany: (...a: unknown[]) => quoteUpdateMany(...a),
      update: (...a: unknown[]) => quoteUpdate(...a),
    },
    approval: { create: (...a: unknown[]) => approvalCreate(...a) },
    job: { update: (...a: unknown[]) => jobUpdate(...a), findUnique: (...a: unknown[]) => jobFindUnique(...a) },
    companySettings: { findFirst: vi.fn(async (..._a: unknown[]) => ({ depositPercent: 30 })) },
    invoice: { findUnique: vi.fn(async (..._a: unknown[]) => ({ number: "INV-1", total: 110, currency: "AUD" })) },
    clientPortalToken: { create: vi.fn(async (..._a: unknown[]) => ({})) },
  },
}));
const createInvoiceFromJob = vi.fn(async (..._a: unknown[]) => ({ id: "inv1" }));
vi.mock("@/lib/invoices", () => ({
  createInvoiceFromJob: (...a: unknown[]) => createInvoiceFromJob(...a),
  pushInvoiceToXero: vi.fn(async (..._a: unknown[]) => ({})),
}));
vi.mock("@/lib/automations", () => ({
  runStageTransition: vi.fn(async (..._a: unknown[]) => {}),
  logActivity: vi.fn(async (..._a: unknown[]) => {}),
}));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock("@/lib/google/gmail", () => ({ sendEmail: vi.fn(async (..._a: unknown[]) => true) }));

import { POST as acceptPOST } from "./portal/quotes/[quoteId]/accept/route";
import { POST as sendPOST } from "./jobs/[id]/quotes/[quoteId]/send/route";

const acceptReq = () => new Request("http://t", { method: "POST", body: JSON.stringify({ signerName: "Jane Doe" }) });
const acceptParams = { params: Promise.resolve({ quoteId: "q1" }) };

beforeEach(() => {
  quoteFindFirst.mockReset();
  quoteUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  quoteUpdate.mockReset().mockResolvedValue({});
  approvalCreate.mockReset().mockResolvedValue({});
  jobUpdate.mockClear();
  createInvoiceFromJob.mockClear();
});

describe("POST accept quote — exactly-once (P0-9)", () => {
  const sentQuote = { id: "q1", jobId: "j1", status: "sent", subtotalCents: 100000, version: 1, currency: "AUD", job: { id: "j1", pipelineStage: "QUOTE", reference: "JOB-1", title: "T" } };

  it("rejects a concurrent/second accept (claim updated 0 rows) with 409 and no deposit", async () => {
    quoteFindFirst.mockResolvedValue(sentQuote);
    quoteUpdateMany.mockResolvedValue({ count: 0 }); // lost the race / already accepted
    const res = await acceptPOST(acceptReq(), acceptParams);
    expect(res.status).toBe(409);
    expect(approvalCreate).not.toHaveBeenCalled();
    expect(createInvoiceFromJob).not.toHaveBeenCalled();
  });

  it("accepts once when the claim wins, creating exactly one approval and deposit", async () => {
    quoteFindFirst.mockResolvedValue(sentQuote);
    quoteUpdateMany.mockResolvedValue({ count: 1 });
    const res = await acceptPOST(acceptReq(), acceptParams);
    expect(res.status).toBe(200);
    expect(quoteUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "q1", status: "sent" } })
    );
    expect(approvalCreate).toHaveBeenCalledTimes(1);
    expect(createInvoiceFromJob).toHaveBeenCalledTimes(1);
  });
});

describe("POST send quote — supersede + refuse re-send (P0-9)", () => {
  const sendReq = { params: Promise.resolve({ id: "j1", quoteId: "q2" }) };

  it("refuses to send an already-accepted quote (409) and does not touch its status", async () => {
    quoteFindFirst.mockResolvedValue({ id: "q2", jobId: "j1", version: 2, status: "accepted", totalCents: 5000, currency: "AUD" });
    const res = await sendPOST(new Request("http://t", { method: "POST" }), sendReq);
    expect(res.status).toBe(409);
    expect(quoteUpdate).not.toHaveBeenCalled();
  });

  it("supersedes older still-sent versions before marking this one sent", async () => {
    quoteFindFirst.mockResolvedValue({ id: "q2", jobId: "j1", version: 2, status: "draft", totalCents: 5000, currency: "AUD" });
    const res = await sendPOST(new Request("http://t", { method: "POST" }), sendReq);
    expect(res.status).toBe(200);
    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { jobId: "j1", status: "sent", version: { lt: 2 } },
      data: { status: "superseded" },
    });
    expect(quoteUpdate).toHaveBeenCalledWith({ where: { id: "q2" }, data: { status: "sent" } });
  });
});
