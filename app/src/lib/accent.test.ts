import { describe, it, expect } from "vitest";
import { parseHex, generateAccentRamp, getAccentVarsCss } from "./accent";

describe("parseHex", () => {
  it("parses 6- and 3-digit hex, with or without #", () => {
    expect(parseHex("#b0843b")).toEqual({ r: 176, g: 132, b: 59 });
    expect(parseHex("b0843b")).toEqual({ r: 176, g: 132, b: 59 });
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
  });
  it("rejects invalid input", () => {
    expect(parseHex("nope")).toBeNull();
    expect(parseHex("#12")).toBeNull();
    expect(parseHex("#gggggg")).toBeNull();
  });
});

describe("generateAccentRamp", () => {
  it("returns all 11 steps with the input as 500", () => {
    const ramp = generateAccentRamp("#b0843b")!;
    expect(Object.keys(ramp)).toHaveLength(11);
    expect(ramp[500]).toBe("176 132 59"); // 500 is the untouched base
  });
  it("gets lighter toward 50 and darker toward 950", () => {
    const ramp = generateAccentRamp("#3b82f6")!; // blue
    const lum = (s: string) => s.split(" ").reduce((a, b) => a + Number(b), 0);
    expect(lum(ramp[50])).toBeGreaterThan(lum(ramp[500]));
    expect(lum(ramp[950])).toBeLessThan(lum(ramp[500]));
    expect(lum(ramp[100])).toBeGreaterThan(lum(ramp[300]));
  });
  it("returns null for a bad hex", () => {
    expect(generateAccentRamp("teal")).toBeNull();
  });
});

describe("getAccentVarsCss", () => {
  it("emits a :root block of --brand-* channel vars", () => {
    const css = getAccentVarsCss("#b0843b")!;
    expect(css.startsWith(":root{")).toBe(true);
    expect(css).toContain("--brand-500:176 132 59");
    expect(css).toContain("--brand-50:");
    expect(css).toContain("--brand-950:");
  });
  it("returns null for a bad hex", () => {
    expect(getAccentVarsCss("#zzz")).toBeNull();
  });
});
