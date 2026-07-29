import { describe, it, expect } from "vitest";
import {
  buildOrderList,
  orderSummary,
  groupBySupplier,
  packsFor,
  diffRequirements,
  diffSummary,
  conflictsWithPicked,
  type Requirement,
  type StockLine,
} from "./hardware-order";

function stockLine(over: Partial<StockLine> = {}): StockLine {
  return {
    id: "hinge",
    code: "HW-1007",
    name: "Blum Clip Top 110°",
    category: "Hinges",
    supplier: "Galvin",
    unit: "box",
    packSize: "100 pcs",
    qtyOnHand: 2,
    piecesPerPack: 100,
    reorderLevel: 1,
    orderStatus: "ok",
    ...over,
  };
}

function stock(...lines: StockLine[]): Map<string, StockLine> {
  return new Map(lines.map((l) => [l.id, l]));
}

function req(over: Partial<Requirement> = {}): Requirement {
  return { hardwareItemId: "hinge", requiredPieces: 24, pickedPieces: 0, ...over };
}

describe("packsFor", () => {
  it("rounds up, because a part pack isn't an order you can place", () => {
    expect(packsFor(1, 100)).toBe(1);
    expect(packsFor(100, 100)).toBe(1);
    expect(packsFor(101, 100)).toBe(2);
  });

  it("is zero when nothing is needed", () => {
    expect(packsFor(0, 100)).toBe(0);
    expect(packsFor(-5, 100)).toBe(0);
  });

  it("treats a missing pack size as single pieces rather than dividing by zero", () => {
    expect(packsFor(7, 0)).toBe(7);
  });
});

describe("buildOrderList", () => {
  it("reads pack counts as pieces before comparing", () => {
    // 2 boxes of 100 is 200 pieces, which covers 24 — the whole point of
    // piecesPerPack existing.
    const [line] = buildOrderList({ requirements: [req()], stock: stock(stockLine()) });
    expect(line).toMatchObject({ onHandPieces: 200, shortfallPieces: 0, orderPacks: 0, status: "in_stock" });
  });

  it("orders whole packs for a shortfall", () => {
    const [line] = buildOrderList({
      requirements: [req({ requiredPieces: 250 })],
      stock: stock(stockLine({ qtyOnHand: 2 })),
    });
    expect(line).toMatchObject({ shortfallPieces: 50, orderPacks: 1, orderPieces: 100, status: "short" });
  });

  it("counts only what another job still has outstanding as unavailable", () => {
    const [line] = buildOrderList({
      requirements: [req({ requiredPieces: 120 })],
      stock: stock(stockLine({ qtyOnHand: 2 })),
      reservedElsewhere: new Map([["hinge", 150]]),
    });
    // 200 on hand, 150 held by other jobs, 50 free, so 70 short.
    expect(line).toMatchObject({ freePieces: 50, shortfallPieces: 70, orderPacks: 1, status: "short" });
  });

  it("does not ask for stock this job has already picked", () => {
    const [line] = buildOrderList({
      requirements: [req({ requiredPieces: 250, pickedPieces: 200 })],
      stock: stock(stockLine({ qtyOnHand: 0 })),
    });
    // 50 still to come off a bare shelf — the 200 already taken is out of the sum.
    expect(line).toMatchObject({ outstandingPieces: 50, shortfallPieces: 50, orderPacks: 1 });
  });

  it("clamps a picked figure that exceeds what was required", () => {
    const [line] = buildOrderList({
      requirements: [req({ requiredPieces: 10, pickedPieces: 99 })],
      stock: stock(stockLine()),
    });
    // A negative reservation would quietly free stock for other jobs.
    expect(line).toMatchObject({ pickedPieces: 10, outstandingPieces: 0, shortfallPieces: 0 });
  });

  it("copes with stock already over-committed to other jobs", () => {
    const [line] = buildOrderList({
      requirements: [req({ requiredPieces: 50 })],
      stock: stock(stockLine({ qtyOnHand: 1 })),
      reservedElsewhere: new Map([["hinge", 300]]),
    });
    expect(line.freePieces).toBe(-200);
    expect(line.shortfallPieces).toBe(50); // never more than this job actually needs
  });

  it("says on order rather than short when the office has already acted", () => {
    const [line] = buildOrderList({
      requirements: [req({ requiredPieces: 500 })],
      stock: stock(stockLine({ orderStatus: "on_order" })),
    });
    expect(line.status).toBe("on_order");
    expect(line.shortfallPieces).toBe(300); // still shown, just not re-flagged
  });

  it("treats a line counted in eaches as pieces", () => {
    const [line] = buildOrderList({
      requirements: [req({ hardwareItemId: "leg", requiredPieces: 16 })],
      stock: stock(stockLine({ id: "leg", name: "Leg", unit: "each", piecesPerPack: 1, qtyOnHand: 10 })),
    });
    expect(line).toMatchObject({ onHandPieces: 10, shortfallPieces: 6, orderPacks: 6, orderPieces: 6 });
  });

  it("skips a requirement whose stock line no longer exists", () => {
    const lines = buildOrderList({ requirements: [req({ hardwareItemId: "deleted" })], stock: stock(stockLine()) });
    expect(lines).toEqual([]);
  });

  it("puts what has to be bought at the top", () => {
    const lines = buildOrderList({
      requirements: [
        req({ hardwareItemId: "ok", requiredPieces: 1 }),
        req({ hardwareItemId: "short", requiredPieces: 999 }),
        req({ hardwareItemId: "ordered", requiredPieces: 999 }),
      ],
      stock: stock(
        stockLine({ id: "ok", name: "Fine" }),
        stockLine({ id: "short", name: "Short" }),
        stockLine({ id: "ordered", name: "Ordered", orderStatus: "on_order" })
      ),
    });
    expect(lines.map((l) => l.status)).toEqual(["short", "on_order", "in_stock"]);
  });
});

