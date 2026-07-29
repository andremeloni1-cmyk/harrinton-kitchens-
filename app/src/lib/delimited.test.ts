import { describe, it, expect } from "vitest";
import { splitDelimited, detectDelimiter } from "./delimited";

describe("splitDelimited", () => {
  it("keeps a quoted field containing the delimiter in one piece", () => {
    expect(splitDelimited('Kitchen,power,"GPO, double",,Wall A', ",")).toEqual([
      "Kitchen",
      "power",
      "GPO, double",
      "",
      "Wall A",
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(splitDelimited('a,"say ""hi"""', ",")).toEqual(["a", 'say "hi"']);
  });
});

describe("detectDelimiter", () => {
  it("prefers a tab, which is never punctuation inside a field", () => {
    expect(detectDelimiter("a\tb,c")).toBe("\t");
  });

  it("falls back to a comma, then a semicolon", () => {
    expect(detectDelimiter("a,b")).toBe(",");
    expect(detectDelimiter("a;b")).toBe(";");
  });

  it("finds none in a line that holds none", () => {
    expect(detectDelimiter("Kitchen")).toBeNull();
  });
});
