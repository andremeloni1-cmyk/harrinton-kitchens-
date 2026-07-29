import { describe, it, expect } from "vitest";
import {
  checkMeasureRef,
  roomRef,
  servicePointRef,
  photoRef,
  refServicePoints,
  parseMeasureRef,
  looksLikeRef,
} from "./measure-ref";
import { emptyRoom, emptyServicePoint } from "./measure";

describe("checkMeasureRef", () => {
  it("reuses the job's number so the two read as a pair", () => {
    expect(checkMeasureRef("JOB-1042")).toBe("CM-1042");
  });

  it("takes the trailing number out of an unusual job reference", () => {
    expect(checkMeasureRef("HK/2026/88")).toBe("CM-88");
  });

  it("slugs a reference with no number rather than refusing it", () => {
    expect(checkMeasureRef("smith kitchen")).toBe("CM-SMITH-KITCHEN");
  });

  it("survives an empty reference", () => {
    expect(checkMeasureRef("")).toBe("CM");
  });
});

describe("sub-references", () => {
  it("numbers rooms, points and photos from one", () => {
    expect(roomRef("CM-1042", 0)).toBe("CM-1042-R1");
    expect(servicePointRef("CM-1042", 1, "power", 0)).toBe("CM-1042-R2-P1");
    expect(servicePointRef("CM-1042", 1, "waste", 2)).toBe("CM-1042-R2-D3");
    expect(photoRef("CM-1042", 0, 2)).toBe("CM-1042-R1-IMG3");
  });

  it("counts each service separately, so power reads P1 P2 regardless of order", () => {
    const room = emptyRoom("r1");
    room.servicePoints = [
      emptyServicePoint("a", "power"),
      emptyServicePoint("b", "water"),
      emptyServicePoint("c", "power"),
    ];
    expect(refServicePoints("CM-1042", 0, room).map((r) => r.ref)).toEqual([
      "CM-1042-R1-P1",
      "CM-1042-R1-W1",
      "CM-1042-R1-P2",
    ]);
  });
});

describe("parseMeasureRef", () => {
  it("reads a whole-measure reference", () => {
    expect(parseMeasureRef("CM-1042")).toEqual({
      cmRef: "CM-1042",
      roomIndex: null,
      kind: null,
      itemIndex: null,
      photo: false,
    });
  });

  it("reads a room reference typed in lower case with stray spaces", () => {
    expect(parseMeasureRef("  cm-1042-r2 ")).toMatchObject({ cmRef: "CM-1042", roomIndex: 1 });
  });

  it("reads a service point back to its kind and index", () => {
    expect(parseMeasureRef("CM-1042-R2-P3")).toMatchObject({
      cmRef: "CM-1042",
      roomIndex: 1,
      kind: "power",
      itemIndex: 2,
      photo: false,
    });
  });

  it("reads a photo reference", () => {
    expect(parseMeasureRef("CM-1042-R1-IMG4")).toMatchObject({ roomIndex: 0, photo: true, itemIndex: 3, kind: null });
  });

  it("round-trips a slug reference without swallowing the room suffix", () => {
    expect(parseMeasureRef(`${checkMeasureRef("smith kitchen")}-R2`)).toMatchObject({
      cmRef: "CM-SMITH-KITCHEN",
      roomIndex: 1,
    });
  });

  it("rejects text that isn't a reference", () => {
    expect(parseMeasureRef("Kitchen")).toBeNull();
    expect(parseMeasureRef("JOB-1042")).toBeNull();
    expect(parseMeasureRef("CM-1042-R0")).toBeNull();
    expect(looksLikeRef("3600mm")).toBe(false);
  });
});
