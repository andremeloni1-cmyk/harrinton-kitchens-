// Loading a truck, and proving what reached site.
//
// The shape is lifted from the A-Z Kitchens tracker, minus poly — Harrington
// finishes in-house, so there is no consignment out and back. What carries over
// is the part that matters: the loading list is a **stored snapshot of intent**,
// not a live query. The office may knowingly send a job out short, and the whole
// point of reconciling is to compare what was meant to go against what actually
// went. A list recomputed at read time would quietly move the goalposts every
// time something changed state.
//
// The difference is reported in both directions. Missing items are the obvious
// case; unexpected ones matter just as much, because a panel loaded against the
// wrong job arrives at the wrong address.

export const LOAD_STATUSES = ["open", "departed", "delivered", "cancelled"] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];

export function isLoadStatus(v: unknown): v is LoadStatus {
  return typeof v === "string" && (LOAD_STATUSES as readonly string[]).includes(v);
}

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  open: "Loading",
  departed: "On the road",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Where a load may go next. Cancelling is allowed from anywhere unfinished; a
 * delivered load is final, because reopening it would orphan its proofs.
 */
export const LOAD_TRANSITIONS: Record<LoadStatus, LoadStatus[]> = {
  open: ["departed", "cancelled"],
  departed: ["delivered", "open", "cancelled"],
  delivered: [],
  cancelled: ["open"],
};

export function canTransition(from: LoadStatus, to: LoadStatus): boolean {
  return LOAD_TRANSITIONS[from].includes(to);
}

/** What a line on the truck actually is. Exactly one of these per item. */
export type LoadItemKind = "cabinet" | "part" | "extra";

export type LoadItemLike = {
  id: string;
  kind: LoadItemKind;
  description: string;
  qty: number;
  /** On the office's list. False = turned up on the truck unannounced. */
  expected: boolean;
  loadedAt: string | null;
  /** Set once a proof photo exists against this item. */
  deliveredAt?: string | null;
};

export function itemLabel(item: LoadItemLike): string {
  return item.qty > 1 ? `${item.description} × ${item.qty}` : item.description;
}

export type Reconciliation<T extends LoadItemLike> = {
  /** Expected and loaded — the boring, correct case. */
  loaded: T[];
  /** Expected but never ticked on. The truck is going out short. */
  missing: T[];
  /** Loaded but never on the list. Someone else's panel, probably. */
  unexpected: T[];
};

/**
 * Compare the loading list against what actually went on.
 *
 * Deliberately total: every item lands in exactly one bucket, so a count of the
 * three always equals the item count and nothing can quietly go unreported.
 */
export function reconcile<T extends LoadItemLike>(items: T[]): Reconciliation<T> {
  const loaded: T[] = [];
  const missing: T[] = [];
  const unexpected: T[] = [];

  for (const item of items) {
    const wasLoaded = item.loadedAt != null;
    if (item.expected && wasLoaded) loaded.push(item);
    else if (item.expected) missing.push(item);
    else if (wasLoaded) unexpected.push(item);
    // An unexpected item that was never loaded is not a thing: a row only
    // becomes unexpected by being scanned on. If one somehow exists it is
    // noise, not a discrepancy, so it is dropped rather than reported.
  }

  return { loaded, missing, unexpected };
}

/** True when the load matches its list exactly, in both directions. */
export function isClean<T extends LoadItemLike>(items: T[]): boolean {
  const { missing, unexpected } = reconcile(items);
  return missing.length === 0 && unexpected.length === 0;
}

/** Ticked-on progress against the list, for a progress bar. */
export function loadProgress(items: LoadItemLike[]): { done: number; total: number } {
  const expected = items.filter((i) => i.expected);
  return { done: expected.filter((i) => i.loadedAt != null).length, total: expected.length };
}

/** A one-line summary of the discrepancies, or null when there are none. */
export function reconciliationSummary(items: LoadItemLike[]): string | null {
  const { missing, unexpected } = reconcile(items);
  if (missing.length === 0 && unexpected.length === 0) return null;
  const parts: string[] = [];
  if (missing.length) parts.push(`${missing.length} missing`);
  if (unexpected.length) parts.push(`${unexpected.length} unexpected`);
  return parts.join(" · ");
}

/** How much of the load has a delivery proof against it. */
export function deliveryProgress(items: LoadItemLike[]): { done: number; total: number } {
  const onTruck = items.filter((i) => i.loadedAt != null);
  return { done: onTruck.filter((i) => i.deliveredAt != null).length, total: onTruck.length };
}

/**
 * The next load reference, continuing from the highest already issued.
 * Matches the app's other human references (JOB-1042, INV-1001).
 */
export function nextLoadReference(existing: string[]): string {
  let highest = 1000;
  for (const ref of existing) {
    const m = /^LOAD-(\d+)$/.exec(ref.trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return `LOAD-${highest + 1}`;
}
