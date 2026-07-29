import { describe, it, expect } from "vitest";
import {
  deriveHardware,
  matchesPattern,
  isPerPanel,
  emptyRule,
  describeRule,
  previewPanelMatches,
  previewCabinetMatches,
  type HardwareRule,
} from "./hardware-rules";
import type { BoardCabinet, BoardPanel, BoardReport } from "./cadmaster";

function panel(over: Partial<BoardPanel> = {}): BoardPanel {
  return {
    code: "DoorLeft",
    qty: 1,
    lengthMm: 746,
    widthMm: 399,
    material: "MELAMINE: White HMR - 16.5mm",
    materialThicknessMm: 16.5,
    edging: { spec: "" },
    ...over,
  };
}

function cabinet(over: Partial<BoardCabinet> = {}): BoardCabinet {
  return {
    index: 1,
    id: "1",
    type: "Floor 1 Door",
    heightMm: 890,
    widthMm: 402,
    depthMm: 555,
    panels: [panel()],
    ...over,
  };
}

function report(cabinets: BoardCabinet[]): BoardReport {
  return { accountName: "", cabinets, warnings: [] };
}

function rule(over: Partial<HardwareRule> = {}): HardwareRule {
  return { ...emptyRule("r1"), name: "Rule", hardwareItemId: "hinge", ...over };
}

describe("matchesPattern", () => {
  it("matches case-insensitively and ignores surrounding space", () => {
    expect(matchesPattern("doorleft", " DoorLeft ")).toBe(true);
  });

  it("treats an empty pattern as anything", () => {
    expect(matchesPattern("", "Floor 1 Door")).toBe(true);
    expect(matchesPattern("   ", "anything")).toBe(true);
  });

  it("supports a leading, trailing and middle wildcard", () => {
    expect(matchesPattern("Door*", "DoorRight")).toBe(true);
    expect(matchesPattern("*Door", "DoorRight")).toBe(false);
    expect(matchesPattern("*Door*", "DoorRight")).toBe(true);
    expect(matchesPattern("Floor * Door", "Floor 2 Door")).toBe(true);
  });

  it("matches every other character literally", () => {
    // "Kickboard AZ *" is a real cabinet type — the asterisk is part of the
    // name. Typing the name you see still matches it: the trailing wildcard
    // happens to cover the literal asterisk.
    expect(matchesPattern("Kickboard AZ *", "Kickboard AZ *")).toBe(true);
    expect(matchesPattern("Kickboard*", "Kickboard AZ *")).toBe(true);
    expect(matchesPattern("Shelf Adj", "Shelf Adj")).toBe(true);
    // A dot is a literal, not a regex "any character".
    expect(matchesPattern("Bak", "Bak.")).toBe(false);
    expect(matchesPattern("Bak.", "Bakx")).toBe(false);
  });

  it("anchors, so a pattern can't half-match", () => {
    expect(matchesPattern("Door", "DoorLeft")).toBe(false);
  });
});

