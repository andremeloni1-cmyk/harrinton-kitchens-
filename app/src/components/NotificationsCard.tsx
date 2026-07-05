"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "unconfigured" | "off" | "on" | "denied";

export function NotificationsCard() {
  const [state, setState] = useState<State>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  useEffect(() => {
    (async () => {
      if (!supported) return setState("unsupported");
      try {
        const cfg = await api<{ configured: boolean; publicKey: string | null }>("/api/push");
        if (!cfg.configured || !cfg.publicKey) return setState("unconfigured");
        setPublicKey(cfg.publicKey);
        if (Notification.permission === "denied") return setState("denied");
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setState(sub ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, [supported]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      await api("/api/push", { method: "POST", body: JSON.stringify(sub.toJSON()) });
      setState("on");
      setMsg("Notifications enabled on this device.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await api("/api/push", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
      setMsg("Notifications turned off on this device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4 p-4">
      <h2 className="mb-1 font-semibold text-stone-900 dark:text-slate-100">Notifications</h2>
      <p className="mb-3 text-sm text-stone-500 dark:text-slate-400">Get a push to this device when the inbox check finds new jobs to confirm or flags one for review.</p>

      {state === "loading" && <p className="text-sm text-stone-400 dark:text-slate-500">Checking…</p>}
      {state === "unsupported" && <p className="text-sm text-stone-500 dark:text-slate-400">This device/browser doesn’t support push notifications. On iPhone, add the app to your home screen first.</p>}
      {state === "unconfigured" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Push isn’t set up on the server yet. Generate a key pair with <code>npx web-push generate-vapid-keys</code> and set <code>VAPID_PUBLIC_KEY</code> / <code>VAPID_PRIVATE_KEY</code> in <code>.env</code>, then reload.
        </p>
      )}
      {state === "denied" && <p className="text-sm text-red-600 dark:text-red-400">Notifications are blocked in your browser settings for this site — allow them there, then reload.</p>}
      {state === "off" && (
        <button className="btn-primary w-full" onClick={enable} disabled={busy}>
          {busy ? "Enabling…" : "Enable notifications on this device"}
        </button>
      )}
      {state === "on" && (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm text-stone-700 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Enabled on this device
          </span>
          <button className="btn-secondary" onClick={disable} disabled={busy}>Turn off</button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-stone-600 dark:text-slate-300">{msg}</p>}
    </div>
  );
}
