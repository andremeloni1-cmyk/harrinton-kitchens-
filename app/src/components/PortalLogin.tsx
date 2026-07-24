"use client";

import { useState } from "react";

// Client-portal sign-in: enter your email, get a one-time magic link. We never
// reveal whether an email is on file — the response is the same either way.
export function PortalLogin() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Only claim the link is on its way when the request actually succeeded
      // (the 200 is enumeration-safe either way); otherwise surface the failure
      // instead of a false confirmation.
      if (res.ok) setSent(true);
      else setError("Something went wrong — please try again.");
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-10">
      <h1 className="text-xl font-bold text-stone-900 dark:text-slate-100">Your project portal</h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
        Enter the email address we have on file and we&apos;ll send you a secure link to view your kitchen project.
      </p>

      {sent ? (
        <p className="mt-6 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          If that email is on file, a sign-in link is on its way. Open it on this device to view your project.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
            aria-label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || !email}>
            {busy ? "Sending…" : "Email me a link"}
          </button>
        </form>
      )}
    </div>
  );
}
