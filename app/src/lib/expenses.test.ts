import { describe, it, expect } from "vitest";
import { splitGst } from "./expenses";

// P2-B4: editing an expense must not silently re-derive GST as total/11 and
// discard the receipt's explicit figure; an explicit $0.00 GST is legitimate.
describe("splitGst", () => {
  it("honours an explicit GST figure from the receipt", () => {
    expect(splitGst(110, true, 9.5)).toEqual({ gst: 9.5, net: 100.5 });
  });

  it("accepts an explicit $0.00 GST (>= 0, not just > 0)", () => {
    expect(splitGst(100, true, 0)).toEqual({ gst: 0, net: 100 });
  });

  it("derives 1/11th when no explicit GST is given", () => {
    expect(splitGst(110, true, null)).toEqual({ gst: 10, net: 100 });
    expect(splitGst(110, true, undefined)).toEqual({ gst: 10, net: 100 });
  });

  it("is zero GST for a GST-free receipt regardless of the explicit value", () => {
    expect(splitGst(100, false, 5)).toEqual({ gst: 0, net: 100 });
  });
});
