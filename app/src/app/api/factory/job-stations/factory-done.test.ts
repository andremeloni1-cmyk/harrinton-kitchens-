import { describe, it, expect, vi, beforeEach } from "vitest";

// P0-10: completing a station must advance to the next EXISTING station by
// position, not position+1 — retiring a station leaves gaps, and a +1 lookup
// would skip the rest of the line straight to DELIVERY.
vi.mock("@/lib/session", () => ({
  requirePermission: vi.fn(async () => ({ id: "u", role: "FACTORY", name: "f", email: "f@x" })),
}));

const jobStationFindUnique = vi.fn();
const jobStationFindFirst = vi.fn();
const jobStationUpdate = vi.fn(async (..._a: unknown[]) => ({}));
const jobFindUnique = vi.fn(async (..._a: unknown[]) => ({ pipelineStage: "PRODUCTION" }));
const jobUpdate = vi.fn(async (..._a: unknown[]) => ({ id: "j1", pipelineStage: "DELIVERY", status: "in_progress" }));
vi.mock("@/lib/db", () => ({
  prisma: {
    jobStation: {
      findUnique: (...a: unknown[]) => jobStationFindUnique(...a),
      findFirst: (...a: unknown[]) => jobStationFindFirst(...a),
      update: (...a: unknown[]) => jobStationUpdate(...a),
    },
    job: {
      findUnique: (...a: unknown[]) => jobFindUnique(...a),
      update: (...a: unknown[]) => jobUpdate(...a),
    },
  },
}));
vi.mock("@/lib/factory-guards", () => ({ stationGate: vi.fn(async () => ({ blocked: false })) }));
const runStageTransition = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/automations", () => ({
  runStageTransition: (...a: unknown[]) => runStageTransition(...a),
  logActivity: vi.fn(async () => {}),
}));

import { POST } from "./[id]/done/route";

const post = () => POST(new Request("http://t", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "js-1" }) });

beforeEach(() => {
  jobStationFindUnique.mockReset();
  jobStationFindFirst.mockReset();
  jobStationUpdate.mockReset().mockResolvedValue({});
  jobUpdate.mockClear();
  runStageTransition.mockReset().mockResolvedValue(undefined);
});

describe("factory complete-station across position gaps (P0-10)", () => {
  it("looks up the next station by position > current and does not finish when one exists", async () => {
    jobStationFindUnique.mockResolvedValue({ id: "js-1", jobId: "j1", position: 1, station: { name: "Cut", position: 1 } });
    jobStationFindFirst.mockResolvedValue({ id: "js-3", position: 3 }); // gap at position 2
    const res = await post();
    expect(res.status).toBe(200);
    expect(jobStationFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId: "j1", position: { gt: 1 } }, orderBy: { position: "asc" } })
    );
    expect(jobUpdate).not.toHaveBeenCalled(); // must NOT jump to DELIVERY
    expect((await res.json()).finished).toBe(false);
  });

  it("finishes production only when there is genuinely no later station", async () => {
    jobStationFindUnique.mockResolvedValue({ id: "js-last", jobId: "j1", position: 6, station: { name: "Dispatch", position: 6 } });
    jobStationFindFirst.mockResolvedValue(null);
    const res = await post();
    expect((await res.json()).finished).toBe(true);
    expect(jobUpdate).toHaveBeenCalled(); // advanced to DELIVERY
  });
});
