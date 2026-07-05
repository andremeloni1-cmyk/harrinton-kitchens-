// Client-side shapes + display helpers for the hardware tracker.

export interface HardwareEventDTO {
  id: string;
  type: string; // delivered | flagged | ordered | adjusted
  qty?: number | null;
  note?: string | null;
  createdAt: string;
}

export interface HardwareItemDTO {
  id: string;
  code: string;
  name: string;
  category?: string | null;
  supplier?: string | null;
  unit: string;
  packSize?: string | null;
  qtyOnHand: number;
  reorderLevel: number;
  location?: string | null;
  notes?: string | null;
  orderStatus: string; // ok | needs_order | on_order
  orderQty?: number | null;
  orderNote?: string | null;
  flaggedAt?: string | null;
  orderedAt?: string | null;
  events?: HardwareEventDTO[];
  createdAt?: string;
}

export const HW_STATUS_LABELS: Record<string, string> = {
  ok: "In stock",
  needs_order: "Order",
  on_order: "On order",
};

export const HW_STATUS_STYLES: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25",
  needs_order: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/25",
  on_order: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/25",
};

/** Low but not yet flagged — the list nudges a reorder. */
export function isLow(i: HardwareItemDTO): boolean {
  return i.orderStatus === "ok" && i.qtyOnHand <= i.reorderLevel;
}

export const HW_EVENT_LABELS: Record<string, string> = {
  delivered: "Delivery booked in",
  flagged: "Flagged for reorder",
  ordered: "Order placed",
  adjusted: "Adjusted",
};
