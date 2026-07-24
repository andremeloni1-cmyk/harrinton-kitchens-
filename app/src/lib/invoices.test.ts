import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import type { Job } from "@prisma/client";

// P1-7: createInvoiceFromJob must retry the unique-number collision (P2002)
// instead of 500ing and silently dropping the invoice.
const invoiceCreate = vi.fn();
const invoiceFindMany = vi.fn(async (..._a: unknown[]) => [] as { number: string }[]);
vi.mock("@/lib/db", () => ({
  prisma: {
    invoice: {
      create: (...a: unknown[]) => invoiceCreate(...a),
      findMany: (...a: unknown[]) => invoiceFindMany(...a),
    },
    variation: { findMany: vi.fn(async (..._a: unknown[]) => []) },
  },
}));
vi.mock("@/lib/clients", () => ({ findOrCreateClientForJob: vi.fn(async (..._a: unknown[]) => ({ id: "c1" })) }));
vi.mock("@/lib/automations", () => ({ logActivity: vi.fn(async (..._a: unknown[]) => {}) }));

import { createInvoiceFromJob } from "./invoices";

const job = { id: "j1", reference: "JOB-1", title: "T", address: null, estimateItems: "[]", quoteAmount: 100, currency: "AUD" } as unknown as Job;
const line = [{ description: "x", quantity: 1, unitAmount: 100 }];
const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5" });

beforeEach(() => {
  invoiceCreate.mockReset();
  invoiceFindMany.mockClear();
});

describe("createInvoiceFromJob — invoice-number collision retry (P1-7)", () => {
  it("retries a P2002 and succeeds", async () => {
    let calls = 0;
    invoiceCreate.mockImplementation(async ({ data }: { data: { number: string } }) => {
      calls++;
      if (calls === 1) throw p2002();
      return { id: "inv1", number: data.number, jobId: "j1" };
    });
    const inv = await createInvoiceFromJob(job, { lineItems: line });
    expect(inv.id).toBe("inv1");
    expect(calls).toBe(2);
  });

  it("gives up after several P2002 retries rather than looping forever", async () => {
    invoiceCreate.mockImplementation(async () => {
      throw p2002();
    });
    await expect(createInvoiceFromJob(job, { lineItems: line })).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError
    );
    // 1 initial + 4 retries = 5 attempts.
    expect(invoiceCreate).toHaveBeenCalledTimes(5);
  });

  it("rethrows a non-P2002 error immediately", async () => {
    invoiceCreate.mockImplementation(async () => {
      throw new Error("db down");
    });
    await expect(createInvoiceFromJob(job, { lineItems: line })).rejects.toThrow("db down");
    expect(invoiceCreate).toHaveBeenCalledTimes(1);
  });
});
