"use client";

import { useState } from "react";

export function PortalSignOut() {
  const [busy, setBusy] = useState(false);
  async function out() {
    setBusy(true);
    await fetch("/api/portal/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/portal";
  }
  return (
    <button
      onClick={out}
      disabled={busy}
      className="shrink-0 text-xs font-medium text-stone-400 underline hover:text-stone-600 dark:text-slate-500 dark:hover:text-slate-300"
    >
      {busy ? "…" : "Sign out"}
    </button>
  );
}
