"use client";

import { useState } from "react";
import { DictateButton } from "@/components/DictateButton";
import type { ChecklistItem } from "@/lib/pdf";

/**
 * A tickable checklist with a progress bar, inline add, and remove. Controlled:
 * the parent owns the items array and persists on change. An optional action
 * button (e.g. "Generate with AI" / "Add standard items") sits in the header.
 */
export function Checklist({
  items,
  onChange,
  emptyHint,
  action,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  emptyHint?: string;
  action?: { label: string; onClick: () => void; busy?: boolean; disabled?: boolean };
}) {
  const [draft, setDraft] = useState("");

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const toggle = (idx: number) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)));
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = () => {
    const label = draft.trim();
    if (!label) return;
    onChange([...items, { label, done: false }]);
    setDraft("");
  };

  return (
    <div className="space-y-3">
      {/* Progress bar + action */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold text-stone-600 dark:text-slate-300">
              {total ? `${done}/${total} done` : "Nothing yet"}
            </span>
            {total > 0 && <span className="text-stone-400 dark:text-slate-500">{pct}%</span>}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-night-800">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {action && (
          <button
            onClick={action.onClick}
            disabled={action.busy || action.disabled}
            className="btn-secondary shrink-0 whitespace-nowrap px-3 py-1.5 text-xs"
          >
            {action.busy ? "Working…" : action.label}
          </button>
        )}
      </div>

      {/* Items */}
      {total === 0 ? (
        <p className="text-sm text-stone-400 dark:text-slate-500">{emptyHint || "No items yet."}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, idx) => (
            <li key={idx} className="group flex items-center gap-2.5">
              <button
                onClick={() => toggle(idx)}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition ${
                  it.done
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-transparent text-transparent ring-stone-300 hover:ring-brand-400 dark:ring-night-line"
                }`}
                aria-label={it.done ? "Mark not done" : "Mark done"}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span
                className={`min-w-0 flex-1 text-sm ${
                  it.done
                    ? "text-stone-400 line-through dark:text-slate-500"
                    : "text-stone-700 dark:text-slate-200"
                }`}
              >
                {it.label}
              </span>
              <button
                onClick={() => remove(idx)}
                className="shrink-0 rounded-full p-1 text-stone-300 opacity-100 transition hover:bg-stone-100 hover:text-stone-500 lg:opacity-0 lg:group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-night-800"
                aria-label="Remove item"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add row */}
      <div className="flex items-center gap-2">
        <input
          className="input flex-1"
          placeholder="Add an item…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <DictateButton onText={(t) => setDraft((d) => (d ? `${d} ${t}` : t))} />
        <button onClick={add} disabled={!draft.trim()} className="btn-secondary shrink-0 px-4 py-2 text-sm">
          Add
        </button>
      </div>
    </div>
  );
}
