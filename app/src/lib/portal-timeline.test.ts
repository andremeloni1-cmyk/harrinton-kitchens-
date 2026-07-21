import { describe, it, expect } from "vitest";
import { clientMilestones, whatsNext } from "./portal-timeline";

describe("clientMilestones", () => {
  it("marks passed milestones done and the current phase current", () => {
    const ms = clientMilestones("PRODUCTION");
    const by = Object.fromEntries(ms.map((m) => [m.key, m]));
    expect(by.enquiry.done).toBe(true);
    expect(by.design.done).toBe(true);
    expect(by.production.current).toBe(true);
    expect(by.production.done).toBe(false);
    expect(by.install.done).toBe(false);
    expect(by.install.current).toBe(false);
  });
  it("carries known dates through", () => {
    const ms = clientMilestones("INSTALL", { install: "2026-08-10", enquiry: "2026-06-01" });
    expect(ms.find((m) => m.key === "install")?.date).toBe("2026-08-10");
    expect(ms.find((m) => m.key === "enquiry")?.date).toBe("2026-06-01");
  });
  it("at the very start only enquiry is current", () => {
    const ms = clientMilestones("ENQUIRY");
    expect(ms.find((m) => m.key === "enquiry")?.current).toBe(true);
    expect(ms.filter((m) => m.current)).toHaveLength(1);
    expect(ms.filter((m) => m.done)).toHaveLength(0);
  });
  it("CONSULT falls within the quote phase (between DEPOSIT-mapped steps)", () => {
    // CONSULT sits before DEPOSIT; the enquiry milestone is current, quote not yet.
    const ms = clientMilestones("CONSULT");
    expect(ms.find((m) => m.key === "enquiry")?.current).toBe(true);
    expect(ms.find((m) => m.key === "quote")?.done).toBe(false);
  });
});

describe("whatsNext", () => {
  it("gives phase-appropriate copy", () => {
    expect(whatsNext("PRODUCTION")).toMatch(/workshop/i);
    expect(whatsNext("INSTALL")).toMatch(/installation/i);
    expect(whatsNext("ENQUIRY")).toMatch(/enquiry/i);
  });
  it("treats post-handover as complete", () => {
    expect(whatsNext("MAINTENANCE")).toMatch(/enjoy/i);
  });
});
