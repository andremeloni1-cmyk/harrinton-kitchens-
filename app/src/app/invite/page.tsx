"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";

type InviteInfo = { email: string; role: string };

export default function InvitePage() {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) {
      setLoadError("This invite link is missing its token.");
      setReady(true);
      return;
    }
    fetch(`/api/auth/invite?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        if (r.ok) setInfo(await r.json());
        else setLoadError((await r.json().catch(() => ({}))).error || "This invite is invalid or has expired.");
      })
      .catch(() => setLoadError("Couldn't load this invite."))
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div className="fade-in flex min-h-screen flex-col items-center justify-center px-6">
      <Brand variant="hero" tagline={info ? `Join as ${info.role.toLowerCase()}` : "Team invite"} />
      {info && token ? (
        <AcceptForm token={token} email={info.email} />
      ) : (
        <p className="w-full max-w-sm text-center text-sm text-red-600 dark:text-red-400">
          {loadError || "This invite is invalid or has expired."}
        </p>
      )}
      <p className="pt-4 text-center text-sm">
        <Link href="/login" className="text-stone-500 underline dark:text-slate-400">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

function AcceptForm({ token, email }: { token: string; email: string }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please enter your name");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setBusy(true);
    const res = await fetch("/api/auth/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, name, password }),
    });
    if (res.ok) {
      window.location.href = "/"; // accepted + auto-signed-in
    } else {
      setError((await res.json().catch(() => ({}))).error || "Could not accept the invite");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-3">
      <p className="text-center text-sm text-stone-500 dark:text-slate-400">
        Setting up <span className="font-medium text-stone-700 dark:text-slate-200">{email}</span>
      </p>
      <input
        className="input"
        placeholder="Your name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        className="input"
        type="password"
        autoComplete="new-password"
        placeholder="Choose a password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        className="input"
        type="password"
        autoComplete="new-password"
        placeholder="Confirm password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Setting up…" : "Join the team"}
      </button>
    </form>
  );
}
