import { describe, it, expect } from "vitest";
import {
  COMPANY_PALETTE,
  companyKeyOf,
  companyLabel,
  companyPalette,
  legendFor,
  paletteMap,
  googleColorId,
} from "./colors";

describe("companyKeyOf", () => {
  it("prefers the explicit company id, then name, then sender, then contact", () => {
    expect(companyKeyOf({ companyId: "c1", companyName: "Bellbrook" })).toBe("id:c1");
    expect(companyKeyOf({ companyName: "  Bellbrook Homes " })).toBe("bellbrook homes");
    expect(companyKeyOf({ leadSource: "Jobs@Builder.com" })).toBe("jobs@builder.com");
    expect(companyKeyOf({ clientName: "Smith" })).toBe("smith");
  });

  it("falls back to an email's domain so one household groups together", () => {
    expect(companyKeyOf({ clientEmail: "jane@example.com" })).toBe("example.com");
    expect(companyKeyOf({ clientEmail: "not-an-email" })).toBe("not-an-email");
  });

  it("has a stable answer for a job carrying nothing", () => {
    expect(companyKeyOf({})).toBe("—");
  });
});

describe("companyLabel", () => {
  it("reads as a person or company, never as a key", () => {
    expect(companyLabel({ companyName: " Bellbrook " })).toBe("Bellbrook");
    expect(companyLabel({ clientName: "Smith" })).toBe("Smith");
    expect(companyLabel({})).toBe("Other");
  });
});

describe("companyPalette", () => {
  it("is stable for the same company across calls", () => {
    const a = companyPalette({ companyId: "c1" });
    const b = companyPalette({ companyId: "c1" });
    expect(a).toBe(b);
  });

  it("gives every entry the classes the calendar renders", () => {
    for (const p of COMPANY_PALETTE) {
      for (const key of ["dot", "bar", "chip", "swatch", "block"] as const) {
        expect(p[key]).toBeTruthy();
      }
      // Both themes, or a dark-mode board cell renders unreadable.
      expect(p.block).toContain("dark:");
    }
  });
});

describe("legendFor", () => {
  const jobs = [
    { companyId: "c1", companyName: "Zeta Homes" },
    { companyId: "c1", companyName: "Zeta Homes" },
    { companyId: "c2", companyName: "Ajax Builders" },
  ];

  it("lists each company once, sorted by label", () => {
    const legend = legendFor(jobs);
    expect(legend.map((e) => e.label)).toEqual(["Ajax Builders", "Zeta Homes"]);
  });

  it("gives no two visible companies the same colour", () => {
    // Enough companies to force collisions off the raw hash.
    const many = Array.from({ length: COMPANY_PALETTE.length }, (_, i) => ({ companyId: `c${i}`, companyName: `Co ${i}` }));
    const legend = legendFor(many);
    const swatches = legend.map((e) => e.palette.swatch);
    expect(new Set(swatches).size).toBe(swatches.length);
  });

  it("degrades honestly past the palette size rather than dropping companies", () => {
    const tooMany = Array.from({ length: COMPANY_PALETTE.length + 4 }, (_, i) => ({
      companyId: `c${i}`,
      companyName: `Co ${i}`,
    }));
    const legend = legendFor(tooMany);
    expect(legend).toHaveLength(COMPANY_PALETTE.length + 4);
    expect(new Set(legend.map((e) => e.label)).size).toBe(legend.length);
  });

  it("is empty for no jobs", () => {
    expect(legendFor([])).toEqual([]);
  });

  it("returns the same colours given the same set, whatever order it arrives in", () => {
    const forward = legendFor(jobs);
    const backward = legendFor([...jobs].reverse());
    expect(backward).toEqual(forward);
  });
});

describe("paletteMap", () => {
  it("looks a job's colour up by the same key the legend used", () => {
    const jobs = [{ companyId: "c1", companyName: "Zeta" }, { companyId: "c2", companyName: "Ajax" }];
    const map = paletteMap(legendFor(jobs));
    for (const job of jobs) {
      expect(map.get(companyKeyOf(job))).toBe(legendFor(jobs).find((e) => e.key === companyKeyOf(job))!.palette);
    }
  });

  it("misses cleanly for a company that isn't in view", () => {
    expect(paletteMap(legendFor([{ companyId: "c1" }])).get("id:nope")).toBeUndefined();
  });
});

describe("googleColorId", () => {
  it("only ever returns an id Google accepts", () => {
    const allowed = new Set(["1", "2", "3", "4", "5", "6", "7", "9", "10", "11"]);
    for (let i = 0; i < 50; i++) {
      expect(allowed.has(googleColorId({ companyId: `c${i}` }))).toBe(true);
    }
  });

  it("is stable for a company, so its Google events keep their colour", () => {
    expect(googleColorId({ companyId: "c1" })).toBe(googleColorId({ companyId: "c1" }));
  });
});
