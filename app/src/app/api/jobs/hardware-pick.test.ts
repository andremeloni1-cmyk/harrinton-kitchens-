import { describe, it, expect, vi, beforeEach } from "vitest";

// Picking is where a reservation becomes a physical movement: the job's picked
// figure rises and the shelf count falls. Getting either half wrong drifts the
// inventory, so the arithmetic is pinned here.
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn(async () => ({ id: "u", role: "FACTORY", name: "f", email: "f@x" })),
}));

const jobHardwareFindUnique = vi.fn();
const jobHardwareUpdate = vi.fn(async (..._a: unknown[]) => ({}));
const itemUpdate = vi.fn(async (..._a: unknown[]) => ({}));
const eventCreate = vi.fn(async (..._a: unknown[]) => ({}));

vi.mock("@/lib/db", () => {
  const tx = {
    jobHardware: { update: (...a: unknown[]) => jobHardwareUpdate(...a) },
    hardwareItem: { update: (...a: unknown[]) => itemUpdate(...a) },
    hardwareEvent: { create: (...a: unknown[]) => eventCreate(...a) },
  };
  return {
    prisma: {
      jobHardware: { findUnique: (...a: unknown[]) => jobHardwareFindUnique(...a) },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

vi.mock("@/lib/hardware-order-server", () => ({ loadOrderList: vi.fn(async () => []) }));

import { POST } from "./[id]/hardware/pick/route";

const P = { params: Promise.resolve({ id: "j1" }) };
const pick = (pieces: number) =>
  POST(new Request("http://t", { method: "POST", body: JSON.stringify({ hardwareItemId: "hinge", pieces }) }), P);

function row(over: { requiredPieces?: number; pickedPieces?: number; piecesPerPack?: number } = {}) {
  return {
    id: "jh1",
    jobId: "j1",
    hardwareItemId: "hinge",
    requiredPieces: over.requiredPieces ?? 250,
    pickedPieces: over.pickedPieces ?? 0,
    hardwareItem: { id: "hinge", piecesPerPack: over.piecesPerPack ?? 100 },
  };
}

beforeEach(() => {
  jobHardwareFindUnique.mockReset();
  jobHardwareUpdate.mockReset().mockResolvedValue({});
  itemUpdate.mockReset().mockResolvedValue({});
  eventCreate.mockReset().mockResolvedValue({});
});

describe("POST hardware pick", () => {
  it("records the pieces and deducts only whole packs from the shelf", async () => {
    jobHardwareFindUnique.mockResolvedValue(row());
    const res = await pick(150);
    expect(res.status).toBe(200);
    expect(jobHardwareUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { pickedPieces: 150 } }));
    // 150 of a 100-pack: one full box gone, the rest is an opened box still on
    // the shelf — which is what is physically true.
    expect(itemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { qtyOnHand: { decrement: 1 } } })
    );
  });

  it("does not touch the shelf when the pick stays inside an opened pack", async () => {
    jobHardwareFindUnique.mockResolvedValue(row({ pickedPieces: 10 }));
    await pick(20);
    expect(jobHardwareUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { pickedPieces: 30 } }));
    expect(itemUpdate).not.toHaveBeenCalled();
  });

  it("clamps a pick beyond what the job needs", async () => {
    jobHardwareFindUnique.mockResolvedValue(row({ requiredPieces: 24, piecesPerPack: 1 }));
    await pick(99);
    // Letting this through would turn the reservation negative and hand other
    // jobs stock that isn't there.
    expect(jobHardwareUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { pickedPieces: 24 } }));
    expect(itemUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { qtyOnHand: { decrement: 24 } } }));
  });

  it("puts stock back when a pick is reversed", async () => {
    jobHardwareFindUnique.mockResolvedValue(row({ pickedPieces: 200 }));
    await pick(-100);
    expect(jobHardwareUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { pickedPieces: 100 } }));
    expect(itemUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { qtyOnHand: { decrement: -1 } } }));
  });

  it("never picks below zero", async () => {
    jobHardwareFindUnique.mockResolvedValue(row({ pickedPieces: 5, piecesPerPack: 1 }));
    await pick(-50);
    expect(jobHardwareUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { pickedPieces: 0 } }));
  });

  it("writes nothing when the pick changes nothing", async () => {
    jobHardwareFindUnique.mockResolvedValue(row({ requiredPieces: 10, pickedPieces: 10 }));
    const res = await pick(5); // already at the ceiling
    expect(res.status).toBe(200);
    expect(jobHardwareUpdate).not.toHaveBeenCalled();
    expect(itemUpdate).not.toHaveBeenCalled();
  });

  it("rejects a line that isn't on the job", async () => {
    jobHardwareFindUnique.mockResolvedValue(null);
    expect((await pick(10)).status).toBe(404);
    expect(jobHardwareUpdate).not.toHaveBeenCalled();
  });

  it("rejects a missing or zero quantity", async () => {
    jobHardwareFindUnique.mockResolvedValue(row());
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify({ pieces: 0 }) }), P);
    expect(res.status).toBe(400);
    expect(jobHardwareUpdate).not.toHaveBeenCalled();
  });
});
