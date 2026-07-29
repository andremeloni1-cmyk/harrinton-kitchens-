"use client";

import { useState } from "react";
import { DesignQueue } from "@/components/DesignQueue";
import { CheckMeasureRegister } from "@/components/CheckMeasureRegister";

type View = "queue" | "measures";

/**
 * The design screen's two halves.
 *
 * The queue answers "what is stopping this job", which is a question about
 * today. The register answers "what did we measure, and where exactly was the
 * power point", which is a question asked at any point afterwards — during
 * manufacture, on site, or a year later. They are the same work seen from
 * opposite ends, so they live behind one control rather than in two places.
 */
export function DesignTabs() {
  const [view, setView] = useState<View>("queue");

  return (
    <div className="px-4 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Design</h1>
        <p className="text-sm text-stone-500 dark:text-slate-400">
          {view === "queue"
            ? "Check measure, mudmap, plan, then the client's sign-off."
            : "Every measure taken, by reference — dimensions, services and site photos."}
        </p>
      </header>

      <div
        className="mb-4 flex gap-1 rounded-xl bg-stone-100 p-1 dark:bg-night-800"
        role="tablist"
        aria-label="Design views"
      >
        <TabButton current={view} value="queue" label="Queue" onSelect={setView} />
        <TabButton current={view} value="measures" label="Check measures" onSelect={setView} />
      </div>

      {view === "queue" ? <DesignQueue embedded /> : <CheckMeasureRegister />}
    </div>
  );
}

function TabButton({
  current,
  value,
  label,
  onSelect,
}: {
  current: View;
  value: View;
  label: string;
  onSelect: (v: View) => void;
}) {
  const active = current === value;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(value)}
      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-white text-stone-900 shadow-sm dark:bg-night-850 dark:text-slate-100"
          : "text-stone-500 dark:text-slate-400"
      }`}
    >
      {label}
    </button>
  );
}
