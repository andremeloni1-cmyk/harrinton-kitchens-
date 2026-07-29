"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/job";
import { EmptyState } from "@/components/EmptyState";
import type { OrderLine, OrderSummary, RequirementChange } from "@/lib/hardware-order";
import type { UnmatchedCabinet, DerivedLine } from "@/lib/hardware-rules";
import type { BoardSummary, ParseWarning } from "@/lib/cadmaster";

type ItemRef = { id: string; code: string; name: string; unit: string; packSize: string | null; piecesPerPack: number };

type Preview = {
  report: {
    accountName: string;
    summary: BoardSummary;
    cabinetTypes: { type: string; count: number }[];
    warnings: ParseWarning[];
  };
  derived: { lines: DerivedLine[]; unmatched: UnmatchedCabinet[]; unusedRuleIds: string[] };
  requirements: { hardwareItemId: string; requiredPieces: number }[];
  changes: RequirementChange[];
  changeSummary: string;
  items: ItemRef[];
};

const STATUS_STYLE: Record<string, string> = {
  in_stock: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  short: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  on_order: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
};
const STATUS_LABEL: Record<string, string> = { in_stock: "In stock", short: "Short", on_order: "On order" };

/**
 * The hardware a job needs, where it comes from, and what has to be bought.
 *
 * The import is a two-step on purpose. A board report is read by rules that
 * guess, and a re-import replaces what came before it, so the preview shows
 * what changed and what produced nothing *before* anything is written. That
 * review step is the safety model, not a formality.
 */
