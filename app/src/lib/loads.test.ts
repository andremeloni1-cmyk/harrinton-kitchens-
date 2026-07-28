import { describe, it, expect } from "vitest";
import {
  LOAD_STATUSES,
  isLoadStatus,
  canTransition,
  itemLabel,
  reconcile,
  isClean,
  loadProgress,
  reconciliationSummary,
  deliveryProgress,
  nextLoadReference,
  type LoadItemLike,
} from "./loads";

function item(over: Partial<LoadItemLike> = {}): LoadItemLike {
  return {
    id: "i1",
    kind: "cabinet",
    description: "Base cabinet 1",
    qty: 1,
    expected: true,
    loadedAt: null,
    deliveredAt: null,
    ...over,
  };
}

describe("statuses", () => {
  it("validates an untrusted status", () => {
    for (const s of LOAD_STATUSES) expect(isLoadStatus(s)).toBe(true);
    expect(isLoadStatus("in_transit")).toBe(false);
    expect(isLoadStatus(7)).toBe(false);
  });

  it("lets a load depart, arrive, or be pulled back", () => {
    expect(canTransition("open", "departed")).toBe(true);
    expect(canTransition("departed", "delivered")).toBe(true);
    expect(canTransition("departed", "open")).toBe(true);
    expect(canTransition("cancelled", "open")).toBe(true);
  });

  it("treats delivered as final, so proofs can't be orphaned", () => {
    expect(canTransition("delivered", "open")).toBe(false);
    expect(canTransition("delivered", "departed")).toBe(false);
    expect(canTransition("delivered", "cancelled")).toBe(false);
  });

  it("won't skip straight from loading to delivered", () => {
    expect(canTransition("open", "delivered")).toBe(false);
  });
});

describe("itemLabel", () => {
  it("only shows a count when there's more than one", () => {
    expect(itemLabel(item({ description: "Sink" }))).toBe("Sink");
    expect(itemLabel(item({ description: "Kickboard", qty: 4 }))).toBe("Kickboard × 4");
  });
});

describe("reconcile", () => {
  const items = [
    item({ id: "a", expected: true, loadedAt: "2026-07-28T01:00:00Z" }),
    item({ id: "b", expected: true, loadedAt: null }),
    item({ id: "c", expected: false, loadedAt: "2026-07-28T01:05:00Z" }),
  ];

  it("names the difference in both directions", () => {
    const r = reconcile(items);
    expect(r.loaded.map((i) => i.id)).toEqual(["a"]);
    expect(r.missing.map((i) => i.id)).toEqual(["b"]);
    expect(r.unexpected.map((i) => i.id)).toEqual(["c"]);
  });

  it("puts every item in exactly one bucket, so nothing goes unreported", () => {
    const r = reconcile(items);
    expect(r.loaded.length + r.missing.length + r.unexpected.length).toBe(items.length);
  });

  it("drops the impossible row rather than inventing a discrepancy", () => {
    // Not expected and never loaded — a row only becomes unexpected by being
    // scanned on, so this is noise.
    const r = reconcile([item({ expected: false, loadedAt: null })]);
    expect(r.loaded).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.unexpected).toEqual([]);
  });

  it("is empty all round for an empty load", () => {
    expect(reconcile([])).toEqual({ loaded: [], missing: [], unexpected: [] });
  });
});

describe("isClean", () => {
  it("is true only when the truck matches the list exactly", () => {
    expect(isClean([item({ expected: true, loadedAt: "t" })])).toBe(true);
    expect(isClean([item({ expected: true, loadedAt: null })])).toBe(false);
    expect(isClean([item({ expected: false, loadedAt: "t" })])).toBe(false);
  });

  it("calls an empty load clean", () => {
    expect(isClean([])).toBe(true);
  });
});

describe("loadProgress", () => {
  it("counts against the list, so an unexpected item can't push it over", () => {
    const items = [
      item({ id: "a", expected: true, loadedAt: "t" }),
      item({ id: "b", expected: true, loadedAt: null }),
      item({ id: "c", expected: false, loadedAt: "t" }),
    ];
    expect(loadProgress(items)).toEqual({ done: 1, total: 2 });
  });
});

describe("reconciliationSummary", () => {
  it("says nothing when there is nothing to say", () => {
    expect(reconciliationSummary([item({ loadedAt: "t" })])).toBeNull();
  });

  it("reports each direction it finds", () => {
    expect(reconciliationSummary([item({ expected: true, loadedAt: null })])).toBe("1 missing");
    expect(reconciliationSummary([item({ expected: false, loadedAt: "t" })])).toBe("1 unexpected");
    expect(
      reconciliationSummary([
        item({ id: "a", expected: true, loadedAt: null }),
        item({ id: "b", expected: false, loadedAt: "t" }),
      ])
    ).toBe("1 missing · 1 unexpected");
  });
});

describe("deliveryProgress", () => {
  it("measures against what actually went on the truck, not the list", () => {
    const items = [
      item({ id: "a", loadedAt: "t", deliveredAt: "t2" }),
      item({ id: "b", loadedAt: "t", deliveredAt: null }),
      item({ id: "c", loadedAt: null }), // never left the workshop
    ];
    expect(deliveryProgress(items)).toEqual({ done: 1, total: 2 });
  });
});

describe("nextLoadReference", () => {
  it("starts at LOAD-1001", () => {
    expect(nextLoadReference([])).toBe("LOAD-1001");
  });

  it("continues from the highest issued, whatever order it's given", () => {
    expect(nextLoadReference(["LOAD-1001", "LOAD-1004", "LOAD-1002"])).toBe("LOAD-1005");
    expect(nextLoadReference(["LOAD-1004", "LOAD-1001"])).toBe("LOAD-1005");
  });

  it("ignores references that aren't ours rather than restarting the count", () => {
    expect(nextLoadReference(["JOB-9999", "LOAD-x", "LOAD-1002", " LOAD-1003 "])).toBe("LOAD-1004");
  });
});
