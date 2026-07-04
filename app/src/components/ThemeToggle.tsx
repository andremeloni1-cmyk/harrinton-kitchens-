"use client";

import { useEffect, useState } from "react";
import { getStoredTheme, setTheme, applyTheme, type ThemeChoice } from "@/lib/theme";

const OPTS: { k: ThemeChoice; label: string }[] = [
  { k: "light", label: "Light" },
  { k: "dark", label: "Dark" },
  { k: "system", label: "Auto" },
];

/** Light / Dark / Auto segmented control. Auto follows the device setting. */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setChoice(getStoredTheme());
    // Keep "Auto" in sync if the device flips light/dark while the app is open.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getStoredTheme() === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function pick(k: ThemeChoice) {
    setChoice(k);
    setTheme(k);
  }

  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-night-850">
      {OPTS.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => pick(o.k)}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
            choice === o.k
              ? "bg-white text-slate-900 shadow-sm dark:bg-night-900 dark:text-white"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
