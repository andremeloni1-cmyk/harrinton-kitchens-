"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  // Render into document.body so the dialog escapes the page's stacking context
  // (the `fade-in` transform on <main> would otherwise trap it below the nav).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // The page scrolls inside #app-scroll (the document itself is locked), so
    // that's the element to freeze while the dialog is open.
    const scroller = document.getElementById("app-scroll");
    if (scroller) scroller.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      if (scroller) scroller.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // z-40 sits below the bottom nav (z-50) so the nav stays visible and usable
  // while a form is open; the mobile sheet lifts above the nav via pb-[4.75rem].
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center pb-[6rem] sm:items-center sm:pb-0 lg:pb-0" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm dark:bg-black/60" onClick={onClose} />
      <div className="sheet-rise sheet-cap relative z-10 mx-4 w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-night-900 dark:ring-1 dark:ring-night-line">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 dark:text-slate-500 dark:hover:bg-night-800" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
