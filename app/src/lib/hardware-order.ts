// What a job needs, what is on the shelf, and what has to be ordered.
//
// Three quantities get confused constantly in a hardware store, and keeping
// them apart is most of this file's job:
//
//   pieces    what a cut list needs — "24 hinges"
//   packs     how stock is counted and how suppliers sell — "a box of 100"
//   free      on-hand minus what other live jobs have already spoken for
//
// A count of stock is not a promise of stock. Two kitchens quoted the same week
// both see 3 boxes of hinges on the shelf, both say "plenty", and the second one
// stops on the bench. So the arithmetic here is always against *free* stock, not
// on-hand — the difference between them being other jobs' reservations.
//
// A reservation is not its own record: it is a job's outstanding requirement,
// required minus picked. One row per stock line per job, and nothing to drift.
//
// Pure. The caller loads the rows; this decides what they mean.

/** A job's outstanding need for one stock line, in pieces. */
export type Requirement = {
  hardwareItemId: string;
  /** Pieces this job needs in total. */
  requiredPieces: number;
  /** Pieces already taken off the shelf for it. */
  pickedPieces: number;
};

/** The stock line itself, as the tracker holds it. */
export type StockLine = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  supplier: string | null;
  unit: string;
  packSize: string | null;
  /** Packs (or eaches) on the shelf — the unit the factory counts in. */
  qtyOnHand: number;
  /** Pieces in one pack. 1 means the line is counted in single pieces. */
  piecesPerPack: number;
  reorderLevel: number;
  /** ok | needs_order | on_order, from the existing reorder loop. */
  orderStatus: string;
};

export type OrderStatus = "in_stock" | "short" | "on_order";

export type OrderLine = {
  hardwareItemId: string;
  code: string;
  name: string;
  supplier: string | null;
  unit: string;
  packSize: string | null;
  piecesPerPack: number;

  /** This job's need and what it has already taken. */
  requiredPieces: number;
  pickedPieces: number;
  /** Still to come off the shelf for this job — its live reservation. */
  outstandingPieces: number;

  onHandPieces: number;
  /** Outstanding pieces held by every *other* live job. */
  reservedElsewherePieces: number;
  /** On-hand less what other jobs hold. Can go negative when over-committed. */
  freePieces: number;

  /** Pieces this job is short after the free stock is used. */
  shortfallPieces: number;
  /** Whole packs to buy to cover the shortfall — how suppliers actually sell. */
  orderPacks: number;
  /** What those packs actually deliver; the excess is normal and worth showing. */
  orderPieces: number;

  status: OrderStatus;
};

/** Round up to whole packs. A part-pack order is not a thing you can place. */
export function packsFor(pieces: number, piecesPerPack: number): number {
  if (pieces <= 0) return 0;
  const per = piecesPerPack > 0 ? piecesPerPack : 1;
  return Math.ceil(pieces / per);
}

export type OrderInputs = {
  /** This job's requirements. */
  requirements: Requirement[];
  /** Every stock line referenced, by id. */
  stock: Map<string, StockLine>;
  /**
   * Outstanding pieces held by other live jobs, by stock line id. Supplied by
   * the caller rather than computed, because "which jobs are live" is a
   * pipeline question and this file is arithmetic.
   */
  reservedElsewhere?: Map<string, number>;
};

/**
 * Turn a job's requirements into an order list.
 *
 * A requirement naming a stock line that no longer exists is skipped rather
 * than guessed at — it can only come from a deleted item, and inventing a line
 * for it would put a nameless row on a purchase order.
 */
export function buildOrderList({ requirements, stock, reservedElsewhere }: OrderInputs): OrderLine[] {
  const lines: OrderLine[] = [];

  for (const req of requirements) {
    const item = stock.get(req.hardwareItemId);
    if (!item) continue;

    const piecesPerPack = item.piecesPerPack > 0 ? item.piecesPerPack : 1;
    const requiredPieces = Math.max(0, req.requiredPieces);
    // Picked can't exceed required: a clamp here keeps a mis-entered pick from
    // turning into a negative reservation that quietly frees other jobs' stock.
    const pickedPieces = Math.min(Math.max(0, req.pickedPieces), requiredPieces);
    const outstandingPieces = requiredPieces - pickedPieces;

    const onHandPieces = item.qtyOnHand * piecesPerPack;
    const reserved = Math.max(0, reservedElsewhere?.get(req.hardwareItemId) ?? 0);
    const freePieces = onHandPieces - reserved;

    // Only the outstanding part needs covering — what has already been picked
    // is off the shelf and out of the sum.
    const shortfallPieces = Math.max(0, outstandingPieces - Math.max(0, freePieces));
    const orderPacks = packsFor(shortfallPieces, piecesPerPack);

    lines.push({
      hardwareItemId: item.id,
      code: item.code,
      name: item.name,
      supplier: item.supplier,
      unit: item.unit,
      packSize: item.packSize,
      piecesPerPack,
      requiredPieces,
      pickedPieces,
      outstandingPieces,
      onHandPieces,
      reservedElsewherePieces: reserved,
      freePieces,
      shortfallPieces,
      orderPacks,
      orderPieces: orderPacks * piecesPerPack,
      // Already flagged as on order beats "short": the office has acted, and
      // showing it as short again is how a line gets ordered twice.
      status: shortfallPieces === 0 ? "in_stock" : item.orderStatus === "on_order" ? "on_order" : "short",
    });
  }

  // Short first — the list exists to answer "what do I have to buy".
  const rank: Record<OrderStatus, number> = { short: 0, on_order: 1, in_stock: 2 };
  return lines.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
}

