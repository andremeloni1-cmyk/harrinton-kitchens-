import { describe, it, expect } from "vitest";
import { detectRisks, formatRisks, RISK_THRESHOLDS, type RiskInput } from "./risk";

const clear: RiskInput = { overloadedStationDays: 0, staleApprovals: [], unsignedQuotes: 0, agingSnags: [], unpaidDeposits: [] };

describe("detectRisks — thresholds are named constants", () => {
  it("no risks when everything is within thresholds", () => {
    const risks = detectRisks({
      ...clear,
      overloadedStationDays: RISK_THRESHOLDS.OVERLOAD_STATION_DAYS - 1,
      staleApprovals: [{ label: "Quote v1", ageDays: RISK_THRESHOLDS.STALE_APPROVAL_DAYS - 1 }],
      agingSnags: [{ job: "A", ageDays: RISK_THRESHOLDS.SNAG_AGING_DAYS - 1 }],
      unpaidDeposits: [{ job: "B", ageDays: RISK_THRESHOLDS.DEPOSIT_UNPAID_DAYS - 1 }],
    });
    expect(risks).toEqual([]);
    expect(formatRisks(risks)[0]).toMatch(/on track/i);
  });

  it("surfaces every seeded risk scenario at/above its threshold", () => {
    const risks = detectRisks({
      overloadedStationDays: 4,
      staleApprovals: [{ label: "Drawing Rev B", ageDays: 9 }],
      unsignedQuotes: 2,
      agingSnags: [{ job: "Nguyen", ageDays: 20 }],
      unpaidDeposits: [{ job: "Smith", ageDays: 10 }],
    });
    const kinds = risks.map((r) => r.kind);
    expect(kinds).toContain("capacity");
    expect(kinds).toContain("stale_approval");
    expect(kinds).toContain("unsigned_quotes");
    expect(kinds).toContain("aging_snag");
    expect(kinds).toContain("unpaid_deposit");
  });

  it("escalates severity: big overload and unpaid deposits are high", () => {
    const risks = detectRisks({ ...clear, overloadedStationDays: 3, unpaidDeposits: [{ job: "Smith", ageDays: 10 }] });
    expect(risks.find((r) => r.kind === "capacity")?.severity).toBe("high");
    expect(risks.find((r) => r.kind === "unpaid_deposit")?.severity).toBe("high");
    // high-severity items sort first
    expect(risks[0].severity).toBe("high");
  });

  it("boundary: exactly at threshold counts as a risk", () => {
    expect(detectRisks({ ...clear, agingSnags: [{ job: "A", ageDays: RISK_THRESHOLDS.SNAG_AGING_DAYS }] }).length).toBe(1);
  });
});
