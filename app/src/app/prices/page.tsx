"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { MoneyTabs } from "@/components/MoneyTabs";
import { fmtMoney } from "@/lib/format";
import { api } from "@/lib/job";
import { PRICE_UNITS, UNIT_LABELS, UNIT_NAMES, type PriceItemDTO } from "@/lib/price-list";

type Company = { id: string; name: string; displayName?: string | null; enabled: boolean };

export default function PricesPage() {
  const [items, setItems] = useState<PriceItemDTO[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PriceItemDTO | "new" | null>(null);

  async function load() {
    const [{ items }, sources] = await Promise.all([
      api<{ items: PriceItemDTO[] }>("/api/price-items"),
      api<{ sources: Company[] }>("/api/lead-sources").catch(() => ({ sources: [] as Company[] })),
    ]);
    setItems(items);
    setCompanies((sources.sources || []).filter((c) => c.enabled));
  }
  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

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
    <div className="px-4 pt-6">
      <header className="mb-1">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Money</h1>
        <p className="text-sm text-stone-500 dark:text-slate-400">
          Your rate card — what you charge per component.
        </p>
      </header>

      <div className="mt-4">
        <MoneyTabs />
      </div>

      <button onClick={() => setEditing("new")} className="btn-accent mb-4 w-full">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Add component
      </button>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl">🏷️</span>}
          title="No components yet"
          subtitle="Add the things you charge for (cabinets, benchtops, hourly labour…) and pick them straight into invoices and estimates."
          action={
            <button onClick={() => setEditing("new")} className="btn-primary">
              Add component
            </button>
          }
        />
      ) : (
        <div className="space-y-4 pb-4">
          {groups.map(([category, group]) => (
            <div key={category}>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                {category}
              </p>
              <div className="stagger space-y-2">
                {group.map((item) => (
                  <button key={item.id} onClick={() => setEditing(item)} className="block w-full text-left">
                    <div className={`card tap flex items-center gap-3 p-3.5 ${item.active ? "" : "opacity-50"}`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-stone-900 dark:text-slate-100">{item.name}</p>
                        <p className="text-xs text-stone-400 dark:text-slate-500">
                          per {UNIT_LABELS[item.unit] || item.unit}
                          {Object.keys(item.companyPrices).length > 0 && (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
                              · company rates
                            </span>
                          )}
                          {!item.active && " · hidden"}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold text-stone-800 dark:text-slate-100">
                        {fmtMoney(item.price)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ItemModal
          item={editing === "new" ? null : editing}
          companies={companies}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ItemModal({
  item,
  companies,
  onClose,
  onSaved,
}: {
  item: PriceItemDTO | null;
  companies: Company[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name || "");
  const [unit, setUnit] = useState(item?.unit || "each");
  const [category, setCategory] = useState(item?.category || "");
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : "");
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(item?.companyPrices || {})) out[k] = String(v);
    return out;
  });
  const [active, setActive] = useState(item?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setError("Give the component a name.");
    setBusy(true);
    setError(null);
    const companyPrices: Record<string, number> = {};
    for (const [k, v] of Object.entries(overrides)) {
      const n = Number(v);
      if (v.trim() !== "" && Number.isFinite(n)) companyPrices[k] = n;
    }
    const payload = { name: name.trim(), unit, category: category.trim(), price: Number(price) || 0, companyPrices, active };
    try {
      if (item) await api(`/api/price-items/${item.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("/api/price-items", { method: "POST", body: JSON.stringify(payload) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    try {
      await api(`/api/price-items/${item.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={item ? "Edit component" : "New component"}>
      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Base cabinet install" autoFocus={!item} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Priced per</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {PRICE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_NAMES[u] || u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Kitchen" />
          </div>
        </div>

        <div>
          <label className="label">Standard price (A$, ex GST)</label>
          <input className="input" type="number" inputMode="decimal" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>

        {companies.length > 0 && (
          <div>
            <p className="label">Per-company rates (blank = standard)</p>
            <div className="space-y-2">
              {companies.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-stone-600 dark:text-slate-300">
                    {c.displayName || c.name}
                  </span>
                  <input
                    className="input w-28"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    placeholder={price || "0"}
                    value={overrides[c.id] ?? ""}
                    onChange={(e) => setOverrides((p) => ({ ...p, [c.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {item && (
          <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-slate-300">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Show in pickers
          </label>
        )}

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}

        <div className="space-y-2 pt-1">
          <button onClick={save} disabled={busy} className="btn-primary w-full">
            {busy ? "Saving…" : item ? "Save changes" : "Add component"}
          </button>
          {item && (
            <button onClick={remove} disabled={busy} className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
              {confirmDelete ? "Tap again to confirm delete" : "Delete component"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