export type OrderSummary = {
  lines: number;
  inStock: number;
  short: number;
  onOrder: number;
  /** Distinct suppliers among the short lines — how many orders to place. */
  suppliers: number;
};

export function orderSummary(lines: OrderLine[]): OrderSummary {
  const short = lines.filter((l) => l.status === "short");
  const suppliers = new Set(short.map((l) => (l.supplier || "").trim().toLowerCase()).filter(Boolean));
  return {
    lines: lines.length,
    inStock: lines.filter((l) => l.status === "in_stock").length,
    short: short.length,
    onOrder: lines.filter((l) => l.status === "on_order").length,
    suppliers: suppliers.size,
  };
}

/** Short lines grouped by supplier — one group is one order to place. */
export function groupBySupplier(lines: OrderLine[]): { supplier: string; lines: OrderLine[] }[] {
  const groups = new Map<string, OrderLine[]>();
  for (const line of lines.filter((l) => l.status === "short")) {
    const supplier = (line.supplier || "").trim() || "No supplier set";
    groups.set(supplier, [...(groups.get(supplier) ?? []), line]);
  }
  return [...groups.entries()]
    .map(([supplier, ls]) => ({ supplier, lines: ls }))
    .sort((a, b) => b.lines.length - a.lines.length || a.supplier.localeCompare(b.supplier));
}

// ---------------------------------------------------------------------------
// Re-importing a revised report
// ---------------------------------------------------------------------------

export type ChangeKind = "added" | "removed" | "increased" | "decreased";

export type RequirementChange = {
  hardwareItemId: string;
  beforePieces: number;
  afterPieces: number;
  deltaPieces: number;
  kind: ChangeKind;
  /** True when the job has already picked stock against this line. */
  picked: boolean;
};

/**
 * What a re-imported report would change.
 *
 * Drawings get revised, the report is exported again, and the new requirement
 * replaces the old one. Replacing silently is the dangerous version: a revision
 * that accidentally drops three cabinets looks exactly like a correct one until
 * the order goes in short. So the difference is computed and shown first.
 *
 * A line already picked against is flagged, because that is the case that can't
 * simply be replaced — the stock is off the shelf whatever the new drawing says.
 */
export function diffRequirements(before: Requirement[], after: Requirement[]): RequirementChange[] {
  const beforeById = new Map(before.map((r) => [r.hardwareItemId, r]));
  const afterById = new Map(after.map((r) => [r.hardwareItemId, r]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);

  const changes: RequirementChange[] = [];
  for (const id of ids) {
    const b = beforeById.get(id);
    const a = afterById.get(id);
    const beforePieces = b?.requiredPieces ?? 0;
    const afterPieces = a?.requiredPieces ?? 0;
    if (beforePieces === afterPieces) continue;

    changes.push({
      hardwareItemId: id,
      beforePieces,
      afterPieces,
      deltaPieces: afterPieces - beforePieces,
      kind:
        beforePieces === 0 ? "added" : afterPieces === 0 ? "removed" : afterPieces > beforePieces ? "increased" : "decreased",
      picked: (b?.pickedPieces ?? 0) > 0,
    });
  }

  // Largest movements first, and anything already picked against at the top of
  // its band — those are the ones a human has to actually think about.
  const rank: Record<ChangeKind, number> = { removed: 0, decreased: 1, added: 2, increased: 3 };
  return changes.sort(
    (a, b) =>
      Number(b.picked) - Number(a.picked) ||
      rank[a.kind] - rank[b.kind] ||
      Math.abs(b.deltaPieces) - Math.abs(a.deltaPieces) ||
      a.hardwareItemId.localeCompare(b.hardwareItemId)
  );
}

/** True when a re-import would take a requirement below what's already picked. */
export function conflictsWithPicked(change: RequirementChange, picked: number): boolean {
  return change.afterPieces < picked;
}

/** A one-line summary of a re-import, for the confirm button. */
export function diffSummary(changes: RequirementChange[]): string {
  if (changes.length === 0) return "No change to what this job needs";
  const up = changes.filter((c) => c.deltaPieces > 0).reduce((n, c) => n + c.deltaPieces, 0);
  const down = changes.filter((c) => c.deltaPieces < 0).reduce((n, c) => n - c.deltaPieces, 0);
  const parts: string[] = [];
  if (up) parts.push(`+${up} pieces`);
  if (down) parts.push(`−${down} pieces`);
  return `${changes.length} line${changes.length === 1 ? "" : "s"} change · ${parts.join(", ")}`;
}
