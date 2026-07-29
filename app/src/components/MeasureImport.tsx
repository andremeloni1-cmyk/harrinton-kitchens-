"use client";

import { useMemo, useState } from "react";
import { importMeasurements, importSummary, type ImportResult } from "@/lib/measure-import";
import { roomSummary, type Room } from "@/lib/measure";

const EXAMPLE = `Kitchen
ceiling 2400
wall A 3600
wall B 2450
window 1200 @ wall A 800
power double GPO x2 @ wall A 2400 h1100
water sink mixer @ wall B 900
waste sink @ wall B 900`;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `room-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

/**
 * Paste dimensions in, review what was read, add them.
 *
 * The review step is not a formality — it is the safety model. The parser
 * guesses (that a decimal means metres, that "A" means Wall A, that a trailing
 * number is the measurement), and every guess is shown as a room summary before
 * anything is committed. Nothing is written until the person who was on site
 * presses the button.
 */
export function MeasureImport({
  defaultRoom,
  busy,
  onImport,
  onCancel,
}: {
  /** Room name for measurements pasted with no heading above them. */
  defaultRoom?: string;
  busy?: boolean;
  /** Called with fresh rooms to append. Ids are already unique. */
  onImport: (rooms: Room[]) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);

  const result: ImportResult = useMemo(
    () => importMeasurements(text, { defaultRoom, idFor: () => newId() }),
    [text, defaultRoom]
  );

  const ready = result.rooms.length > 0;

  return (
    <div className="card border-l-4 border-brand-400 p-4">
      <p className="text-sm font-bold text-stone-900 dark:text-slate-100">Import dimensions</p>
      <p className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
        Paste a column out of a spreadsheet, a text message from site, or the notes off your phone. One measurement per
        line, or a CSV with a header row.
      </p>

      <textarea
        className="input mt-3 min-h-[160px] resize-y font-mono text-[13px] leading-relaxed"
        value={text}
        placeholder={EXAMPLE}
        aria-label="Dimensions to import"
        onChange={(e) => {
          setText(e.target.value);
          setTouched(true);
        }}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          className="btn-ghost text-xs text-stone-500 dark:text-slate-400"
          onClick={() => {
            setText(EXAMPLE);
            setTouched(true);
          }}
        >
          Show me the format
        </button>
        {touched && text.trim() && (
          <span className="text-xs text-stone-400 dark:text-slate-500">
            Read as {result.format === "delimited" ? "a spreadsheet" : "a site sheet"}
          </span>
        )}
      </div>

      {touched && text.trim() && (
        <div className="mt-3 rounded-xl bg-stone-50 p-3 dark:bg-night-850">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">
            {importSummary(result)}
          </p>
          {ready && (
            <ul className="mt-1.5 space-y-0.5 text-sm text-stone-600 dark:text-slate-300">
              {result.rooms.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">{r.name}</span> — {roomSummary(r)}
                </li>
              ))}
            </ul>
          )}
          {result.warnings.length > 0 && (
            <div className="mt-2 border-t border-stone-200 pt-2 dark:border-night-line">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {result.warnings.length} line{result.warnings.length === 1 ? "" : "s"} couldn&apos;t be read — fix them
                above or add them by hand after:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-stone-500 dark:text-slate-400">
                {result.warnings.slice(0, 8).map((w) => (
                  <li key={w.line}>
                    <span className="tabular-nums">Line {w.line}</span>: &ldquo;{w.text}&rdquo; — {w.reason}
                  </li>
                ))}
                {result.warnings.length > 8 && <li>…and {result.warnings.length - 8} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button className="btn-accent flex-1" disabled={!ready || busy} onClick={() => onImport(result.rooms)}>
          {busy
            ? "Adding…"
            : ready
              ? `Add ${result.rooms.length} room${result.rooms.length === 1 ? "" : "s"}`
              : "Add rooms"}
        </button>
        {onCancel && (
          <button className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
