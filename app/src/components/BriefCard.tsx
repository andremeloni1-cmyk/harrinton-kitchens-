"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";

// The role-aware morning brief card (P12.1). Renders the deterministic lines
// from /api/brief. Quiet (renders nothing) until loaded.
export function BriefCard() {
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    api<{ lines: string[] }>("/api/brief").then((d) => setLines(d.lines)).catch(() => setLines(null));
  }, []);

  if (!lines || lines.length === 0) return null;

  return (
    <div className="card mb-4 p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">Your brief</p>
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className={`text-sm ${l.startsWith("   ") ? "pl-3 text-stone-500 dark:text-slate-400" : "font-medium text-stone-800 dark:text-slate-100"}`}>
            {l.trim()}
          </li>
        ))}
      </ul>
    </div>
  );
}
