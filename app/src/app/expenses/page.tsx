"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { MoneyTabs } from "@/components/MoneyTabs";
import { fmtMoney, fmtDay } from "@/lib/format";
import { api } from "@/lib/job";
import { BRAND } from "@/lib/brand";
import type { ExpenseDTO } from "@/lib/expenses";

type XeroState = { connected: boolean; bankReady: boolean };
type Extracted = { vendor?: string; date?: string; total?: number; gst?: number; category?: string; description?: string };

// Editable draft while capturing/reviewing a receipt.
type Draft = {
  vendor: string;
  date: string; // yyyy-mm-dd
  category: string;
  description: string;
  total: string;
  hasGst: boolean;
  gst: string;
  receiptData: string | null;
  receiptMime: string | null;
};

const todayInput = () => new Date().toISOString().slice(0, 10);
const emptyDraft = (): Draft => ({
  vendor: "",
  date: todayInput(),
  category: "",
  description: "",
  total: "",
  hasGst: true,
  gst: "",
  receiptData: null,
  receiptMime: null,
});

/** AU financial year start (1 July) for the current-quarter roll-up. */
function quarterStart(): Date {
  const now = new Date();
  const m = now.getMonth();
  return new Date(now.getFullYear(), m - (m % 3), 1);
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);
  const [xero, setXero] = useState<XeroState>({ connected: false, bankReady: false });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    const data = await api<{ expenses: ExpenseDTO[]; xero: XeroState }>("/api/expenses");
    setExpenses(data.expenses);
    setXero(data.xero);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const quarter = useMemo(() => {
    const from = quarterStart().getTime();
    const inQ = expenses.filter((e) => new Date(e.date).getTime() >= from);
    return {
      spent: inQ.reduce((s, e) => s + e.total, 0),
      gst: inQ.reduce((s, e) => s + e.gst, 0),
      count: inQ.length,
    };
  }, [expenses]);

  // Camera/file → downscale → open the review modal, prefilled by AI when possible.
  async function onPickFile(files: FileList | null) {
    const file = files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const { base64, mime } = await fileToBase64(file);
    const base: Draft = { ...emptyDraft(), receiptData: base64, receiptMime: mime };
    setDraft(base);
    setReading(true);
    try {
      const { extracted } = await api<{ extracted: Extracted }>("/api/expenses/extract", {
        method: "POST",
        body: JSON.stringify({ receiptData: base64, receiptMime: mime }),
      });
      setDraft({
        ...base,
        vendor: extracted.vendor || "",
        date: extracted.date || todayInput(),
        category: extracted.category || "",
        description: extracted.description || "",
        total: extracted.total != null ? String(extracted.total) : "",
        hasGst: extracted.gst == null ? true : extracted.gst > 0,
        gst: extracted.gst != null ? String(extracted.gst) : "",
      });
    } catch {
      // AI off or unreadable — leave the blank draft for manual entry.
      flash("Couldn't auto-read the receipt — enter the details below.");
    } finally {
      setReading(false);
    }
  }

  async function save(push: boolean) {
    if (!draft) return;
    const total = Number(draft.total);
    if (!Number.isFinite(total) || total <= 0) return flash("Enter the receipt total.");
    setSaving(true);
    try {
      const { pushError } = await api<{ expense: ExpenseDTO; pushError: string | null }>("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          vendor: draft.vendor,
          description: draft.description,
          category: draft.category,
          date: draft.date,
          total,
          hasGst: draft.hasGst,
          gst: draft.hasGst && draft.gst ? Number(draft.gst) : null,
          receiptData: draft.receiptData,
          receiptMime: draft.receiptMime,
          push,
        }),
      });
      setDraft(null);
      await load();
      flash(push ? (pushError ? `Saved — Xero push failed: ${pushError}` : "Saved and pushed to Xero") : "Receipt saved");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't save the receipt");
    } finally {
      setSaving(false);
    }
  }

  async function pushExisting(e: ExpenseDTO) {
    try {
      await api(`/api/expenses/${e.id}/push`, { method: "POST" });
      await load();
      flash("Pushed to Xero — reconcile it against your bank feed");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Couldn't push to Xero");
    }
  }

  async function remove(e: ExpenseDTO) {
    if (!confirm("Delete this receipt?")) return;
    await api(`/api/expenses/${e.id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  // Auto-fill GST as 1/11th when the toggle is on and the field is untouched-empty.
  const gstHint = draft && draft.hasGst && draft.total ? (Number(draft.total) / 11).toFixed(2) : "";

  return (
    <div className="px-4 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Money</h1>
      </header>
      <MoneyTabs />

      {/* Quarter roll-up */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Spent (qtr)" value={fmtMoney(quarter.spent)} />
        <Stat label="GST to claim (1B)" value={fmtMoney(quarter.gst)} tone="green" />
        <Stat label="Receipts" value={String(quarter.count)} />
      </div>

      {/* Connection hint */}
      {!xero.connected ? (
        <p className="mb-3 rounded-2xl bg-stone-100 p-3 text-xs text-stone-500 dark:bg-night-850 dark:text-slate-400">
          Receipts are saved here and feed your BAS (1B). <Link href="/settings" className="font-semibold text-brand-600">Connect Xero</Link> to also push them as spend-money for one-tap reconciling.
        </p>
      ) : !xero.bankReady ? (
        <p className="mb-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          Pick which bank account receipts post to in <Link href="/settings" className="font-semibold underline">Settings → Xero</Link> to enable pushing.
        </p>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPickFile(e.target.files)}
      />
      <button onClick={() => fileRef.current?.click()} className="btn-accent mb-4 w-full">
        Capture a receipt
      </button>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 rounded-2xl" />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl">🧾</span>}
          title="No receipts yet"
          subtitle={`Snap a photo of a receipt and ${BRAND.name} reads the vendor, amount and GST — then totals your BAS 1B and (with Xero) files it as spend-money.`}
        />
      ) : (
        <div className="space-y-2.5 stagger pb-4">
          {expenses.map((e) => (
            <div key={e.id} className="card p-3.5">
              <div className="flex items-center gap-3">
                {e.hasReceipt ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/expenses/${e.id}/receipt`} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-lg dark:bg-night-800">🧾</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-stone-900 dark:text-slate-100">{e.vendor || "Expense"}</span>
                    <span className="shrink-0 font-bold tabular-nums text-stone-900 dark:text-slate-100">{fmtMoney(e.total, e.currency)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-400 dark:text-slate-500">
                    <span>{fmtDay(e.date)}</span>
                    {e.category && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-500 dark:bg-night-800 dark:text-slate-400">{e.category}</span>}
                    {e.gst > 0 && <span className="text-emerald-600 dark:text-emerald-400">GST {fmtMoney(e.gst, e.currency)}</span>}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-stone-100 pt-2.5 dark:border-night-line">
                {e.status === "pushed" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> In Xero — reconcile in your bank feed
                  </span>
                ) : (
                  <button
                    onClick={() => pushExisting(e)}
                    disabled={!xero.connected || !xero.bankReady}
                    className="text-xs font-semibold text-brand-600 disabled:opacity-40"
                    title={!xero.connected ? "Connect Xero first" : !xero.bankReady ? "Choose a bank account in Settings" : ""}
                  >
                    Push to Xero
                  </button>
                )}
                <button onClick={() => remove(e)} className="text-xs text-stone-400 hover:text-red-500 dark:text-slate-500">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Capture / review modal */}
      <Modal open={!!draft} onClose={() => (saving ? null : setDraft(null))} title="Review receipt">
        {draft && (
          <div className="space-y-3">
            {draft.receiptData && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:${draft.receiptMime};base64,${draft.receiptData}`}
                alt="Receipt"
                className="max-h-40 w-full rounded-xl object-contain ring-1 ring-stone-200 dark:ring-night-line"
              />
            )}
            {reading && <p className="text-center text-sm text-brand-600">Reading the receipt…</p>}

            <Field label="Vendor">
              <input className="input w-full" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} placeholder="Bunnings, etc." />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input type="date" className="input w-full" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </Field>
              <Field label="Category">
                <input className="input w-full" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Materials" />
              </Field>
            </div>
            <Field label="Description">
              <input className="input w-full" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What was bought" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total (inc GST)">
                <input type="number" inputMode="decimal" min="0" step="any" className="input w-full" value={draft.total} onChange={(e) => setDraft({ ...draft, total: e.target.value })} />
              </Field>
              <Field label={draft.hasGst ? "GST" : "GST-free"}>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  disabled={!draft.hasGst}
                  className="input w-full disabled:opacity-40"
                  value={draft.gst}
                  onChange={(e) => setDraft({ ...draft, gst: e.target.value })}
                  placeholder={gstHint}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-600 dark:text-slate-300">
              <input type="checkbox" checked={draft.hasGst} onChange={(e) => setDraft({ ...draft, hasGst: e.target.checked })} className="h-4 w-4 accent-brand-600" />
              Includes GST (claim 1/11th on your BAS)
            </label>

            <div className="flex flex-col gap-2 pt-1">
              {xero.connected && xero.bankReady ? (
                <>
                  <button onClick={() => save(true)} disabled={saving || reading} className="btn-accent w-full disabled:opacity-50">
                    {saving ? "Saving…" : "Save & push to Xero"}
                  </button>
                  <button onClick={() => save(false)} disabled={saving || reading} className="btn-secondary w-full disabled:opacity-50">
                    Save only
                  </button>
                </>
              ) : (
                <button onClick={() => save(false)} disabled={saving || reading} className="btn-accent w-full disabled:opacity-50">
                  {saving ? "Saving…" : "Save receipt"}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {toast && (
        <div className="toast-in fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-stone-900">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "stone" }: { label: string; value: string; tone?: "stone" | "green" }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] text-stone-400 dark:text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone === "green" ? "text-emerald-600 dark:text-emerald-400" : "text-stone-900 dark:text-slate-100"}`}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">{label}</span>
      {children}
    </label>
  );
}

// Downscale a receipt photo to keep the stored base64 small, then return base64.
const MAX_DIM = 1600;
async function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const longest = Math.max(width, height);
    if (longest > MAX_DIM) {
      const scale = MAX_DIM / longest;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.72));
      if (blob) return { base64: await blobToBase64(blob), mime: "image/jpeg" };
    }
  } catch {
    /* fall through to raw file */
  }
  return { base64: await blobToBase64(file), mime: file.type || "image/jpeg" };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(blob);
  });
}