export function JobHardware({ jobId }: { jobId: string }) {
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ lines: OrderLine[]; summary: OrderSummary }>(`/api/jobs/${jobId}/hardware`);
      setLines(r.lines);
      setSummary(r.summary);
    } catch {
      // A failed refresh leaves the last good list on screen rather than
      // blanking it — a hardware list that vanishes reads as "nothing needed".
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", files[0]);
      const res = await fetch(`/api/jobs/${jobId}/hardware/import`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(body.error || "Couldn't read that file.");
        return;
      }
      setPreview(body as Preview);
    } catch {
      setMsg("Couldn't upload that — check your connection and try again.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ lines: OrderLine[]; summary: OrderSummary }>(`/api/jobs/${jobId}/hardware/confirm`, {
        method: "POST",
        body: JSON.stringify({ requirements: preview.requirements }),
      });
      setLines(r.lines);
      setSummary(r.summary);
      setPreview(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save that list.");
    } finally {
      setBusy(false);
    }
  }

  async function flagShort() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ flagged: number; lines: OrderLine[] }>(`/api/jobs/${jobId}/hardware/flag`, { method: "POST" });
      setLines(r.lines);
      setMsg(`Flagged ${r.flagged} line${r.flagged === 1 ? "" : "s"} for reorder.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't flag those.");
    } finally {
      setBusy(false);
    }
  }

  async function pick(hardwareItemId: string, pieces: number) {
    setBusy(true);
    try {
      const r = await api<{ lines: OrderLine[] }>(`/api/jobs/${jobId}/hardware/pick`, {
        method: "POST",
        body: JSON.stringify({ hardwareItemId, pieces }),
      });
      setLines(r.lines);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't record that pick.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-900 dark:text-slate-100">Hardware</p>
          <p className="text-xs text-stone-500 dark:text-slate-400">
            Import the CAD board report; the rules work out the hinges, runners and fixings.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/hardware/rules" className="btn-ghost text-sm text-stone-500 dark:text-slate-400">
            Rules
          </Link>
          <button className="btn-secondary text-sm" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? "Working…" : lines.length ? "Re-import" : "Import report"}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          hidden
          onChange={(e) => upload(e.target.files)}
        />
      </div>

      {preview && <ImportPreview preview={preview} busy={busy} onConfirm={confirm} onCancel={() => setPreview(null)} />}

      {msg && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {msg}
        </p>
      )}

      {!preview && (
        <div className="mt-3">
          {loading ? (
            <p className="text-sm text-stone-500 dark:text-slate-400">Loading…</p>
          ) : lines.length === 0 ? (
            <EmptyState
              title="No hardware worked out yet"
              subtitle="Import the job's CADMaster board report and the rules will turn its cabinets into a hardware list."
            />
          ) : (
            <>
              {summary && (
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-stone-500 dark:text-slate-400">
                  <span>{summary.lines} lines</span>
                  <span className="text-emerald-700 dark:text-emerald-300">{summary.inStock} in stock</span>
                  {summary.short > 0 && <span className="text-red-700 dark:text-red-300">{summary.short} short</span>}
                  {summary.onOrder > 0 && <span className="text-sky-700 dark:text-sky-300">{summary.onOrder} on order</span>}
                  {summary.short > 0 && (
                    <button className="ml-auto btn-primary text-xs" disabled={busy} onClick={flagShort}>
                      Flag {summary.short} for reorder
                    </button>
                  )}
                </div>
              )}
              <div className="space-y-2">
                {lines.map((line) => (
                  <OrderRow key={line.hardwareItemId} line={line} busy={busy} onPick={pick} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OrderRow({
  line,
  busy,
  onPick,
}: {
  line: OrderLine;
  busy: boolean;
  onPick: (id: string, pieces: number) => void;
}) {
  const remaining = line.outstandingPieces;
  return (
    <div className="rounded-xl bg-stone-50 p-3 dark:bg-night-850">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-900 dark:text-slate-100">{line.name}</p>
          <p className="truncate text-[11px] text-stone-400 dark:text-slate-500">
            {line.code}
            {line.supplier ? ` · ${line.supplier}` : ""}
            {line.piecesPerPack > 1 ? ` · ${line.piecesPerPack} per ${line.unit}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[line.status]}`}>
          {STATUS_LABEL[line.status]}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs sm:grid-cols-4">
        <Fact label="Needs" value={`${line.requiredPieces}`} />
        <Fact label="Free" value={`${line.freePieces}`} tone={line.freePieces < 0 ? "bad" : undefined} />
        {line.shortfallPieces > 0 ? (
          <Fact label="Short" value={`${line.shortfallPieces}`} tone="bad" />
        ) : (
          <Fact label="Short" value="—" />
        )}
        {line.orderPacks > 0 && (
          <Fact label="Order" value={`${line.orderPacks} ${line.unit}${line.orderPacks === 1 ? "" : "s"}`} tone="bad" />
        )}
      </dl>

      {line.orderPacks > 0 && line.orderPieces !== line.shortfallPieces && (
        // Whole packs mean you receive more than you need. Saying so stops the
        // number reading like a mistake.
        <p className="mt-1 text-[11px] text-stone-400 dark:text-slate-500">
          {line.orderPacks} {line.unit}
          {line.orderPacks === 1 ? "" : "s"} delivers {line.orderPieces} — {line.orderPieces - line.shortfallPieces} spare.
        </p>
      )}

      <div className="mt-2 flex items-center gap-2 border-t border-stone-200 pt-2 dark:border-night-line">
        <span className="text-[11px] text-stone-500 dark:text-slate-400">
          Picked {line.pickedPieces} of {line.requiredPieces}
          {remaining > 0 ? ` · ${remaining} to go` : " · complete"}
        </span>
        <div className="ml-auto flex gap-1.5">
          {line.pickedPieces > 0 && (
            <button
              className="btn-ghost text-xs text-stone-500 dark:text-slate-400"
              disabled={busy}
              onClick={() => onPick(line.hardwareItemId, -remaining || -line.pickedPieces)}
              aria-label={`Undo picks for ${line.name}`}
            >
              Undo
            </button>
          )}
          {remaining > 0 && (
            <button className="btn-secondary text-xs" disabled={busy} onClick={() => onPick(line.hardwareItemId, remaining)}>
              Pick {remaining}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportPreview({
  preview,
  busy,
  onConfirm,
  onCancel,
}: {
  preview: Preview;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const names = new Map(preview.items.map((i) => [i.id, i]));
  const { report, derived, changes } = preview;
  const pickedConflict = changes.filter((c) => c.picked);

  return (
    <div className="mt-3 rounded-xl border-l-4 border-brand-400 bg-stone-50 p-3 dark:bg-night-850">
      <p className="text-sm font-bold text-stone-900 dark:text-slate-100">
        Read {report.summary.cabinets} cabinet{report.summary.cabinets === 1 ? "" : "s"} · {report.summary.pieces} panels
      </p>
      <p className="text-xs text-stone-500 dark:text-slate-400">{preview.changeSummary}</p>

      {derived.unmatched.length > 0 && (
        // The loud bit. A cabinet type with no rule contributes nothing, and a
        // silent nothing is indistinguishable from a correct nothing.
        <div className="mt-2 rounded-lg bg-amber-50 p-2.5 dark:bg-amber-500/10">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
            {derived.unmatched.reduce((n, u) => n + u.count, 0)} cabinet
            {derived.unmatched.reduce((n, u) => n + u.count, 0) === 1 ? "" : "s"} produced no hardware
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
            {derived.unmatched.map((u) => (
              <li key={u.type}>
                <span className="font-semibold">{u.type}</span> ×{u.count} — panels: {u.panelCodes.join(", ")}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
            Add a rule for these on the{" "}
            <Link href="/hardware/rules" className="underline">
              rules screen
            </Link>{" "}
            if they need hardware.
          </p>
        </div>
      )}

      {pickedConflict.length > 0 && (
        <div className="mt-2 rounded-lg bg-red-50 p-2.5 text-[11px] text-red-800 dark:bg-red-500/10 dark:text-red-300">
          <p className="font-bold">
            {pickedConflict.length} line{pickedConflict.length === 1 ? "" : "s"} already have stock picked against them
          </p>
          <p>Picked quantities are kept — stock off the shelf stays off the shelf whatever the revision says.</p>
        </div>
      )}

      {changes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-stone-600 dark:text-slate-300">
          {changes.slice(0, 12).map((c) => (
            <li key={c.hardwareItemId} className="flex items-baseline gap-2">
              <span className="w-16 shrink-0 font-semibold tabular-nums">
                {c.deltaPieces > 0 ? `+${c.deltaPieces}` : c.deltaPieces}
              </span>
              <span className="min-w-0 flex-1 truncate">{names.get(c.hardwareItemId)?.name ?? c.hardwareItemId}</span>
              <span className="shrink-0 tabular-nums text-stone-400 dark:text-slate-500">
                {c.beforePieces} → {c.afterPieces}
              </span>
            </li>
          ))}
          {changes.length > 12 && <li className="text-stone-400">…and {changes.length - 12} more</li>}
        </ul>
      )}

      {report.warnings.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
          {report.warnings.length} line{report.warnings.length === 1 ? "" : "s"} in the file couldn&apos;t be read.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button className="btn-accent flex-1 text-sm" disabled={busy} onClick={onConfirm}>
          {busy ? "Saving…" : changes.length === 0 ? "Nothing to change" : "Save this list"}
        </button>
        <button className="btn-ghost text-sm" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] uppercase tracking-wide text-stone-400 dark:text-slate-500">{label}</dt>
      <dd
        className={`truncate font-semibold tabular-nums ${
          tone === "bad" ? "text-red-700 dark:text-red-300" : "text-stone-800 dark:text-slate-100"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
