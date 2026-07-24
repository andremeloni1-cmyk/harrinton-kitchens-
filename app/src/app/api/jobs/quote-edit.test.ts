import { describe, it, expect, vi, beforeEach } from "vitest";

// P2-B3: a quote is only editable while it's a draft — editing a sent/accepted
// version in place would change what the client saw or signed.
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn(async () => ({ id: "u", role: "OFFICE", name: "o", email: "o@x" })),
}));
const quoteFindFirst = vi.fn();
const quoteUpdate = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock("@/lib/db", () => ({
  prisma: { quote: { findFirst: (...a: unknown[]) => quoteFindFirst(...a), update: (...a: unknown[]) => quoteUpdate(...a) } },
}));

import { PATCH } from "./[id]/quotes/[quoteId]/route";

const P = { params: Promise.resolve({ id: "j1", quoteId: "q1" }) };
const patch = () => PATCH(new Request("http://t", { method: "PATCH", body: JSON.stringify({ marginPct: 5 }) }), P);
const row = (status: string) => ({
  id: "q1", jobId: "j1", version: 1, status, currency: "AUD", sections: "[]", marginPct: 0, notes: null,
  subtotalCents: 0, taxCents: 0, totalCents: 0, acceptedAt: null, createdAt: new Date(), updatedAt: new Date(),
});

beforeEach(() => {
  quoteFindFirst.mockReset();
  quoteUpdate.mockReset().mockImplementation(async () => row("draft"));
});

describe("PATCH quote — draft-only edit (P2-B3)", () => {
  for (const status of ["sent", "accepted", "superseded", "declined"]) {
    it(`rejects editing a ${status} quote with 409 and does not write`, async () => {
      quoteFindFirst.mockResolvedValue(row(status));
      const res = await patch();
      expect(res.status).toBe(409);
      expect(quoteUpdate).not.toHaveBeenCalled();
    });
  }

  it("allows editing a draft quote", async () => {
    quoteFindFirst.mockResolvedValue(row("draft"));
    const res = await patch();
    expect(res.status).toBe(200);
    expect(quoteUpdate).toHaveBeenCalled();
  });
});
