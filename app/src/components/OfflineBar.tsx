"use client";

import { useCallback, useEffect, useState } from "react";
import { flushQueue, pendingPhotoCount, pendingMutationCount } from "@/lib/offline-queue";

/**
 * Registers the service worker, shows a slim status bar when the device is
 * offline or has queued work, and replays the queue when the connection
 * returns. Mounted once in the root layout.
 */
export function OfflineBar() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [justSynced, setJustSynced] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);

  const refresh = useCallback(async () => {
    const [p, m] = await Promise.all([pendingPhotoCount(), pendingMutationCount()]);
    setPending(p + m);
  }, []);

  const sync = useCallback(async () => {
    const { photos, mutations, needsAuth } = await flushQueue();
    setNeedsAuth(needsAuth);
    await refresh();
    if (photos + mutations > 0) {
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 3000);
      // Nudge open pages to reload their now-synced data.
      window.dispatchEvent(new CustomEvent("jf-offline-synced"));
    }
  }, [refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const onOnline = () => {
      setOnline(true);
      sync();
    };
    const onOffline = () => setOnline(false);
    const onQueued = () => refresh();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("jf-offline-queued", onQueued);

    // Catch anything left from a previous session.
    if (navigator.onLine) sync();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("jf-offline-queued", onQueued);
    };
  }, [refresh, sync]);

  // Session lapsed with work still queued: never silently discard it — prompt a
  // re-sign-in so the replay can finish. Takes priority over the other states.
  if (needsAuth && pending > 0) {
    return (
      <a
        href="/login"
        className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center px-4 py-1.5 text-center text-xs font-semibold bg-rose-600 text-white underline"
      >
        {pending} change{pending === 1 ? "" : "s"} couldn&apos;t sync — sign in to retry
      </a>
    );
  }

  if (online && pending === 0 && !justSynced) return null;

  const bg = !online
    ? "bg-stone-700 text-white"
    : justSynced
    ? "bg-emerald-600 text-white"
    : "bg-amber-500 text-white";
  const text = !online
    ? pending > 0
      ? `Offline — ${pending} change${pending === 1 ? "" : "s"} saved, will sync when you're back online`
      : "Offline — your changes are saved and will sync when you're back online"
    : justSynced
    ? "Synced ✓"
    : `Syncing ${pending} change${pending === 1 ? "" : "s"}…`;

  return (
    <div className={`fixed inset-x-0 top-0 z-[60] flex items-center justify-center px-4 py-1.5 text-center text-xs font-semibold ${bg}`}>
      {text}
    </div>
  );
}
