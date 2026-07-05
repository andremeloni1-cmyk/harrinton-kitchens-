"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { fmtMoney } from "@/lib/format";
import { api } from "@/lib/job";
import { UNIT_LABELS, type PriceItemDTO } from "@/lib/price-list";

/**
 * Picker over the price list. Prices are resolved for the given company
 * (override → default). Tapping an item hands it to the caller.
 */
export function PriceItemPicker({
  companyId,
  onPick,
  onClose,
}: {
  companyId?: string | null;
  onPick: (item: PriceItemDTO) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<PriceItemDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ items: PriceItemDTO[] }>(
      `/api/price-items${companyId ? `?companyId=${companyId}` : ""}`
    )
      .then((r) => setItems(r.items.filter((i) => i.active)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  const groups = useMemo(() => {
    const map = new Map<string, PriceItemDTO[]>();
    for (const item of items) {
      const key = item.category || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <Modal open onClose={onClose} title="Add from price list">
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500 dark:text-slate-400">
          {companyId
            ? "No components priced for this company yet — set their rates under Money → Price list."
            : "Your price list is empty — add components under Money → Price list."}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(([category, group]) => (
            <div key={category}>
              {groups.length > 1 && (
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                  {category}
                </p>
              )}
              <div className="space-y-1.5">
                {group.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onPick(item)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ring-1 ring-stone-100 transition hover:bg-stone-50 dark:ring-night-line dark:hover:bg-night-800"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-stone-800 dark:text-slate-100">
                        {item.name}
                      </span>
                      <span className="text-xs text-stone-400 dark:text-slate-500">
                        per {UNIT_LABELS[item.unit] || item.unit}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-stone-700 dark:text-slate-200">
                      {fmtMoney(item.resolvedPrice ?? item.price)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
