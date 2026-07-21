"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { api } from "@/lib/job";
import { BRAND } from "@/lib/brand";
import type { Role } from "@/lib/roles";
import { navKeysFor } from "@/lib/nav";

/** The company display name (CompanySettings.name), falling back to the platform
 * brand. Shared by the desktop side-nav wordmark and kept in step with the header. */
function useCompanyName(): string {
  const [name, setName] = useState<string>(BRAND.name);
  useEffect(() => {
    api<{ name: string | null }>("/api/branding")
      .then((b) => b?.name && setName(b.name))
      .catch(() => {});
  }, []);
  return name;
}

type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  match?: string[]; // widens the active state to sibling routes reached from the tab
};

// Every possible nav item, keyed. Which appear (and their order) is decided per
// role by src/lib/nav.ts — the four surfaces each get their own set.
const ALL_ITEMS: Record<string, NavItem> = {
  jobs: { href: "/", label: "Jobs", icon: ClipboardIcon },
  factory: { href: "/factory", label: "Factory", icon: FactoryIcon, match: ["/factory"] },
  field: { href: "/field", label: "Field", icon: FieldIcon, match: ["/field"] },
  calendar: { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  installers: { href: "/installers", label: "Installers", icon: HardHatIcon },
  clients: { href: "/clients", label: "Clients", icon: UsersIcon },
  reports: { href: "/reports", label: "Reports", icon: ReportIcon },
  more: { href: "/more", label: "More", icon: DotsIcon, match: ["/more", "/settings", "/insights", "/invoices", "/pnl", "/prices", "/expenses", "/hardware", "/team"] },
};

function itemsForRole(role: Role | null): NavItem[] {
  return navKeysFor(role)
    .map((k) => ALL_ITEMS[k])
    .filter(Boolean);
}

// The client & installer portals are standalone (their own chrome) — no admin nav.
function isPortal(pathname: string): boolean {
  return pathname.startsWith("/portal") || pathname.startsWith("/installer-portal");
}

// Public / auth pages that render without the app nav chrome.
function chromeless(pathname: string): boolean {
  return pathname === "/login" || pathname === "/enquire" || isPortal(pathname);
}

function isActive(pathname: string, item: NavItem): boolean {
  return item.match
    ? item.match.some((m) => pathname.startsWith(m))
    : item.href === "/"
      ? pathname === "/"
      : pathname.startsWith(item.href);
}

/** Mobile/tablet bottom tab bar — an iOS-style floating pill dock, inset from
 * the screen edges. Hidden on desktop (lg+), where SideNav takes over. */
export function BottomNav({ role }: { role: Role | null }) {
  const pathname = usePathname();
  if (chromeless(pathname)) return null;

  const navItems = itemsForRole(role);
  return (
    <nav className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-md lg:hidden">
      <div
        className="glass grid rounded-[2rem] px-1 py-1.5"
        style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
      >
        {navItems.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium transition ${
                active ? "text-brand-600 dark:text-brand-400" : "text-stone-400 dark:text-slate-500"
              }`}
            >
              <span
                className={`flex h-8 w-12 items-center justify-center rounded-full transition ${
                  active ? "bg-brand-100 dark:bg-brand-500/20" : ""
                }`}
              >
                <Icon className="h-6 w-6" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Desktop vertical sidebar. Shown only on lg+ (BottomNav is hidden there). */
export function SideNav({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const companyName = useCompanyName();
  if (chromeless(pathname)) return null;

  const navItems = itemsForRole(role);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-stone-200 bg-white/70 px-4 py-6 backdrop-blur-xl dark:border-night-line dark:bg-night-900/70 lg:flex">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-600/25">
          <BrandMark className="h-5 w-5" />
        </div>
        <span className="font-display text-lg font-bold text-stone-900 dark:text-slate-100">{companyName}</span>
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  : "text-stone-500 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-night-800"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9z" />
      <path d="M9 11h6M9 15h4" strokeLinecap="round" />
    </svg>
  );
}
function FactoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 21V11l5 3v-3l5 3V7l6 3.5V21z" strokeLinejoin="round" />
      <path d="M3 21h18" strokeLinecap="round" />
      <path d="M7 21v-3M12 21v-3M17 21v-3" strokeLinecap="round" />
    </svg>
  );
}
function FieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h10v9H3z" strokeLinejoin="round" />
      <path d="M13 9h4l4 4v2h-8z" strokeLinejoin="round" />
      <circle cx="7" cy="17.5" r="1.7" />
      <circle cx="17" cy="17.5" r="1.7" />
      <path d="M9 15.5h6" strokeLinecap="round" />
    </svg>
  );
}
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" strokeLinecap="round" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 20c0-2.3-1-4-2.5-5" strokeLinecap="round" />
    </svg>
  );
}
function HardHatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 15a8 8 0 0 1 16 0" strokeLinecap="round" />
      <path d="M10 7.5V5.8A1.8 1.8 0 0 1 11.8 4h.4A1.8 1.8 0 0 1 14 5.8v1.7" strokeLinecap="round" />
      <path d="M2.5 17.5c0-1.1.9-2 2-2h15c1.1 0 2 .9 2 2s-.9 2-2 2h-15c-1.1 0-2-.9-2-2z" strokeLinejoin="round" />
    </svg>
  );
}
function ReportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
      <path d="M14 3v5h5M9 13h6M9 17h6" strokeLinecap="round" />
    </svg>
  );
}
function DotsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <rect x="2.5" y="4.5" width="19" height="15" rx="3.5" />
    </svg>
  );
}
