import { describe, it, expect } from "vitest";
import {
  DESIGN_STAGES,
  isDesignStage,
  designSteps,
  blockingStep,
  nextAction,
  designProgress,
  sortQueue,
  type DesignJob,
} from "./design-queue";

function job(over: Partial<DesignJob> = {}): DesignJob {
  return {
    id: "j1",
    reference: "JOB-1001",
    title: "Smith kitchen",
    clientName: "Smith",
    address: "1 Test St",
    stage: "CHECK_MEASURE",
    rooms: 0,
    roomsCaptured: 0,
    measureStatus: "none",
    mudmaps: 0,
    plans: 0,
    drawing: null,
    ...over,
  };
}

describe("isDesignStage", () => {
  it("covers the pre-production group and nothing else", () => {
    expect(DESIGN_STAGES).toEqual(["CHECK_MEASURE", "DESIGN", "APPROVAL"]);
    expect(isDesignStage("DESIGN")).toBe(true);
    expect(isDesignStage("PRODUCTION")).toBe(false);
    expect(isDesignStage("ENQUIRY")).toBe(false);
  });
});

describe("designSteps", () => {
  it("marks everything outstanding on a fresh job", () => {
    const steps = designSteps(job());
    expect(steps.map((s) => s.key)).toEqual(["measure", "mudmap", "plan", "drawing", "approval"]);
    expect(steps.every((s) => s.state === "todo")).toBe(true);
    expect(steps[0].detail).toBe("Not started");
    expect(steps[2].detail).toBe("Needs measurements");
  });

  it("counts a part-captured measure honestly", () => {
    const steps = designSteps(job({ rooms: 3, roomsCaptured: 1, measureStatus: "draft" }));
    expect(steps[0].state).toBe("todo");
    expect(steps[0].detail).toBe("1 of 3 rooms captured");
  });

  it("only calls the measure done once it is marked complete", () => {
    const drafted = designSteps(job({ rooms: 2, roomsCaptured: 2, measureStatus: "draft" }));
    expect(drafted[0].state).toBe("todo");
    const complete = designSteps(job({ rooms: 2, roomsCaptured: 2, measureStatus: "complete" }));
    expect(complete[0].state).toBe("done");
    expect(complete[0].detail).toBe("2 rooms · complete");
  });

  it("says the plan is ready to draw once anything has been measured", () => {
    expect(designSteps(job({ rooms: 1, roomsCaptured: 1 }))[2].detail).toBe("Ready to draw");
    expect(designSteps(job({ plans: 2 }))[2].detail).toBe("2 plans");
    expect(designSteps(job({ plans: 1 }))[2].state).toBe("done");
  });

  it("treats a draft revision as not yet sent", () => {
    const steps = designSteps(job({ drawing: { label: "Rev A", status: "draft" } }));
    expect(steps[3].state).toBe("todo");
    expect(steps[3].detail).toBe("Rev A · draft");
    expect(steps[4].detail).toBe("Not sent yet");
  });

  it("waits on the client once a revision is sent", () => {
    const steps = designSteps(job({ drawing: { label: "Rev B", status: "sent" } }));
    expect(steps[3].state).toBe("done");
    expect(steps[4].state).toBe("todo");
    expect(steps[4].detail).toBe("Waiting on the client");
  });

  it("counts both approved and released as approved", () => {
    for (const status of ["approved", "released"]) {
      const steps = designSteps(job({ drawing: { label: "Rev C", status } }));
      expect(steps[4].state).toBe("done");
    }
  });
});

describe("blockingStep and nextAction", () => {
  it("points at the measure first", () => {
    expect(blockingStep(job())!.key).toBe("measure");
    expect(nextAction(job())).toEqual({ label: "Start measure", href: "/jobs/j1/measure" });
  });

  it("says finish rather than start once rooms exist", () => {
    expect(nextAction(job({ rooms: 2, roomsCaptured: 1, measureStatus: "draft" })).label).toBe("Finish measure");
  });

  it("moves to the mudmap, then the plan, then the design", () => {
    const measured = job({ rooms: 1, roomsCaptured: 1, measureStatus: "complete" });
    expect(nextAction(measured).label).toBe("Upload mudmap");

    const withMudmap = { ...measured, mudmaps: 1 };
    expect(nextAction(withMudmap).label).toBe("Draw plan");

    const withPlan = { ...withMudmap, plans: 1 };
    expect(nextAction(withPlan)).toEqual({ label: "Upload design", href: "/jobs/j1" });

    const sent = { ...withPlan, drawing: { label: "Rev A", status: "sent" } };
    expect(nextAction(sent).label).toBe("Chase approval");
  });

  it("falls through to the job once every step is done", () => {
    const finished = job({
      rooms: 1,
      roomsCaptured: 1,
      measureStatus: "complete",
      mudmaps: 1,
      plans: 1,
      drawing: { label: "Rev A", status: "approved" },
    });
    expect(blockingStep(finished)).toBeNull();
    expect(nextAction(finished)).toEqual({ label: "Open job", href: "/jobs/j1" });
  });
});

describe("designProgress", () => {
  it("counts completed steps out of five", () => {
    expect(designProgress(job())).toEqual({ done: 0, total: 5 });
    expect(designProgress(job({ measureStatus: "complete", mudmaps: 2 }))).toEqual({ done: 2, total: 5 });
  });
});

describe("sortQueue", () => {
  it("puts the least-progressed job first", () => {
    const fresh = job({ id: "a", reference: "JOB-1003" });
    const measured = job({ id: "b", reference: "JOB-1002", measureStatus: "complete" });
    const nearlyDone = job({
      id: "c",
      reference: "JOB-1001",
      measureStatus: "complete",
      mudmaps: 1,
      plans: 1,
      drawing: { label: "Rev A", status: "sent" },
    });
    expect(sortQueue([nearlyDone, measured, fresh]).map((j) => j.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties on reference so the order is stable between loads", () => {
    const a = job({ id: "a", reference: "JOB-1009" });
    const b = job({ id: "b", reference: "JOB-1002" });
    expect(sortQueue([a, b]).map((j) => j.id)).toEqual(["b", "a"]);
    expect(sortQueue([b, a]).map((j) => j.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the array it was given", () => {
    const list = [job({ id: "a", measureStatus: "complete" }), job({ id: "b" })];
    sortQueue(list);
    expect(list.map((j) => j.id)).toEqual(["a", "b"]);
  });
});
