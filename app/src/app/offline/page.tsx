import { BRAND } from "@/lib/brand";

export const metadata = { title: "Offline" };

// Public, data-free page precached by the service worker and shown as the
// navigation fallback when the device is offline (P2-C3). It must not read any
// session or client data — it may be served to a logged-out or expired session.
export default function OfflinePage() {
  return (
    <div className="fade-in flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl" aria-hidden>
        📶
      </div>
      <h1 className="mt-4 text-xl font-bold text-stone-900 dark:text-slate-100">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-stone-500 dark:text-slate-400">
        {BRAND.name} can&apos;t reach the network right now. Anything you change is saved on this device and
        will sync automatically once you&apos;re back online.
      </p>
      {/* A full page load (not next/link client nav) so "Try again" actually
          re-hits the network from this cached offline page. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-6 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white active:scale-95"
      >
        Try again
      </a>
    </div>
  );
}
