"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function ResetPage() {
  // Read the token client-side (avoids the useSearchParams prerender boundary).
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div className="fade-in flex min-h-screen flex-col items-center justify-center px-6">
      <Brand variant="hero" tagline={token ? "Choose a new password" : "Reset your password"} />
      {token ? <SetPassword token={token} /> : <RequestLink />}
      <p className="pt-4 text-center text-sm">
        <Link href="/login" className="text-stone-500 underline dark:text-slate-400">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

function RequestLink() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/auth/reset/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setDone(true);
    setBusy(false);
  }

  if (done) {
    return (
      <p className="w-full max-w-sm text-center text-sm text-stone-600 dark:text-slate-300">
        If that email is registered, a reset link is on its way. Check your inbox.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-3">
      <input
        className="input"
        type="email"
        inputMode="email"
        autoComplete="username"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus
      />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

function SetPassword({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setBusy(true);
    const res = await fetch("/api/auth/reset/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    if (res.ok) {
      setDone(true);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not reset your password");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="w-full max-w-sm space-y-3 text-center">
        <p className="text-sm text-stone-600 dark:text-slate-300">
          Your password has been updated. You can now sign in.
        </p>
        <Link href="/login" className="btn-primary block w-full">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-3">
      <input
        className="input"
        type="password"
        autoComplete="new-password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
      />
      <input
        className="input"
        type="password"
        autoComplete="new-password"
        placeholder="Confirm new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
