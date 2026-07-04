"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { MoneyTabs } from "@/components/MoneyTabs";
import { InvoiceStatusPill } from "@/components/InvoiceStatusPill";
import { PriceItemPicker } from "@/components/PriceItemPicker";
import { fmtMoney, fmtDay, relativeTime } from "@/lib/format";
import { api, type InvoiceDTO, type InvoiceLineItemDTO, type JobDTO } from "@/lib/job";

type XeroState = { configured: boolean; connected: boolean };

type Tab = "all" | "draft" | "awaiting" | "overdue" | "paid";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "awaiting", label: "Awaiting payment" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
];

const AWAITING = (s: string) => ["submitted", "authorised"].includes(s);

/** Australian financial year (July–June) start for "paid this FY". */
function fyStart(): Date {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 6, 1);
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [xero, setXero] = useState<XeroState>({ configured: false, connected: false });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [selected, setSelected] = useState<InvoiceDTO | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async (sync: boolean) => {
    const data = await api<{ invoices: InvoiceDTO[]; xero: XeroState }>(
      `/api/invoices${sync ? "?sync=1" : ""}`
    );
    setInvoices(data.invoices);
    setXero(data.xero);
  }, []);

  useEffect(() => {
    load(true).finally(() => setLoading(false));
  }, [load]);

  const stats = useMemo(() => {
    const live = invoices.filter((i) => i.status !== "voided");
    const outstanding = live
      .filter((i) => AWAITING(i.status))
      .reduce((s, i) => s + i.amountDue, 0);
    const overdue = live.filter((i) => i.overdue).reduce((s, i) => s + i.amountDue, 0);
    const paidFY = live
      .filter((i) => new Date(i.issueDate) >= fyStart())
      .reduce((s, i) => s + i.amountPaid, 0);
    return { outstanding, overdue, paidFY };
  }, [invoices]);

  const filtered = useMemo(() => {
    switch (tab) {
      case "draft":
        return invoices.filter((i) => i.status === "draft");
      case "awaiting":
        return invoices.filter((i) => AWAITING(i.status));
      case "overdue":
        return invoices.filter((i) => i.overdue);
      case "paid":
        return invoices.filter((i) => i.status === "paid");
      default:
        return invoices;
    }
  }, [invoices, tab]);

  const refreshSelected = async (id: string) => {
    await load(false);
    const { invoice } = await api<{ invoice: InvoiceDTO }>(`/api/invoices/${id}`);
    setSelected(invoice);
  };

  return (
    <div className="px-4 pt-6">
      <header className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Money</h1>
          <p className="text-sm text-stone-500 dark:text-slate-400">Invoices synced with Xero.</p>
        </div>
        <button onClick={() => setPickerOpen(true)} className="btn-primary whitespace-nowrap">
          New invoice
        </button>
      </header>

      <div className="mt-4">
        <MoneyTabs />
      </div>

      {xero.configured && !xero.connected && !loading && (
        <Link href="/settings" className="mb-4 block">
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20">
            Xero isn&apos;t connected — invoices stay local until you connect it in Settings.
          </div>
        </Link>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Outstanding" value={fmtMoney(stats.outstanding)} tone="sky" />
        <Stat label="Overdue" value={fmtMoney(stats.overdue)} tone={stats.overdue > 0 ? "red" : "stone"} />
        <Stat label="Paid this FY" value={fmtMoney(stats.paidFY)} tone="green" />
      </div>

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              tab === t.key ? "bg-brand-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 dark:bg-night-850 dark:text-slate-300 dark:ring-night-line"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 skeleton rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl">🧾</span>}
          title={tab === "all" ? "No invoices yet" : "Nothing here"}
          subtitle="Invoices are created automatically when a job is completed, or start one from any job."
          action={
            <button onClick={() => setPickerOpen(true)} className="btn-primary">
              New invoice
            </button>
          }
        />
      ) : (
        <div className="space-y-3 stagger">
          {filtered.map((inv) => (
            <button key={inv.id} onClick={() => setSelected(inv)} className="block w-full text-left">
              <div className="card tap p-4 transition hover:shadow-md active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-stone-900 dark:text-slate-100">
                      {inv.number}
                      {inv.xeroNumber && inv.xeroNumber !== inv.number && (
                        <span className="ml-1.5 text-xs font-normal text-stone-400 dark:text-slate-500">({inv.xeroNumber} in Xero)</span>
                      )}
                    </h3>
                    <p className="mt-0.5 truncate text-sm text-stone-500 dark:text-slate-400">
                      {inv.client?.name || "No client"}
                      {inv.job ? ` · ${inv.job.reference}` : ""}
                    </p>
                  </div>
                  <InvoiceStatusPill status={inv.status} overdue={inv.overdue} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-semibold text-stone-900 dark:text-slate-100">{fmtMoney(inv.total, inv.currency)}</span>
                  <span className={`text-xs ${inv.overdue ? "font-semibold text-red-600 dark:text-red-400" : "text-stone-400 dark:text-slate-500"}`}>
                    {inv.status === "paid"
                      ? "Paid in full"
                      : inv.dueDate
                        ? `Due ${fmtDay(inv.dueDate)}`
                        : "No due date"}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <InvoiceDetailModal
          invoice={selected}
          xero={xero}
          onClose={() => setSelected(null)}
          onChanged={() => refreshSelected(selected.id)}
          onGone={() => {
            setSelected(null);
            load(false);
          }}
        />
      )}
      {pickerOpen && (
        <JobPickerModal
          onClose={() => setPickerOpen(false)}
          onCreated={(inv) => {
            setPickerOpen(false);
            load(false);
            setSelected(inv);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "sky" | "red" | "green" | "stone" }) {
  const tones = {
    sky: "text-sky-700 dark:text-sky-300",
    red: "text-red-700 dark:text-red-300",
    green: "text-green-700 dark:text-green-300",
    stone: "text-stone-700 dark:text-slate-200",
  };
  return (
    <div className="card px-2 py-3 text-center">
      <div className={`truncate text-base font-bold ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-stone-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

function parseItems(raw: string): InvoiceLineItemDTO[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* ignore */
  }
  return [];
}

function InvoiceDetailModal({
  invoice,
  xero,
  onClose,
  onChanged,
  onGone,
}: {
  invoice: InvoiceDTO;
  xero: XeroState;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onGone: () => void;
}) {
  // Only plain drafts are editable — a submitted invoice is awaiting approval
  // in Xero and editing it would revert that state (see api/invoices/[id]).
  const editable = invoice.status === "draft";
  const [items, setItems] = useState<InvoiceLineItemDTO[]>(() => parseItems(invoice.lineItems));
  const [dueDate, setDueDate] = useState(invoice.dueDate ? invoice.dueDate.slice(0, 10) : "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPricePicker, setShowPricePicker] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Save a typed line into the price list so it can be pulled again later.
  async function saveLineToPriceList(line: InvoiceLineItemDTO) {
    const name = line.description.trim();
    if (!name) return;
    try {
      await api("/api/price-items", {
        method: "POST",
        body: JSON.stringify({ name, price: line.unitAmount || 0, unit: "each" }),
      });
      setSavedMsg(`Saved "${name}" to your price list`);
      setTimeout(() => setSavedMsg(null), 2500);
    } catch {
      setError("Couldn't save that line to the price list.");
    }
  }

  const suggest = () =>
    run("suggest", async () => {
      const { lines } = await api<{ lines: InvoiceLineItemDTO[] }>(
        `/api/invoices/${invoice.id}/suggest`,
        { method: "POST" }
      );
      if (lines.length === 0) {
        setError("Nothing on the price list clearly matched the job description.");
        return;
      }
      setItems((prev) => [...prev, ...lines]);
      setDirty(true);
    });

  // Reset the editor whenever a different / refreshed invoice arrives.
  useEffect(() => {
    setItems(parseItems(invoice.lineItems));
    setDueDate(invoice.dueDate ? invoice.dueDate.slice(0, 10) : "");
    setDirty(false);
  }, [invoice]);

  const subtotal = items.reduce((s, i) => s + (i.quantity || 0) * (i.unitAmount || 0), 0);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run("save", async () => {
      const res = await api<{ invoice: InvoiceDTO; warning?: string }>(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ lineItems: items, dueDate: dueDate || null }),
      });
      if (res.warning) setError(res.warning);
      await onChanged();
    });

  const push = (authorise: boolean) =>
    run(authorise ? "authorise" : "push", async () => {
      if (authorise && !confirm(`Authorise ${invoice.number} in Xero? It becomes a live invoice awaiting payment.`)) return;
      await api(`/api/invoices/${invoice.id}/push`, {
        method: "POST",
        body: JSON.stringify({ authorise }),
      });
      await onChanged();
    });

  const remove = () =>
    run("delete", async () => {
      const verb = invoice.status === "authorised" ? "Void" : "Delete";
      if (!confirm(`${verb} ${invoice.number}?`)) return;
      await api(`/api/invoices/${invoice.id}`, { method: "DELETE" });
      onGone();
    });

  return (
    <Modal open onClose={onClose} title={invoice.number}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <InvoiceStatusPill status={invoice.status} overdue={invoice.overdue} />
          {invoice.xeroInvoiceId ? (
            <span className="text-xs text-stone-400 dark:text-slate-500">
              In Xero{invoice.lastSyncedAt ? ` · synced ${relativeTime(invoice.lastSyncedAt)}` : ""}
            </span>
          ) : (
            <span className="text-xs text-stone-400 dark:text-slate-500">Local only</span>
          )}
        </div>

        <div className="text-sm text-stone-600 dark:text-slate-300">
          <p className="font-medium text-stone-800 dark:text-slate-100">{invoice.client?.name || "No client"}</p>
          {invoice.job && (
            <Link href={`/jobs/${invoice.job.id}`} className="text-brand-600">
              {invoice.job.reference} — {invoice.job.title}
            </Link>
          )}
          <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Issued {fmtDay(invoice.issueDate)}</p>
        </div>

        {/* Line items — each shows Qty × Unit price = line total */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Items</p>
          {items.map((item, idx) => {
            const lineTotal = (item.quantity || 0) * (item.unitAmount || 0);
            const update = (patch: Partial<InvoiceLineItemDTO>) => {
              const next = [...items];
              next[idx] = { ...item, ...patch };
              setItems(next);
              setDirty(true);
            };
            return editable ? (
              <div
                key={idx}
                className="rounded-2xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-100 dark:bg-night-850 dark:ring-night-line"
              >
                <div className="flex items-center gap-2">
                  <input
                    className="input flex-1 bg-white dark:bg-night-900"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => update({ description: e.target.value })}
                  />
                  <button
                    onClick={() => {
                      setItems(items.filter((_, i) => i !== idx));
                      setDirty(true);
                    }}
                    className="shrink-0 rounded-full p-1.5 text-stone-300 hover:bg-stone-100 hover:text-stone-500 dark:text-slate-600 dark:hover:bg-night-800 dark:hover:text-slate-400"
                    aria-label="Remove line"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2 flex items-end gap-2">
                  <label className="w-20">
                    <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
                      Qty
                    </span>
                    <input
                      className="input w-full bg-white text-center dark:bg-night-900"
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(e) => update({ quantity: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex-1">
                    <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Unit price
                    </span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400 dark:text-slate-500">$</span>
                      <input
                        className="input w-full bg-white pl-7 dark:bg-night-900"
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={item.unitAmount}
                        onChange={(e) => update({ unitAmount: Number(e.target.value) })}
                      />
                    </div>
                  </label>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-stone-200/70 pt-2 dark:border-night-line">
                  <button
                    type="button"
                    onClick={() => saveLineToPriceList(item)}
                    disabled={!item.description.trim()}
                    className="text-xs font-semibold text-brand-600 disabled:opacity-40"
                  >
                    Save to price list
                  </button>
                  <span className="font-semibold text-stone-900 tabular-nums dark:text-slate-100">
                    {fmtMoney(lineTotal, invoice.currency)}
                  </span>
                </div>
              </div>
            ) : (
              <div key={idx} className="flex items-start justify-between gap-3 border-b border-stone-100 pb-2 last:border-0 dark:border-night-line">
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-800 dark:text-slate-100">{item.description || "—"}</p>
                  <p className="mt-0.5 text-xs text-stone-400 dark:text-slate-500">
                    {item.quantity} × {fmtMoney(item.unitAmount, invoice.currency)}
                  </p>
                </div>
                <span className="whitespace-nowrap font-semibold text-stone-900 tabular-nums dark:text-slate-100">
                  {fmtMoney(lineTotal, invoice.currency)}
                </span>
              </div>
            );
          })}
          {editable && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5">
              <button
                onClick={() => {
                  setItems([...items, { description: "", quantity: 1, unitAmount: 0 }]);
                  setDirty(true);
                }}
                className="text-sm font-semibold text-brand-600"
              >
                + Add line
              </button>
              <button onClick={() => setShowPricePicker(true)} className="text-sm font-semibold text-brand-600">
                Add from price list
              </button>
              {invoice.job && (
                <button onClick={suggest} disabled={busy !== null} className="text-sm font-semibold text-brand-600 disabled:opacity-50">
                  {busy === "suggest" ? "Suggesting…" : "Suggest from job"}
                </button>
              )}
            </div>
          )}
        </div>

        {showPricePicker && (
          <PriceItemPicker
            companyId={invoice.job?.companyId}
            onClose={() => setShowPricePicker(false)}
            onPick={(item) => {
              setItems((prev) => [
                ...prev,
                { description: item.name, quantity: 1, unitAmount: item.resolvedPrice ?? item.price },
              ]);
              setDirty(true);
              setShowPricePicker(false);
            }}
          />
        )}

        {/* Totals */}
        <div className="space-y-1.5 border-t border-stone-100 pt-3 text-sm dark:border-night-line">
          <div className="flex items-center justify-between text-stone-500 dark:text-slate-400">
            <span>Subtotal excluding tax</span>
            <span className="tabular-nums">{fmtMoney(dirty ? subtotal : invoice.subtotal, invoice.currency)}</span>
          </div>
          <div className="flex items-center justify-between text-stone-500 dark:text-slate-400">
            <span>GST (10%)</span>
            <span className="tabular-nums">{fmtMoney(dirty ? subtotal * 0.1 : invoice.tax, invoice.currency)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between border-t border-stone-100 pt-2.5 dark:border-night-line">
            <span className="font-semibold text-stone-900 dark:text-slate-100">Total</span>
            <span className="text-2xl font-bold text-stone-900 tabular-nums dark:text-slate-100">
              {fmtMoney(dirty ? subtotal * 1.1 : invoice.total, invoice.currency)}
            </span>
          </div>
          {invoice.amountPaid > 0 && (
            <>
              <Row label="Paid" value={fmtMoney(invoice.amountPaid, invoice.currency)} />
              <Row label="Due" value={fmtMoney(invoice.amountDue, invoice.currency)} bold />
            </>
          )}
        </div>

        {/* Due date */}
        {editable ? (
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">Due date</span>
            <input
              type="date"
              className="input mt-1 w-full"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setDirty(true);
              }}
            />
          </label>
        ) : (
          invoice.dueDate && (
            <p className={`text-sm ${invoice.overdue ? "font-semibold text-red-600 dark:text-red-400" : "text-stone-500 dark:text-slate-400"}`}>
              Due {fmtDay(invoice.dueDate)}
            </p>
          )
        )}

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        {savedMsg && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{savedMsg}</p>}

        {/* Actions */}
        <div className="space-y-2 pt-1">
          {editable && dirty && (
            <button onClick={save} disabled={busy !== null} className="btn-primary w-full">
              {busy === "save" ? "Saving…" : "Save changes"}
            </button>
          )}
          {editable && !dirty && xero.connected && (
            <>
              {!invoice.xeroInvoiceId && (
                <button
                  onClick={() => push(false)}
                  disabled={busy !== null}
                  className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50 dark:bg-night-850 dark:text-slate-200 dark:ring-night-line dark:hover:bg-night-800"
                >
                  {busy === "push" ? "Pushing…" : "Push to Xero as draft"}
                </button>
              )}
              <button onClick={() => push(true)} disabled={busy !== null} className="btn-primary w-full">
                {busy === "authorise" ? "Authorising…" : "Authorise & send to Xero"}
              </button>
            </>
          )}
          {editable && !dirty && !xero.connected && (
            <p className="text-center text-xs text-stone-400 dark:text-slate-500">
              Connect Xero in Settings to push this invoice to your books.
            </p>
          )}
          {(editable || (invoice.status === "authorised" && invoice.amountPaid === 0)) && (
            <button
              onClick={remove}
              disabled={busy !== null}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              {busy === "delete"
                ? "Working…"
                : invoice.status === "authorised"
                  ? "Void invoice"
                  : "Delete draft"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-stone-500 dark:text-slate-400">{label}</span>
      <span className={bold ? "font-bold text-stone-900 dark:text-slate-100" : "text-stone-700 dark:text-slate-200"}>{value}</span>
    </div>
  );
}

function JobPickerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (invoice: InvoiceDTO) => void;
}) {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ jobs: JobDTO[] }>("/api/jobs")
      .then(({ jobs }) => setJobs(jobs.filter((j) => j.status !== "cancelled")))
      .finally(() => setLoading(false));
  }, []);

  const create = async (job: JobDTO) => {
    setCreating(job.id);
    setError(null);
    try {
      const { invoice } = await api<{ invoice: InvoiceDTO }>("/api/invoices", {
        method: "POST",
        body: JSON.stringify({ jobId: job.id }),
      });
      onCreated(invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the invoice");
      setCreating(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="Invoice a job">
      {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 skeleton rounded-xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-500 dark:text-slate-400">No jobs to invoice yet.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => create(job)}
              disabled={creating !== null}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ring-1 ring-stone-100 transition hover:bg-stone-50 dark:ring-night-line dark:hover:bg-night-800"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-stone-800 dark:text-slate-100">{job.title}</p>
                <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                  {job.reference} · {job.clientName || "No client"}
                </p>
              </div>
              <span className="whitespace-nowrap text-sm font-semibold text-stone-700 dark:text-slate-200">
                {creating === job.id ? "Creating…" : fmtMoney(job.quoteAmount, job.currency)}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
