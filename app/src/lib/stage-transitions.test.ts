import { describe, it, expect } from "vitest";
import {
  STAGE_EFFECTS,
  effectsForTransition,
  type StageEffect,
} from "./stage-transitions";
import { ALL_STAGES, stageForLegacyStatus, type PipelineStage } from "./pipeline";

describe("stage-effect matrix", () => {
  it("defines effects for every stage", () => {
    for (const stage of ALL_STAGES) {
      expect(Array.isArray(STAGE_EFFECTS[stage])).toBe(true);
    }
  });

  it("only uses known effect names", () => {
    const known: StageEffect[] = [
      "calendar_sync",
      "calendar_remove",
      "email_accepted",
      "email_cancelled",
      "sync_pdfs",
      "draft_invoice",
      "portal_event",
      "push_office",
      "init_factory",
    ];
    for (const stage of ALL_STAGES) {
      for (const eff of STAGE_EFFECTS[stage]) {
        expect(known).toContain(eff);
      }
    }
  });

  it("never both syncs and removes the calendar in one stage", () => {
    for (const stage of ALL_STAGES) {
      const effs = STAGE_EFFECTS[stage];
      expect(effs.includes("calendar_sync") && effs.includes("calendar_remove")).toBe(false);
    }
  });
});

describe("legacy parity — the five reachable stages reproduce the old status switch", () => {
  // old switch: accepted -> calendar + accepted email + pdf sync;
  //             scheduled/in_progress -> calendar; completed -> calendar + invoice;
  //             cancelled -> remove calendar + cancelled email; lead -> nothing.
  const cases: Array<[string, StageEffect[]]> = [
    ["lead", []],
    ["accepted", ["calendar_sync", "email_accepted", "sync_pdfs"]],
    ["scheduled", ["calendar_sync"]],
    ["in_progress", ["calendar_sync"]],
    ["completed", ["calendar_sync", "draft_invoice"]],
    ["cancelled", ["calendar_remove", "email_cancelled"]],
  ];

  for (const [status, expected] of cases) {
    it(`${status} → ${stageForLegacyStatus(status)} fires ${expected.join("+") || "nothing"}`, () => {
      const stage = stageForLegacyStatus(status);
      expect(STAGE_EFFECTS[stage]).toEqual(expected);
    });
  }

  it("emails only fire on the accepted/cancelled stages, never elsewhere", () => {
    for (const stage of ALL_STAGES) {
      const emails = STAGE_EFFECTS[stage].filter((e) => e.startsWith("email_"));
      if (stage === "DEPOSIT") expect(emails).toEqual(["email_accepted"]);
      else if (stage === "CANCELLED") expect(emails).toEqual(["email_cancelled"]);
      else expect(emails).toEqual([]);
    }
  });

  it("only the completion stage drafts an invoice", () => {
    const drafting = ALL_STAGES.filter((s) => STAGE_EFFECTS[s].includes("draft_invoice"));
    expect(drafting).toEqual(["HANDOVER"]);
  });
});

describe("effectsForTransition", () => {
  it("returns the entry effects of the target stage", () => {
    expect(effectsForTransition("ENQUIRY", "DEPOSIT")).toEqual(STAGE_EFFECTS.DEPOSIT);
    expect(effectsForTransition("HANDOVER", "CANCELLED")).toEqual(STAGE_EFFECTS.CANCELLED);
  });

  it("re-runs the calendar sync for a collapsed self-transition (scheduled → in_progress)", () => {
    // Both map to INSTALL; the move still re-syncs the calendar, as the old
    // switch did when firing on in_progress.
    const install: PipelineStage = "INSTALL";
    expect(effectsForTransition(install, install)).toEqual(["calendar_sync"]);
  });
});
