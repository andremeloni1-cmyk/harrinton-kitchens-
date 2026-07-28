"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/job";
import { queueMutation } from "@/lib/offline-queue";
import {
  GROUP_LABELS,
  OTHER_SLOT,
  SELECTION_SLOTS,
  defaultSelections,
  emptySelection,
  filledProgress,
  isFilled,
  mergeWithSlots,
  parseSelections,
  selectionSummary,
  slotDef,
  slotLabel,
  type SelectionEntry,
  type SelectionGroup,
} from "@/lib/selections";

type SaveState = "idle" | "saving" | "saved" | "offline";

const FIELDS: { key: keyof SelectionEntry; label: string }[] = [
  { key: "brand", label: "Brand" },
  { key: "code", label: "Code" },
  { key: "colour", label: "Colour" },
  { key: "finish", label: "Finish" },
  { key: "supplier", label: "Supplier" },
];

/**
 * The client's colour and hardware choices for a job.
 *
 * Autosaves like the check-measure form does — a selection is usually typed in
 * on a phone, mid-conversation, and a save button is one more thing to forget.
 * A failed save queues for replay rather than being lost.
 */
export function Selections({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<SelectionEntry[]>(defaultSelections());
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<{ selections: unknown }>(`/api/jobs/${jobId}/selections`)
      .then((r) => setRows(mergeWithSlots(parseSelections(r.selections))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobId]);

  const save = useCallback(
    async (next: SelectionEntry[]) => {
      setSaveState("saving");
      const body = { selections: next };
      try {
        await api(`/api/jobs/${jobId}/selections`, { method: "PUT", body: JSON.stringify(body) });
        setSaveState("saved");
      } catch {
        await queueMutation(`/api/jobs/${jobId}/selections`, "PUT", body).catch(() => {});
        window.dispatchEvent(new CustomEvent("jf-offline-queued"));
        setSaveState("offline");
      }
    },
    [jobId]
  );

  // Debounced: typing a benchtop code shouldn't be one request per keystroke.
  const update = useCallback(
    (next: SelectionEntry[]) => {
      setRows(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 800);
    },
    [save]
  );

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  function setField(index: number, key: keyof SelectionEntry, value: string) {
    update(rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  }

  function addCustom() {
    const next = [...rows, emptySelection(OTHER_SLOT, "", rows.length)];
    update(next);
    setOpenSlot(`${OTHER_SLOT}-${next.length - 1}`);
  }

  function removeCustom(index: number) {
    update(rows.filter((_, i) => i !== index).map((r, i) => ({ ...r, position: i })));
  }

  const progress = filledProgress(rows);

  function group(g: SelectionGroup): { entry: SelectionEntry; index: number }[] {
    return rows
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => slotDef(entry.slot)?.group === g);
  }
  const custom = rows.map((entry, index) => ({ entry, index })).filter(({ entry }) => slotDef(entry.slot) === null);

  function Row({ entry, index }: { entry: SelectionEntry; index: number }) {
    const rowKey = `${entry.slot}-${index}`;
    const open = openSlot === rowKey;
    const summary = selectionSummary(entry);
    const isCustom = slotDef(entry.slot) === null;

    return (
      <div className="px-3.5 py-2.5">
        <button
          className="flex w-full items-center gap-3 text-left"
          onClick={() => setOpenSlot(open ? null : rowKey)}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              isFilled(entry) ? "bg-emerald-500" : "bg-stone-300 dark:bg-night-line"
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-stone-900 dark:text-slate-100">
              {slotLabel(entry)}
            </span>
            <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
              {summary || <span className="text-stone-400 dark:text-slate-500">Not chosen yet</span>}
            </span>
          </span>
          <span className="shrink-0 text-xs text-stone-400 dark:text-slate-500">{open ? "Close" : "Edit"}</span>
        </button>

        {open && (
          <div className="mt-3 space-y-2">
            {isCustom && (
              <input
                className="input w-full"
                placeholder="What is it? e.g. Wine fridge trim"
                value={entry.label}
                onChange={(e) => setField(index, "label", e.target.value)}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              {FIELDS.map((f, fi) => (
                <input
                  key={f.key}
                  className="input w-full"
                  placeholder={fi === 0 ? slotDef(entry.slot)?.hint || f.label : f.label}
                  value={String(entry[f.key] ?? "")}
                  onChange={(e) => setField(index, f.key, e.target.value)}
                />
              ))}
            </div>
            <textarea
              className="input w-full"
              rows={2}
              placeholder="Notes for the workshop"
              value={entry.notes}
              onChange={(e) => setField(index, "notes", e.target.value)}
            />
            {isCustom && (
              <button className="btn-ghost text-red-600" onClick={() => removeCustom(index)}>
                Remove
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card mb-3">
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
        <div>
          <p className="text-sm font-bold text-stone-900 dark:text-slate-100">Selections</p>
          <p className="text-xs text-stone-500 dark:text-slate-400">
            {loading ? "Loading…" : `${progress.done} of ${progress.total} chosen`}
          </p>
        </div>
        <SaveHint state={saveState} />
      </div>

      {(["colour", "hardware"] as SelectionGroup[]).map((g) => (
        <div key={g}>
          <p className="border-t border-stone-100 px-3.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-stone-400 dark:border-night-line dark:text-slate-500">
            {GROUP_LABELS[g]}
          </p>
          <div className="divide-y divide-stone-100 dark:divide-night-line">
            {group(g).map(({ entry, index }) => (
              <Row key={`${entry.slot}-${index}`} entry={entry} index={index} />
            ))}
          </div>
        </div>
      ))}

      {custom.length > 0 && (
        <div>
          <p className="border-t border-stone-100 px-3.5 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-stone-400 dark:border-night-line dark:text-slate-500">
            Other
          </p>
          <div className="divide-y divide-stone-100 dark:divide-night-line">
            {custom.map(({ entry, index }) => (
              <Row key={`${entry.slot}-${index}`} entry={entry} index={index} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-stone-100 px-3.5 py-2.5 dark:border-night-line">
        <button className="btn-ghost" onClick={addCustom}>
          + Add another selection
        </button>
        <Link href={`/jobs/${jobId}/selections`} className="text-xs font-semibold text-brand-600">
          Print sheet
        </Link>
      </div>
    </div>
  );
}

function SaveHint({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const text =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Saved offline — will sync";
  const tone =
    state === "offline"
      ? "text-amber-600 dark:text-amber-400"
      : state === "saved"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-stone-400 dark:text-slate-500";
  return <span className={`text-xs ${tone}`}>{text}</span>;
}

/**
 * The read-only glance: the decided rows as chips. Used on the job's client
 * card and in the clients list, where the question is "what did they pick"
 * rather than "let me change it".
 */
export function SelectionChips({ entries, max }: { entries: SelectionEntry[]; max?: number }) {
  const filled = entries.filter(isFilled);
  if (filled.length === 0) return null;
  const shown = max ? filled.slice(0, max) : filled;
  const hidden = filled.length - shown.length;

  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((entry, i) => (
        <span
          key={entry.id || `${entry.slot}-${i}`}
          className="inline-flex max-w-full items-baseline gap-1.5 rounded-lg bg-stone-100 px-2 py-1 text-xs dark:bg-night-800"
        >
          <span className="font-semibold text-stone-700 dark:text-slate-200">{slotLabel(entry)}</span>
          <span className="truncate text-stone-500 dark:text-slate-400">{selectionSummary(entry)}</span>
        </span>
      ))}
      {hidden > 0 && (
        <span className="inline-flex items-center rounded-lg px-2 py-1 text-xs text-stone-400 dark:text-slate-500">
          +{hidden} more
        </span>
      )}
    </div>
  );
}

/** The standard slot keys, for callers that want to render an empty state. */
export const SELECTION_SLOT_KEYS = SELECTION_SLOTS.map((s) => s.key);
