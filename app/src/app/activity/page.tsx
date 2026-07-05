"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/job";
import { relativeTime } from "@/lib/format";

type Activity = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  job?: { id: string; title: string; reference: string } | null;
};

const ICON: Record<string, string> = {
  scan: "📨",
  calendar: "🗓",
  drive: "📎",
  email: "✉️",
  report: "📄",
  status_change: "🔄",
  lead: "🆕",
  note: "📝",
};

function dayLabel(d: Date): string {
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
}

export default function ActivityPage() {
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { activities } = await api<{ activities: Activity[] }>("/api/activity");
        setItems(activities);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Group by calendar day for readable headers.
  const groups = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of items) {
      const key = dayLabel(new Date(a.createdAt));
      const arr = map.get(key) || [];
      arr.push(a);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <div className="px-4 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">Activity</h1>
        <p className="text-sm text-stone-500 dark:text-slate-400">What the app did automatically — scans, calendar, emails, files.</p>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 skeleton rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-stone-400 dark:text-slate-500">Nothing logged yet.</div>
      ) : (
        <div className="space-y-5">
          {groups.map(([label, acts]) => (
            <div key={label}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400 dark:text-slate-500">{label}</h2>
              <div className="card divide-y divide-stone-100 dark:divide-night-line">
                {acts.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 px-3.5 py-2.5">
                    <span className="mt-0.5 text-base">{ICON[a.type] || "•"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-stone-800 dark:text-slate-100">{a.message}</p>
                      <p className="mt-0.5 text-xs text-stone-400 dark:text-slate-500">
                        {a.job ? (
                          <Link href={`/jobs/${a.job.id}`} className="font-medium text-brand-600">
                            {a.job.title}
                          </Link>
                        ) : (
                          "System"
                        )}{" "}
                        · {relativeTime(a.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
