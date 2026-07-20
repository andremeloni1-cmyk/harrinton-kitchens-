"use client";

import { useState } from "react";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    await fetch("/api/auth/login", { method: "DELETE" }).catch(() => {});
    window.location.href = "/login";
  }
  return (
    <button
      onClick={logout}
      disabled={busy}
      className="mt-6 w-full rounded-2xl border border-stone-200 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-50 active:scale-[0.99] dark:border-night-line dark:text-slate-300 dark:hover:bg-night-800"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