describe("orderSummary and groupBySupplier", () => {
  const lines = buildOrderList({
    requirements: [
      req({ hardwareItemId: "a", requiredPieces: 999 }),
      req({ hardwareItemId: "b", requiredPieces: 999 }),
      req({ hardwareItemId: "c", requiredPieces: 1 }),
    ],
    stock: stock(
      stockLine({ id: "a", name: "A", supplier: "Galvin" }),
      stockLine({ id: "b", name: "B", supplier: "Hafele" }),
      stockLine({ id: "c", name: "C", supplier: "Galvin" })
    ),
  });

  it("counts the list and how many orders it implies", () => {
    expect(orderSummary(lines)).toEqual({ lines: 3, inStock: 1, short: 2, onOrder: 0, suppliers: 2 });
  });

  it("groups only the short lines, since in-stock lines aren't ordered", () => {
    const groups = groupBySupplier(lines);
    expect(groups.map((g) => g.supplier).sort()).toEqual(["Galvin", "Hafele"]);
    expect(groups.flatMap((g) => g.lines.map((l) => l.name)).sort()).toEqual(["A", "B"]);
  });

  it("names a supplier-less line rather than dropping it from the order", () => {
    const orphan = buildOrderList({
      requirements: [req({ hardwareItemId: "x", requiredPieces: 999 })],
      stock: stock(stockLine({ id: "x", supplier: null })),
    });
    expect(groupBySupplier(orphan)[0].supplier).toBe("No supplier set");
  });
});

describe("diffRequirements", () => {
  it("reports what a revised report would change", () => {
    const before = [req({ hardwareItemId: "hinge", requiredPieces: 24 }), req({ hardwareItemId: "runner", requiredPieces: 6 })];
    const after = [req({ hardwareItemId: "hinge", requiredPieces: 28 }), req({ hardwareItemId: "handle", requiredPieces: 5 })];

    expect(diffRequirements(before, after)).toEqual([
      { hardwareItemId: "runner", beforePieces: 6, afterPieces: 0, deltaPieces: -6, kind: "removed", picked: false },
      { hardwareItemId: "handle", beforePieces: 0, afterPieces: 5, deltaPieces: 5, kind: "added", picked: false },
      { hardwareItemId: "hinge", beforePieces: 24, afterPieces: 28, deltaPieces: 4, kind: "increased", picked: false },
    ]);
  });

  it("says nothing changed when nothing changed", () => {
    const same = [req({ requiredPieces: 24 })];
    expect(diffRequirements(same, [req({ requiredPieces: 24 })])).toEqual([]);
  });

  it("puts a line already picked against first — the one needing a human", () => {
    const before = [
      req({ hardwareItemId: "hinge", requiredPieces: 24, pickedPieces: 20 }),
      req({ hardwareItemId: "runner", requiredPieces: 100 }),
    ];
    const after = [req({ hardwareItemId: "hinge", requiredPieces: 4 }), req({ hardwareItemId: "runner", requiredPieces: 1 })];
    const changes = diffRequirements(before, after);
    expect(changes[0]).toMatchObject({ hardwareItemId: "hinge", picked: true });
  });

  it("spots a revision that would drop below what's already off the shelf", () => {
    const change = diffRequirements([req({ requiredPieces: 24, pickedPieces: 20 })], [req({ requiredPieces: 4 })])[0];
    expect(conflictsWithPicked(change, 20)).toBe(true);
    expect(conflictsWithPicked(change, 2)).toBe(false);
  });

  it("treats a first import as everything added", () => {
    const changes = diffRequirements([], [req({ requiredPieces: 24 })]);
    expect(changes).toEqual([
      { hardwareItemId: "hinge", beforePieces: 0, afterPieces: 24, deltaPieces: 24, kind: "added", picked: false },
    ]);
  });
});

describe("diffSummary", () => {
  it("totals the movement in both directions", () => {
    const changes = diffRequirements(
      [req({ hardwareItemId: "a", requiredPieces: 10 }), req({ hardwareItemId: "b", requiredPieces: 8 })],
      [req({ hardwareItemId: "a", requiredPieces: 14 })]
    );
    expect(diffSummary(changes)).toBe("2 lines change · +4 pieces, −8 pieces");
  });

  it("says so when a re-import changes nothing", () => {
    expect(diffSummary([])).toBe("No change to what this job needs");
  });
});
