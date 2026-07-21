import { describe, it, expect } from "vitest";
import {
  PIPELINE_STAGES,
  TERMINAL_STAGES,
  ALL_STAGES,
  STAGE_META,
  STAGE_GROUP_META,
  isStage,
  isTerminalStage,
  stageLabel,
  stageIndex,
  stageStatus,
  nextStage,
  stagePillClass,
  stageForLegacyStatus,
  legacyStatusForStage,
  jobStageFields,
  type PipelineStage,
} from "./pipeline";
import { JOB_STATUSES } from "./types";

describe("stage metadata", () => {
  it("has metadata for every stage, linear and terminal", () => {
    for (const stage of ALL_STAGES) {
      expect(STAGE_META[stage]).toBeDefined();
      expect(STAGE_META[stage].label.length).toBeGreaterThan(0);
    }
  });

  it("every group has a pill and dot style", () => {
    for (const stage of ALL_STAGES) {
      const meta = STAGE_GROUP_META[STAGE_META[stage].group];
      expect(meta.pill).toContain("bg-");
      expect(meta.dot).toContain("bg-");
    }
  });

  it("terminal stages are grouped as closed and sit off the spine", () => {
    for (const stage of TERMINAL_STAGES) {
      expect(isTerminalStage(stage)).toBe(true);
      expect(STAGE_META[stage].group).toBe("closed");
      expect(stageIndex(stage)).toBe(-1);
    }
  });

  it("linear stages have monotonically increasing index", () => {
    PIPELINE_STAGES.forEach((stage, i) => {
      expect(stageIndex(stage)).toBe(i);
      expect(isTerminalStage(stage)).toBe(false);
    });
  });
});

describe("nextStage", () => {
  it("walks the spine one step at a time", () => {
    expect(nextStage("ENQUIRY")).toBe("CONSULT");
    expect(nextStage("INSTALL")).toBe("HANDOVER");
  });

  it("returns null at the end of the spine and for terminal stages", () => {
    expect(nextStage("MAINTENANCE")).toBe(null);
    expect(nextStage("CANCELLED")).toBe(null);
    expect(nextStage("LOST")).toBe(null);
  });

  it("can walk the whole spine from ENQUIRY to the end", () => {
    const walked: PipelineStage[] = ["ENQUIRY"];
    let s = nextStage("ENQUIRY");
    while (s) {
      walked.push(s);
      s = nextStage(s);
    }
    expect(walked).toEqual([...PIPELINE_STAGES]);
  });
});

describe("stagePillClass", () => {
  it("colours a stage by its group", () => {
    expect(stagePillClass("QUOTE")).toBe(STAGE_GROUP_META.sales.pill);
    expect(stagePillClass("PRODUCTION")).toBe(STAGE_GROUP_META.factory.pill);
    expect(stagePillClass("CANCELLED")).toBe(STAGE_GROUP_META.closed.pill);
  });
});

describe("isStage / stageLabel", () => {
  it("recognises real stages and rejects junk", () => {
    expect(isStage("PRODUCTION")).toBe(true);
    expect(isStage("CANCELLED")).toBe(true);
    expect(isStage("lead")).toBe(false);
    expect(isStage("")).toBe(false);
  });

  it("labels a stage, and echoes unknown values unchanged", () => {
    expect(stageLabel("CHECK_MEASURE")).toBe("Check measure");
    expect(stageLabel("nonsense")).toBe("nonsense");
  });
});

describe("stageStatus (timeline position)", () => {
  it("marks earlier/current/later along the spine", () => {
    expect(stageStatus("ENQUIRY", "DESIGN")).toBe("done");
    expect(stageStatus("DESIGN", "DESIGN")).toBe("current");
    expect(stageStatus("INSTALL", "DESIGN")).toBe("upcoming");
  });

  it("treats the whole spine as upcoming when the job is on a terminal stage", () => {
    expect(stageStatus("ENQUIRY", "CANCELLED")).toBe("upcoming");
    expect(stageStatus("INSTALL", "LOST")).toBe("upcoming");
  });
});

describe("legacy status bridge", () => {
  it("maps each legacy status onto a valid stage", () => {
    for (const status of JOB_STATUSES) {
      expect(isStage(stageForLegacyStatus(status))).toBe(true);
    }
  });

  it("maps the canonical statuses onto the expected stages", () => {
    expect(stageForLegacyStatus("lead")).toBe("ENQUIRY");
    expect(stageForLegacyStatus("accepted")).toBe("DEPOSIT");
    expect(stageForLegacyStatus("scheduled")).toBe("INSTALL");
    expect(stageForLegacyStatus("in_progress")).toBe("INSTALL");
    expect(stageForLegacyStatus("completed")).toBe("HANDOVER");
    expect(stageForLegacyStatus("cancelled")).toBe("CANCELLED");
  });

  it("falls back to the default stage for unknown statuses", () => {
    expect(stageForLegacyStatus("banana")).toBe("ENQUIRY");
  });

  it("maps every stage back to a valid legacy status", () => {
    for (const stage of ALL_STAGES) {
      expect(JOB_STATUSES).toContain(legacyStatusForStage(stage) as (typeof JOB_STATUSES)[number]);
    }
  });

  it("round-trips a stage → status → stage within the same install bucket", () => {
    // INSTALL and its neighbours all reduce to in_progress, which re-expands to
    // INSTALL — the representative stage for the collapsed legacy states.
    expect(stageForLegacyStatus(legacyStatusForStage("INSTALL"))).toBe("INSTALL");
    expect(stageForLegacyStatus(legacyStatusForStage("ENQUIRY"))).toBe("ENQUIRY");
    expect(stageForLegacyStatus(legacyStatusForStage("DEPOSIT"))).toBe("DEPOSIT");
    expect(stageForLegacyStatus(legacyStatusForStage("HANDOVER"))).toBe("HANDOVER");
  });
});

describe("jobStageFields (mirror invariant)", () => {
  it("returns status unchanged with a consistent pipelineStage", () => {
    for (const status of JOB_STATUSES) {
      const fields = jobStageFields(status);
      expect(fields.status).toBe(status);
      expect(fields.pipelineStage).toBe(stageForLegacyStatus(status));
    }
  });

  it("keeps the two fields in lockstep for a realistic transition", () => {
    const accepted = jobStageFields("accepted");
    expect(accepted).toEqual({ status: "accepted", pipelineStage: "DEPOSIT" as PipelineStage });
  });
});
