"use client";

import { useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const d = await res.json().catch(() => ({}));
      window.location.href = d.home || "/"; // land on the role's home surface
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Incorrect email or password");
      setBusy(false);
    }
  }

  return (
    <div className="fade-in flex min-h-screen flex-col items-center justify-center px-6">
      <Brand variant="hero" tagline="Sign in to your workshop dashboard" />

      <form onSubmit={submit} className="w-full max-w-sm space-y-3">
        <input
          className="input"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="pt-1 text-center text-sm">
          <Link href="/reset" className="text-stone-500 underline dark:text-slate-400">
            Forgot your password?
          </Link>
        </p>
      </form>
    </div>
  );
}
