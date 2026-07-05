"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/invoices", label: "Invoices" },
  { href: "/pnl", label: "P&L" },
  { href: "/prices", label: "Price list" },
  { href: "/expenses", label: "Receipts" },
];

/** Segmented switcher between the Money views (invoices / P&L / price list /
 * receipts). Scrolls horizontally on narrow phones so all tabs stay reachable. */
export function MoneyTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              active ? "bg-brand-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 dark:bg-night-850 dark:text-slate-300 dark:ring-night-line"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
