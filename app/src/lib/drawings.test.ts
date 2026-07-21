import { describe, it, expect } from "vitest";
import {
  canTransition,
  isRevisionLocked,
  isRevisionStatus,
  nextRevisionLabel,
  REVISION_STATUSES,
} from "./drawings";

describe("canTransition", () => {
  it("allows the forward lifecycle only", () => {
    expect(canTransition("draft", "sent")).toBe(true);
    expect(canTransition("sent", "approved")).toBe(true);
    expect(canTransition("sent", "draft")).toBe(true); // pull back to revise
    expect(canTransition("approved", "released")).toBe(true);
  });

  it("rejects skips and backward moves", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("draft", "released")).toBe(false);
    expect(canTransition("approved", "draft")).toBe(false);
    expect(canTransition("approved", "sent")).toBe(false);
    expect(canTransition("released", "draft")).toBe(false);
    expect(canTransition("released", "approved")).toBe(false);
  });

  it("rejects unknown statuses", () => {
    expect(canTransition("draft", "banana")).toBe(false);
    expect(canTransition("nope", "sent")).toBe(false);
  });
});

describe("isRevisionLocked", () => {
  it("locks approved and released, leaves draft/sent editable", () => {
    expect(isRevisionLocked("draft")).toBe(false);
    expect(isRevisionLocked("sent")).toBe(false);
    expect(isRevisionLocked("approved")).toBe(true);
    expect(isRevisionLocked("released")).toBe(true);
  });
});

describe("nextRevisionLabel", () => {
  it("counts up A, B, C…", () => {
    expect(nextRevisionLabel(0)).toBe("Rev A");
    expect(nextRevisionLabel(1)).toBe("Rev B");
    expect(nextRevisionLabel(25)).toBe("Rev Z");
    expect(nextRevisionLabel(26)).toBe("Rev 27");
  });
});

describe("isRevisionStatus", () => {
  it("recognises the four statuses", () => {
    for (const s of REVISION_STATUSES) expect(isRevisionStatus(s)).toBe(true);
    expect(isRevisionStatus("archived")).toBe(false);
  });
});
