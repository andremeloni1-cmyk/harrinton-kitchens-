"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";

type Risk = { kind: string; severity: "high" | "medium"; message: string };

// Office risk digest (P12.3). Deterministic checks; renders nothing when clear.
export function RiskCard() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ risks: Risk[] }>("/api/risk").then((d) => setRisks(d.risks)).catch(() => {}).finally(() => setReady(true));
  }, []);

  if (!ready || risks.length === 0) return null;
  const high = risks.filter((r) => r.severity === "high").length;

  return (
    <div className="card mb-4 border-l-4 border-amber-400 p-4 dark:border-amber-500/50">
      <p className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
        Risk watch · {risks.length} flag{risks.length === 1 ? "" : "s"}{high ? ` (${high} urgent)` : ""}
      </p>
      <ul className="space-y-1">
        {risks.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-stone-700 dark:text-slate-200">
            <span>{r.severity === "high" ? "🔴" : "🟠"}</span>
            <span>{r.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
