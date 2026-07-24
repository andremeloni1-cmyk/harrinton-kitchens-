import { describe, it, expect, vi, beforeEach } from "vitest";

// PATCH /api/jobs/[id] — status validation (P2-B2) and the backward-stage-move
// side-effect suppression (P2-B2 / done with P0-4). The permission gate is
// stubbed to succeed here; its role logic is covered in authz.test.ts +
// session.test.ts. prisma and automations are seams so we can assert exactly
// what the handler decides.
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn(async () => ({ id: "u1", name: "A", email: "a@x.co", role: "ADMIN" })),
  isAuthenticated: vi.fn(async () => true),
}));

const jobFindUnique = vi.fn();
const jobUpdate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    job: {
      findUnique: (...a: unknown[]) => jobFindUnique(...a),
      update: (...a: unknown[]) => jobUpdate(...a),
    },
    leadSource: { findUnique: vi.fn(async () => null) },
  },
}));

const runStageTransition = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/automations", () => ({
  runStageTransition: (...a: unknown[]) => runStageTransition(...a),
  onStatusChange: vi.fn(async () => {}),
  onReschedule: vi.fn(async () => {}),
  removeCalendar: vi.fn(async () => {}),
}));
vi.mock("@/lib/contacts", () => ({ rememberContact: vi.fn(async () => {}) }));

import { PATCH } from "./[id]/route";

const P = { params: Promise.resolve({ id: "j1" }) };
const patch = (body: unknown) =>
  PATCH(new Request("http://t/api/jobs/j1", { method: "PATCH", body: JSON.stringify(body) }), P);

const baseJob = {
  id: "j1",
  status: "completed",
  pipelineStage: "HANDOVER",
  clientEmail: null,
  clientName: null,
  clientPhone: null,
  durationMins: 480,
  scheduledStart: null,
  scheduledEnd: null,
  completedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  jobFindUnique.mockReset().mockResolvedValue({ ...baseJob });
  jobUpdate.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...baseJob, ...data }));
  runStageTransition.mockReset().mockResolvedValue(undefined);
});

describe("PATCH /api/jobs/[id] — status validation (P2-B2)", () => {
  it("rejects an unknown status with 400 and does not write", async () => {
    const res = await patch({ status: "banana" });
    expect(res.status).toBe(400);
    expect(jobUpdate).not.toHaveBeenCalled();
  });

  it("accepts a valid status", async () => {
    const res = await patch({ status: "scheduled" });
    expect(res.status).toBe(200);
    expect(jobUpdate).toHaveBeenCalled();
  });
});

describe("PATCH /api/jobs/[id] — email header injection guard (P1-12)", () => {
  it("rejects a clientEmail containing CR/LF and does not write", async () => {
    const res = await patch({ clientEmail: "a@b.com\r\nBcc: evil@x.com" });
    expect(res.status).toBe(400);
    expect(jobUpdate).not.toHaveBeenCalled();
  });

  it("accepts a normal clientEmail", async () => {
    const res = await patch({ clientEmail: "a@b.com" });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/jobs/[id] — backward stage move suppresses side effects (P2-B2)", () => {
  it("suppresses effects when moving backward along the spine (HANDOVER → DEPOSIT)", async () => {
    const res = await patch({ pipelineStage: "DEPOSIT" });
    expect(res.status).toBe(200);
    expect(runStageTransition).toHaveBeenCalledWith(
      expect.anything(),
      "HANDOVER",
      "DEPOSIT",
      expect.objectContaining({ suppressEffects: true })
    );
  });

  it("does NOT suppress effects on a forward move (HANDOVER → MAINTENANCE)", async () => {
    const res = await patch({ pipelineStage: "MAINTENANCE" });
    expect(res.status).toBe(200);
    expect(runStageTransition).toHaveBeenCalledWith(
      expect.anything(),
      "HANDOVER",
      "MAINTENANCE",
      expect.objectContaining({ suppressEffects: false })
    );
  });

  it("honours an explicit forceStageEffects override on a backward move", async () => {
    await patch({ pipelineStage: "DEPOSIT", forceStageEffects: true });
    expect(runStageTransition).toHaveBeenCalledWith(
      expect.anything(),
      "HANDOVER",
      "DEPOSIT",
      expect.objectContaining({ suppressEffects: false })
    );
  });
});
