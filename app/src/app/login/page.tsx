"use client";

import { useState } from "react";
import { Brand } from "@/components/Brand";

export default function LoginPage() {
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
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Incorrect password");
      setBusy(false);
    }
  }

  return (
    <div className="fade-in flex min-h-screen flex-col items-center justify-center px-6">
      <Brand variant="hero" tagline="Sign in to your workshop dashboard" />

      <form onSubmit={submit} className="w-full max-w-sm space-y-3">
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
