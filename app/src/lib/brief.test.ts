import { describe, it, expect } from "vitest";
import { formatBrief, type OfficeBrief, type FactoryBrief, type InstallerBrief } from "./brief";

describe("formatBrief — numbers rendered verbatim", () => {
  it("office brief surfaces money, approvals and risk", () => {
    const b: OfficeBrief = {
      role: "OFFICE",
      money: { invoicedWeek: 12000, paidWeek: 8000, overdue: 3300, overdueCount: 2 },
      approvals: { unsignedQuotes: 3, drawingsAwaiting: 1 },
      atRisk: [{ title: "Nguyen kitchen", reason: "Not scheduled yet" }],
    };
    const out = formatBrief(b).join("\n");
    expect(out).toContain("$12,000");
    expect(out).toContain("$8,000");
    expect(out).toContain("2 overdue");
    expect(out).toContain("3 quote(s)");
    expect(out).toContain("1 drawing(s)");
    expect(out).toContain("Nguyen kitchen — Not scheduled yet");
  });
  it("office brief is calm when there's nothing to chase", () => {
    const b: OfficeBrief = { role: "OFFICE", money: { invoicedWeek: 0, paidWeek: 0, overdue: 0, overdueCount: 0 }, approvals: { unsignedQuotes: 0, drawingsAwaiting: 0 }, atRisk: [] };
    expect(formatBrief(b).join("\n")).toContain("All quiet");
  });
  it("factory brief lists floor load, overloads and blockers", () => {
    const b: FactoryBrief = { role: "FACTORY", stations: [{ name: "Cutting", jobs: 2 }], blockers: [{ job: "Smith", note: "Missing hinges" }], overloadedToday: 1 };
    const out = formatBrief(b).join("\n");
    expect(out).toContain("Cutting (2)");
    expect(out).toContain("1 station-day(s) overloaded");
    expect(out).toContain("Smith — Missing hinges");
  });
  it("installer brief lists today's installs", () => {
    const b: InstallerBrief = { role: "INSTALLER", installs: [{ title: "Jones kitchen", address: "1 A St", time: "2026-08-10T00:30:00.000Z" }] };
    expect(formatBrief(b).join("\n")).toContain("Jones kitchen — 1 A St");
    expect(formatBrief({ role: "INSTALLER", installs: [] }).join("\n")).toContain("No installs");
  });
});
