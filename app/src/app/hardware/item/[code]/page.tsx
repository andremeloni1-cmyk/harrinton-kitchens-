"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/job";
import { relativeTime } from "@/lib/format";
import { type HardwareItemDTO, HW_EVENT_LABELS } from "@/lib/hardware";

// The page a scanned QR label lands on — big, gloves-on buttons for the two
// factory moments: a delivery arriving, or a box running out.
export default function HardwareScanActionPage() {
  const { code } = useParams<{ code: string }>();
  const [item, setItem] = useState<HardwareItemDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { item } = await api<{ item: HardwareItemDTO }>(`/api/hardware?code=${encodeURIComponent(code)}`);
      setItem(item);
    } catch {
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [code]);
  useEffect(() => {
    load();
  }, [load]);

  async function act(action: "delivered" | "flag") {
    if (!item) return;
    setBusy(action);
    setMessage(null);
    try {
      const res = await api<{ item: HardwareItemDTO; message: string }>(`/api/hardware/${item.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action, qty }),
      });
      setItem({ ...res.item, events: item.events });
      setMessage(res.message);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="px-4 pt-8 text-center text-stone-400 dark:text-slate-500">Loading…</div>;
  if (!item) {
    return (
      <div className="px-4 pt-8 text-center">
        <p className="font-semibold text-stone-800 dark:text-slate-100">Label not recognised</p>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
          No hardware line matches “{code}”. It may have been deleted.
        </p>
        <Link href="/hardware" className="mt-4 inline-block text-sm font-semibold text-brand-600">
          Open the hardware list
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-6">
      <Link href="/hardware" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 dark:text-slate-400">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All hardware
      </Link>

      <div className="card p-5 text-center">
        <p className="font-mono text-xs font-semibold tracking-wider text-stone-400 dark:text-slate-500">{item.code}</p>
        <h1 className="mt-1 text-xl font-bold text-stone-900 dark:text-slate-100">{item.name}</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
          {[item.packSize, item.supplier, item.location ? `📍 ${item.location}` : null].filter(Boolean).join(" · ") || "—"}
        </p>
        <p className="mt-3 text-3xl font-bold tabular-nums text-stone-900 dark:text-slate-100">
          {item.qtyOnHand}
          <span className="ml-1 text-base font-medium text-stone-400 dark:text-slate-500">{item.unit} on hand</span>
        </p>
        {item.orderStatus === "needs_order" && (
          <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            On the order list{item.flaggedAt ? ` since ${relativeTime(item.flaggedAt)}` : ""}
          </p>
        )}
        {item.orderStatus === "on_order" && (
          <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
            On order{item.orderedAt ? ` — placed ${relativeTime(item.orderedAt)}` : ""} · scan the delivery in when it lands
          </p>
        )}
      </div>

      {message && (
        <p className="toast-in mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          ✅ {message}
        </p>
      )}

      {/* Quantity stepper shared by both actions */}
      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl font-bold text-stone-600 ring-1 ring-stone-200 dark:bg-night-900 dark:text-slate-300 dark:ring-night-line"
        >
          −
        </button>
        <div className="w-20 text-center">
          <p className="text-2xl font-bold tabular-nums text-stone-900 dark:text-slate-100">{qty}</p>
          <p className="text-xs text-stone-400 dark:text-slate-500">{item.unit}{qty === 1 ? "" : "es"}</p>
        </div>
        <button
          onClick={() => setQty((q) => Math.min(999, q + 1))}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl font-bold text-stone-600 ring-1 ring-stone-200 dark:bg-night-900 dark:text-slate-300 dark:ring-night-line"
        >
          +
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <button
          onClick={() => act("delivered")}
          disabled={!!busy}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
        >
          📦 {busy === "delivered" ? "Booking in…" : `Delivery arrived — book in ${qty}`}
        </button>
        <button
          onClick={() => act("flag")}
          disabled={!!busy || item.orderStatus !== "ok"}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-40"
        >
          🚨 {busy === "flag" ? "Adding…" : item.orderStatus === "ok" ? `Box empty — order ${qty} more` : "Already on the order list"}
        </button>
      </div>

      {item.events && item.events.length > 0 && (
        <div className="card mt-4 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Recent activity</p>
          <ul className="space-y-1.5">
            {item.events.slice(0, 6).map((e) => (
              <li key={e.id} className="flex gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                <span className="text-stone-600 dark:text-slate-300">
                  {HW_EVENT_LABELS[e.type] || e.type}
                  {e.qty ? ` × ${e.qty}` : ""}
                  <span className="text-xs text-stone-400 dark:text-slate-500"> · {relativeTime(e.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
