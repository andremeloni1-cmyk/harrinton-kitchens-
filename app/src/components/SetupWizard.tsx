"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";
import { BRAND } from "@/lib/brand";

type Status = { companyName: string; accentColor: string; stationCount: number; googleConnected: boolean; xeroConnected: boolean; onboarded: boolean };
const STATIONS = ["Programming", "Cutting", "Edging", "Assembly", "Finishing", "QC", "Dispatch"];

// First-run onboarding wizard (P13.1): company + branding → stations →
// integrations (skippable) → team (skippable) → sample tour → done. A fresh
// instance becomes production-ready without touching env beyond install.
export function SetupWizard() {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [name, setName] = useState("");
  const [accent, setAccent] = useState("#0d9488");
  const [seedSample, setSeedSample] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Status>("/api/setup/status").then((s) => {
      setStatus(s);
      if (s.companyName) setName(s.companyName);
      if (s.accentColor) setAccent(s.accentColor);
    }).catch(() => {});
  }, []);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ sampleJobId: string | null }>("/api/setup/apply", {
        method: "POST",
        body: JSON.stringify({ companyName: name.trim(), accentColor: accent, seedSample }),
      });
      window.location.href = res.sampleJobId ? `/jobs/${res.sampleJobId}` : "/";
    } catch (e) {
      // Show why it failed instead of silently re-enabling the button.
      setError(e instanceof Error ? e.message : "Couldn't finish setup — please try again.");
      setBusy(false);
    }
  }

  const steps = [
    {
      title: `Welcome to ${BRAND.name}`,
      body: (
        <div className="space-y-3">
          <p className="text-sm text-stone-600 dark:text-slate-300">Let&apos;s set up your workspace. It takes about two minutes — you can change anything later in Settings.</p>
          <ul className="space-y-1 text-sm text-stone-500 dark:text-slate-400">
            <li>1. Your company &amp; brand</li>
            <li>2. Your factory stations</li>
            <li>3. Connect Google &amp; Xero (optional)</li>
            <li>4. Invite your team (optional)</li>
            <li>5. A sample job to explore</li>
          </ul>
        </div>
      ),
    },
    {
      title: "Your company",
      body: (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700 dark:text-slate-200">Company name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Harrington Kitchens" />
            <span className="mt-1 block text-xs text-stone-400 dark:text-slate-500">Shown to clients on the portal, quotes and emails.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700 dark:text-slate-200">Brand accent</span>
            <span className="flex items-center gap-2">
              <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 w-14 rounded border border-stone-200 dark:border-night-line" />
              <input className="input flex-1" value={accent} onChange={(e) => setAccent(e.target.value)} />
            </span>
          </label>
        </div>
      ),
    },
    {
      title: "Factory stations",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-stone-600 dark:text-slate-300">We&apos;ll set up the standard joinery line. Rename, reorder or set hours/day later in Settings → Factory.</p>
          <div className="flex flex-wrap gap-1.5">
            {STATIONS.map((s) => <span key={s} className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-600 dark:bg-night-800 dark:text-slate-300">{s}</span>)}
          </div>
          {status && status.stationCount > 0 && <p className="text-xs text-emerald-600 dark:text-emerald-400">You already have {status.stationCount} stations — we&apos;ll keep them.</p>}
        </div>
      ),
    },
    {
      title: "Connect your tools",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-stone-600 dark:text-slate-300">Optional — the app runs in demo mode without them, and you can connect anytime in Settings.</p>
          <div className="space-y-2">
            <a href="/api/auth/google" className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 text-sm font-medium text-stone-700 dark:bg-night-800 dark:text-slate-200">
              <span>📅 Google (calendar &amp; Drive)</span><span className="text-brand-600">{status?.googleConnected ? "Connected ✓" : "Connect →"}</span>
            </a>
            <a href="/api/auth/xero" className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 text-sm font-medium text-stone-700 dark:bg-night-800 dark:text-slate-200">
              <span>💷 Xero (invoicing)</span><span className="text-brand-600">{status?.xeroConnected ? "Connected ✓" : "Connect →"}</span>
            </a>
          </div>
        </div>
      ),
    },
    {
      title: "Invite your team",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-stone-600 dark:text-slate-300">Add office, designers, factory and installers with the right access. You can do this now or later.</p>
          <a href="/team" className="inline-flex items-center gap-1 rounded-xl bg-stone-50 px-3 py-2.5 text-sm font-medium text-brand-700 dark:bg-night-800 dark:text-brand-300">Open team settings →</a>
        </div>
      ),
    },
    {
      title: "Ready to go",
      body: (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-slate-200">
            <input type="checkbox" checked={seedSample} onChange={(e) => setSeedSample(e.target.checked)} />
            Create a sample job to explore the workflow
          </label>
          <p className="text-xs text-stone-400 dark:text-slate-500">You&apos;re all set. Finishing takes you into your workspace.</p>
        </div>
      ),
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-4 flex items-center gap-1.5">
        {steps.map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand-500" : "bg-stone-200 dark:bg-night-800"}`} />)}
      </div>
      <div className="card p-5">
        <h1 className="mb-3 text-xl font-bold text-stone-900 dark:text-slate-100">{current.title}</h1>
        {current.body}
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-5 flex items-center justify-between">
          <button className="btn-ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</button>
          {last ? (
            <button className="btn-accent" disabled={busy} onClick={finish}>{busy ? "Finishing…" : "Finish setup"}</button>
          ) : (
            <button className="btn-primary" onClick={() => setStep((s) => s + 1)}>Continue</button>
          )}
        </div>
      </div>
    </div>
  );
}
