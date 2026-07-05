"use client";

import { useState } from "react";

export type Suggestion = { key: string; label: string; sub?: string };

/**
 * Text input with a tap-to-pick suggestion dropdown. The parent owns the
 * suggestion list (local filtering or a debounced server lookup) — this
 * component just renders it under the field while it has focus.
 */
export function SuggestInput({
  value,
  onChange,
  onPick,
  suggestions,
  type = "text",
  placeholder,
  inputMode,
}: {
  value: string;
  onChange: (value: string) => void;
  onPick: (s: Suggestion) => void;
  suggestions: Suggestion[];
  type?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <input
        className="input"
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-stone-200 dark:bg-night-850 dark:ring-night-line">
          {suggestions.map((s) => (
            <button
              key={s.key}
              type="button"
              // Keep the input focused so blur doesn't close the list before the tap lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(s);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left transition hover:bg-stone-50 dark:hover:bg-night-800"
            >
              <span className="block truncate text-sm text-stone-800 dark:text-slate-100">{s.label}</span>
              {s.sub && <span className="block truncate text-xs text-stone-400 dark:text-slate-500">{s.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
