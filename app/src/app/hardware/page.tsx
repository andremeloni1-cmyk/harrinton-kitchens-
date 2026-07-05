"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { relativeTime } from "@/lib/format";
import { api } from "@/lib/job";
import {
  type HardwareItemDTO,
  HW_STATUS_LABELS,
  HW_STATUS_STYLES,
  HW_EVENT_LABELS,
  isLow,
} from "@/lib/hardware";

type FormValues = {
  name: string;
  category: string;
  supplier: string;
  unit: string;
  packSize: string;
  qtyOnHand: string;
  reorderLevel: string;
  location: string;
};
const EMPTY_FORM: FormValues = {
  name: "",
  category: "",
  supplier: "",
  unit: "box",
  packSize: "",
  qtyOnHand: "0",
  reorderLevel: "1",
  location: "",
};

export default function HardwarePage() {
  const [items, setItems] = useState<HardwareItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "order">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<HardwareItemDTO | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { items } = await api<{ items: HardwareItemDTO[] }>("/api/hardware");
      setItems(items);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  }

  const orderList = useMemo(() => items.filter((i) => i.orderStatus !== "ok"), [items]);
  const lowCount = useMemo(() => items.filter(isLow).length, [items]);

  const visible = useMemo(() => {
    let list = tab === "order" ? orderList : items;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q) ||
          (i.category || "").toLowerCase().includes(q) ||
          (i.supplier || "").toLowerCase().includes(q) ||
          (i.location || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, orderList, tab, query]);

  // Order list grouped by supplier for a tidy phone call / email.
  const orderBySupplier = useMemo(() => {
    const m = new Map<string, HardwareItemDTO[]>();
    for (const i of orderList) {
      const key = i.supplier || "No supplier set";
      m.set(key, [...(m.get(key) || []), i]);
    }
    return [...m.entries()];
  }, [orderList]);

  async function copyOrderList() {
    const lines: string[] = [];
    for (const [supplier, list] of orderBySupplier) {
      lines.push(`${supplier}:`);
      for (const i of list) {
        lines.push(`  - ${i.name} (${i.code}) × ${i.orderQty || 1} ${i.unit}${i.orderNote ? ` — ${i.orderNote}` : ""}`);
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      flash("Order list copied — paste it into an email or text.");
    } catch {
      flash("Couldn't copy on this device.");
    }
  }

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }
  function openEdit(i: HardwareItemDTO) {
    setEditingId(i.id);
    setForm({
      name: i.name,
      category: i.category || "",
      supplier: i.supplier || "",
      unit: i.unit,
      packSize: i.packSize || "",
      qtyOnHand: String(i.qtyOnHand),
      reorderLevel: String(i.reorderLevel),
      location: i.location || "",
    });
    setError(null);
    setSelected(null);
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError("Please enter a product name.");
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await api(`/api/hardware/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await api("/api/hardware", { method: "POST", body: JSON.stringify(form) });
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function act(item: HardwareItemDTO, action: string, qty?: number) {
    try {
      const res = await api<{ item: HardwareItemDTO; message: string }>(`/api/hardware/${item.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action, qty }),
      });
      flash(res.message);
      setSelected(null);
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Couldn't update the item");
    }
  }

  async function remove(item: HardwareItemDTO) {
    await api(`/api/hardware/${item.id}`, { method: "DELETE" }).catch(() => {});
    setSelected(null);
    await load();
  }

  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="px-4 pt-6">
      {toast && (
        <div className="toast-in fixed inset-x-4 top-4 z-[60] mx-auto max-w-lg rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Hardware</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">Factory stock — scan labels to book in or reorder</p>
        </div>
        <button onClick={openAdd} className="btn-primary shrink-0">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Add
        </button>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/hardware/scan" className="btn-secondary">
          📷 Scan a label
        </Link>
        <Link href="/hardware/labels" className="btn-secondary">
          🏷️ Print labels
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        <div className="card px-3 py-3">
          <div className="text-lg font-bold text-stone-900 dark:text-slate-100">{items.length}</div>
          <div className="text-xs text-stone-500 dark:text-slate-400">Stock lines</div>
        </div>
        <button onClick={() => setTab("order")} className={`card px-3 py-3 transition active:scale-[0.98] ${tab === "order" ? "ring-2 ring-brand-400" : ""}`}>
          <div className={`text-lg font-bold ${orderList.length > 0 ? "text-red-600 dark:text-red-400" : "text-stone-900 dark:text-slate-100"}`}>
            {orderList.length}
          </div>
          <div className="text-xs text-stone-500 dark:text-slate-400">To order</div>
        </button>
        <div className="card px-3 py-3">
          <div className={`text-lg font-bold ${lowCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-stone-900 dark:text-slate-100"}`}>{lowCount}</div>
          <div className="text-xs text-stone-500 dark:text-slate-400">Running low</div>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        {(
          [
            ["all", "All stock"],
            ["order", `Order list${orderList.length ? ` (${orderList.length})` : ""}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              tab === key
                ? "bg-brand-600 text-white"
                : "bg-white text-stone-600 ring-1 ring-stone-200 dark:bg-night-850 dark:text-slate-300 dark:ring-night-line"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "all" && (
        <div className="relative mb-3">
          <input
            className="input rounded-full pl-10"
            placeholder="Search name, code, supplier, shelf…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <svg className="absolute left-3 top-3 h-5 w-5 text-stone-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      ) : tab === "order" ? (
        orderList.length === 0 ? (
          <EmptyState icon={<span className="text-2xl">✅</span>} title="Nothing to order" subtitle="Scan a label and tap 'Box empty' to add hardware here." />
        ) : (
          <div className="space-y-4">
            <button onClick={copyOrderList} className="btn-secondary w-full">
              📋 Copy order list
            </button>
            {orderBySupplier.map(([supplier, list]) => (
              <div key={supplier}>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">{supplier}</p>
                <div className="card divide-y divide-stone-100 dark:divide-night-line">
                  {list.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 px-3.5 py-3">
                      <button onClick={() => setSelected(i)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold text-stone-900 dark:text-slate-100">{i.name}</p>
                        <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                          {i.code} · order {i.orderQty || 1} {i.unit}
                          {i.orderNote ? ` · ${i.orderNote}` : ""}
                          {i.flaggedAt ? ` · flagged ${relativeTime(i.flaggedAt)}` : ""}
                        </p>
                      </button>
                      {i.orderStatus === "needs_order" ? (
                        <button onClick={() => act(i, "ordered")} className="shrink-0 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">
                          Mark ordered
                        </button>
                      ) : (
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${HW_STATUS_STYLES.on_order}`}>
                          On order
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-center text-xs text-stone-400 dark:text-slate-500">
              Scanning a delivery for an on-order line books it back into stock automatically.
            </p>
          </div>
        )
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl">🔩</span>}
          title={items.length === 0 ? "No hardware yet" : "No matches"}
          subtitle={items.length === 0 ? "Add your first stock line, print its label, and stick it on the box or bin." : "Try a different search."}
          action={items.length === 0 ? <button className="btn-primary" onClick={openAdd}>Add hardware</button> : undefined}
        />
      ) : (
        <div className="stagger space-y-2">
          {visible.map((i) => (
            <button key={i.id} onClick={() => setSelected(i)} className="card tap flex w-full items-center gap-3 p-3.5 text-left transition active:scale-[0.99]">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-stone-900 dark:text-slate-100">{i.name}</p>
                <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                  {i.code}
                  {i.category ? ` · ${i.category}` : ""}
                  {i.location ? ` · 📍 ${i.location}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-bold tabular-nums ${isLow(i) ? "text-amber-600 dark:text-amber-400" : "text-stone-800 dark:text-slate-100"}`}>
                  {i.qtyOnHand} {i.unit}
                </p>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${HW_STATUS_STYLES[i.orderStatus] || HW_STATUS_STYLES.ok}`}>
                  {isLow(i) ? "Low" : HW_STATUS_LABELS[i.orderStatus] || i.orderStatus}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Item detail */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name || "Hardware"}>
        {selected && (
          <div className="space-y-3">
            <p className="text-sm text-stone-500 dark:text-slate-400">
              <span className="font-mono font-semibold text-stone-700 dark:text-slate-200">{selected.code}</span>
              {selected.category ? ` · ${selected.category}` : ""}
              {selected.supplier ? ` · ${selected.supplier}` : ""}
              {selected.packSize ? ` · ${selected.packSize}` : ""}
              {selected.location ? ` · 📍 ${selected.location}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-stone-50 px-2 py-2 dark:bg-night-850">
                <div className="text-sm font-bold text-stone-900 dark:text-slate-100">
                  {selected.qtyOnHand} {selected.unit}
                </div>
                <div className="text-[11px] text-stone-500 dark:text-slate-400">On hand</div>
              </div>
              <div className="rounded-xl bg-stone-50 px-2 py-2 dark:bg-night-850">
                <div className="text-sm font-bold text-stone-900 dark:text-slate-100">{selected.reorderLevel}</div>
                <div className="text-[11px] text-stone-500 dark:text-slate-400">Reorder at</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="btn-primary flex-1" onClick={() => act(selected, "delivered")}>
                + Book in delivery
              </button>
              {selected.orderStatus === "ok" ? (
                <button className="btn-secondary flex-1" onClick={() => act(selected, "flag")}>
                  Add to order list
                </button>
              ) : (
                <button className="btn-secondary flex-1" onClick={() => act(selected, "unflag")}>
                  Remove from order list
                </button>
              )}
            </div>

            {selected.events && selected.events.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">History</p>
                <ul className="space-y-1.5">
                  {selected.events.map((e) => (
                    <li key={e.id} className="flex gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                      <span className="text-stone-600 dark:text-slate-300">
                        {HW_EVENT_LABELS[e.type] || e.type}
                        {e.qty ? ` × ${e.qty}` : ""}
                        {e.note ? ` — ${e.note}` : ""}
                        <span className="text-xs text-stone-400 dark:text-slate-500"> · {relativeTime(e.createdAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button className="btn-secondary flex-1" onClick={() => openEdit(selected)}>
                Edit
              </button>
              <button className="btn-ghost flex-1 text-red-600" onClick={() => remove(selected)}>
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add / edit form */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editingId ? "Edit hardware" : "Add hardware"}>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Product name</label>
            <input className="input" value={form.name} onChange={set("name")} placeholder="e.g. Blum 110° soft-close hinge" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category</label>
              <input className="input" value={form.category} onChange={set("category")} placeholder="Hinges" />
            </div>
            <div>
              <label className="label">Supplier</label>
              <input className="input" value={form.supplier} onChange={set("supplier")} placeholder="Hafele" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Unit</label>
              <select className="input" value={form.unit} onChange={set("unit")}>
                <option value="box">box</option>
                <option value="pack">pack</option>
                <option value="each">each</option>
                <option value="roll">roll</option>
                <option value="tube">tube</option>
              </select>
            </div>
            <div>
              <label className="label">Pack size (on label)</label>
              <input className="input" value={form.packSize} onChange={set("packSize")} placeholder="100 pcs" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">On hand</label>
              <input className="input" type="number" inputMode="numeric" min="0" value={form.qtyOnHand} onChange={set("qtyOnHand")} />
            </div>
            <div>
              <label className="label">Reorder at</label>
              <input className="input" type="number" inputMode="numeric" min="0" value={form.reorderLevel} onChange={set("reorderLevel")} />
            </div>
            <div>
              <label className="label">Shelf / bay</label>
              <input className="input" value={form.location} onChange={set("location")} placeholder="A3" />
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save" : "Add hardware"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
