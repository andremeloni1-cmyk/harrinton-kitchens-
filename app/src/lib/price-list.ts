import type { PriceItem } from "@prisma/client";

// Units a component can be priced in.
export const PRICE_UNITS = ["each", "hour", "metre", "sqm"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const UNIT_LABELS: Record<string, string> = {
  each: "ea",
  hour: "hr",
  metre: "m",
  sqm: "m²",
};

export const UNIT_NAMES: Record<string, string> = {
  each: "Unit (each)",
  hour: "Hour",
  metre: "Metre",
  sqm: "Square metre",
};

export type PriceItemDTO = {
  id: string;
  name: string;
  unit: string;
  price: number;
  category?: string | null;
  companyPrices: Record<string, number>;
  active: boolean;
  /** price resolved for a requested company (override → default) */
  resolvedPrice?: number;
};

export function parseCompanyPrices(raw: string): Record<string, number> {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(obj)) {
        const n = Number(v);
        if (Number.isFinite(n)) out[k] = n;
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * Whether an item belongs on a given company's rate card. Items with no
 * per-company rates are generic (available everywhere, incl. private jobs);
 * items with company rates only show for those companies. No company → all.
 */
export function relevantToCompany(
  overrides: Record<string, number>,
  companyId?: string | null
): boolean {
  if (!companyId) return true;
  const keys = Object.keys(overrides);
  return keys.length === 0 || companyId in overrides;
}

/** The rate this item charges for a given company (override → default). */
export function resolvePrice(item: PriceItem, companyId?: string | null): number {
  if (companyId) {
    const overrides = parseCompanyPrices(item.companyPrices);
    if (companyId in overrides) return overrides[companyId];
  }
  return item.price;
}

export function toDTO(item: PriceItem, companyId?: string | null): PriceItemDTO {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    price: item.price,
    category: item.category,
    companyPrices: parseCompanyPrices(item.companyPrices),
    active: item.active,
    resolvedPrice: resolvePrice(item, companyId),
  };
}