describe("deriveHardware", () => {
  it("counts a per-panel rule once for each matching panel", () => {
    const result = deriveHardware(
      report([cabinet({ panels: [panel({ code: "DoorLeft" }), panel({ code: "DoorRight" })] })]),
      [rule({ panelCode: "Door*", qtyPer: 2 })]
    );
    expect(result.lines).toEqual([
      {
        hardwareItemId: "hinge",
        qty: 4,
        sources: [
          { cabinetIndex: 1, cabinetType: "Floor 1 Door", ruleId: "r1", ruleName: "Rule", panelCode: "DoorLeft", qty: 2 },
          { cabinetIndex: 1, cabinetType: "Floor 1 Door", ruleId: "r1", ruleName: "Rule", panelCode: "DoorRight", qty: 2 },
        ],
      },
    ]);
  });

  it("multiplies by the line quantity, so a '2 @' door line takes both doors' hinges", () => {
    const result = deriveHardware(report([cabinet({ panels: [panel({ code: "DoorLeft", qty: 3 })] })]), [
      rule({ panelCode: "Door*", qtyPer: 2 }),
    ]);
    expect(result.lines[0].qty).toBe(6);
  });

  it("fires a per-cabinet rule once per cabinet regardless of its panels", () => {
    const result = deriveHardware(
      report([cabinet({ index: 1 }), cabinet({ index: 2, panels: [panel(), panel(), panel()] })]),
      [rule({ hardwareItemId: "leg", qtyPer: 4 })]
    );
    expect(result.lines[0]).toMatchObject({ hardwareItemId: "leg", qty: 8 });
  });

  it("lets a hinge schedule be written as overlapping bands, first match winning", () => {
    // "Doors up to 900 take two, up to 1600 take three" — the short door must
    // not collect five hinges from both rules.
    const rules = [
      rule({ id: "short", position: 1, panelCode: "Door*", maxPanelLengthMm: 900, qtyPer: 2 }),
      rule({ id: "tall", position: 2, panelCode: "Door*", maxPanelLengthMm: 1600, qtyPer: 3 }),
    ];
    const short = deriveHardware(report([cabinet({ panels: [panel({ lengthMm: 746 })] })]), rules);
    expect(short.lines[0].qty).toBe(2);

    const tall = deriveHardware(report([cabinet({ panels: [panel({ lengthMm: 1400 })] })]), rules);
    expect(tall.lines[0].qty).toBe(3);
  });

  it("still fires a second rule producing a different stock line on the same panel", () => {
    const result = deriveHardware(report([cabinet()]), [
      rule({ id: "h", position: 1, panelCode: "Door*", hardwareItemId: "hinge", qtyPer: 2 }),
      rule({ id: "k", position: 2, panelCode: "Door*", hardwareItemId: "handle", qtyPer: 1 }),
    ]);
    expect(result.lines.map((l) => [l.hardwareItemId, l.qty])).toEqual([
      ["hinge", 2],
      ["handle", 1],
    ]);
  });

  it("runs rules in position order rather than array order", () => {
    const rules = [
      rule({ id: "tall", position: 9, panelCode: "Door*", qtyPer: 3 }),
      rule({ id: "short", position: 1, panelCode: "Door*", qtyPer: 2 }),
    ];
    expect(deriveHardware(report([cabinet()]), rules).lines[0].qty).toBe(2);
  });

  it("respects cabinet dimension bands", () => {
    const deep = rule({ panelCode: "Door*", minCabinetDepthMm: 500, qtyPer: 2 });
    expect(deriveHardware(report([cabinet({ depthMm: 555 })]), [deep]).lines[0].qty).toBe(2);
    expect(deriveHardware(report([cabinet({ depthMm: 300 })]), [deep]).lines).toEqual([]);
  });

  it("does not fire a size-banded rule against a dimension the report didn't carry", () => {
    const banded = rule({ panelCode: "Door*", minCabinetDepthMm: 500, qtyPer: 2 });
    expect(deriveHardware(report([cabinet({ depthMm: null })]), [banded]).lines).toEqual([]);
  });

  it("ignores an inactive rule", () => {
    expect(deriveHardware(report([cabinet()]), [rule({ panelCode: "Door*", active: false })]).lines).toEqual([]);
  });

  it("names a cabinet type nothing matched, with its panel codes to write a rule against", () => {
    const result = deriveHardware(
      report([
        cabinet({ index: 1 }),
        cabinet({ index: 2, type: "Floor 3 Drawer", panels: [panel({ code: "DrwFrt" }), panel({ code: "Bak" })] }),
        cabinet({ index: 3, type: "Floor 3 Drawer", panels: [panel({ code: "DrwFrt" })] }),
      ]),
      [rule({ panelCode: "Door*", qtyPer: 2 })]
    );
    expect(result.lines[0].qty).toBe(2); // only the door cabinet produced anything
    expect(result.unmatched).toEqual([{ type: "Floor 3 Drawer", count: 2, panelCodes: ["DrwFrt", "Bak"] }]);
  });

  it("does not report a cabinet as unmatched when any rule fired on it", () => {
    const result = deriveHardware(report([cabinet({ type: "Floor 2 Door" })]), [rule({ panelCode: "Door*" })]);
    expect(result.unmatched).toEqual([]);
  });

  it("reports a rule whose pattern caught nothing — usually a typo", () => {
    const result = deriveHardware(report([cabinet()]), [
      rule({ id: "good", panelCode: "Door*" }),
      rule({ id: "typo", panelCode: "Dorr*" }),
    ]);
    expect(result.unusedRuleIds).toEqual(["typo"]);
  });

  it("drops a rule producing nothing rather than recording a zero line", () => {
    expect(deriveHardware(report([cabinet()]), [rule({ panelCode: "Door*", qtyPer: 0 })]).lines).toEqual([]);
  });

  it("totals one stock line across cabinets and keeps every source", () => {
    const result = deriveHardware(
      report([cabinet({ index: 1 }), cabinet({ index: 2, type: "Floor 2 Door", panels: [panel(), panel()] })]),
      [rule({ panelCode: "Door*", qtyPer: 2 })]
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].qty).toBe(6);
    expect(result.lines[0].sources.map((s) => s.cabinetIndex)).toEqual([1, 2, 2]);
  });

  it("returns nothing for an empty report or no rules", () => {
    expect(deriveHardware(report([]), [rule()])).toEqual({ lines: [], unmatched: [], unusedRuleIds: ["r1"] });
    const noRules = deriveHardware(report([cabinet()]), []);
    expect(noRules.lines).toEqual([]);
    expect(noRules.unmatched).toEqual([{ type: "Floor 1 Door", count: 1, panelCodes: ["DoorLeft"] }]);
  });
});

describe("rule helpers", () => {
  it("knows a per-panel rule from a per-cabinet one", () => {
    expect(isPerPanel(rule({ panelCode: "Door*" }))).toBe(true);
    expect(isPerPanel(rule({ panelCode: "  " }))).toBe(false);
  });

  it("previews what a pattern would catch, in pieces", () => {
    const r = report([cabinet({ panels: [panel({ code: "DoorLeft", qty: 2 }), panel({ code: "Bak" })] })]);
    expect(previewPanelMatches(r, "Door*")).toBe(2);
    expect(previewPanelMatches(r, "Bak")).toBe(1);
    expect(previewCabinetMatches(r, "Floor * Door")).toBe(1);
    expect(previewCabinetMatches(r, "Wall*")).toBe(0);
  });

  it("describes a rule in words", () => {
    expect(describeRule(rule({ panelCode: "Door*", qtyPer: 2, cabinetType: "Floor*", maxPanelLengthMm: 900 }))).toBe(
      "2 × per Door* panel · in Floor* · panel length to 900mm"
    );
    expect(describeRule(rule({ qtyPer: 4 }))).toBe("4 × per cabinet");
    expect(describeRule(rule({ panelCode: "Drw*", minPanelLengthMm: 200, maxPanelLengthMm: 400 }))).toBe(
      "1 × per Drw* panel · panel length 200–400mm"
    );
  });
});
