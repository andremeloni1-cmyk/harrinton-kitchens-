import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { can, type Permission } from "@/lib/permissions";
import { LogoutButton } from "@/components/LogoutButton";

const links: {
  href: string;
  title: string;
  subtitle: string;
  perm?: Permission;
  icon: React.ReactNode;
}[] = [
  {
    href: "/invoices",
    title: "Money",
    subtitle: "Invoices, P&L, price list and expenses",
    perm: "edit_money",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9.5c-.5-1-1.5-1.5-3-1.5-1.8 0-3 .9-3 2.2 0 2.9 6 1.6 6 4.4 0 1.3-1.2 2.2-3 2.2-1.5 0-2.5-.5-3-1.5M12 6.5v11" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/portal",
    title: "Client portal",
    subtitle: "What your clients see — job progress, dates & reports",
    perm: "manage_jobs",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 11l9-7 9 7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 10v10h14V10" strokeLinejoin="round" />
        <path d="M10 20v-6h4v6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/installer-portal",
    title: "Installer portal",
    subtitle: "What your installers see — run sheets & maintenance reports",
    perm: "manage_jobs",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 15a8 8 0 0 1 16 0" strokeLinecap="round" />
        <path d="M10 7.5V5.8A1.8 1.8 0 0 1 11.8 4h.4A1.8 1.8 0 0 1 14 5.8v1.7" strokeLinecap="round" />
        <path d="M2.5 17.5c0-1.1.9-2 2-2h15c1.1 0 2 .9 2 2s-.9 2-2 2h-15c-1.1 0-2-.9-2-2z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/factory",
    title: "Factory",
    subtitle: "The production floor — station board & part tracking",
    perm: "factory_board",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 21V11l5 3v-3l5 3V7l6 3.5V21z" strokeLinejoin="round" />
        <path d="M3 21h18M7 21v-3M12 21v-3M17 21v-3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/field",
    title: "Field",
    subtitle: "Installer run sheets and on-site tools",
    perm: "field_app",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h10v9H3z" strokeLinejoin="round" />
        <path d="M13 9h4l4 4v2h-8z" strokeLinejoin="round" />
        <circle cx="7" cy="17.5" r="1.7" />
        <circle cx="17" cy="17.5" r="1.7" />
      </svg>
    ),
  },
  {
    href: "/hardware",
    title: "Hardware & stock",
    subtitle: "Scan QR labels to book in deliveries and build the order list",
    perm: "factory_board",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3zM18 18h3v3h-3z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/insights",
    title: "Business insights",
    subtitle: "Money in, by company, and your GST / BAS summary",
    perm: "edit_money",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18" strokeLinecap="round" />
        <path d="M7 14l3-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/team",
    title: "Team",
    subtitle: "Invite staff, set roles, and manage access",
    perm: "manage_users",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
        <path d="M16 6a3 3 0 0 1 0 6M17.5 19a5.5 5.5 0 0 0-2.7-4.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/settings",
    title: "Settings",
    subtitle: "Account, Google & Xero connections, email templates",
    perm: "manage_settings",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default async function MorePage() {
  const user = await getSessionUser();
  const visible = links.filter((l) => !l.perm || can(user, l.perm));
  return (
    <div className="px-4 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">More</h1>
      </header>
      <div className="space-y-3 stagger">
        {visible.map((l) => (
          <Link key={l.href} href={l.href} className="block">
            <div className="tap card flex items-center gap-4 p-4 transition hover:shadow-md active:scale-[0.99]">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300">
                {l.icon}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-stone-900 dark:text-slate-100">{l.title}</h3>
                <p className="truncate text-sm text-stone-500 dark:text-slate-400">{l.subtitle}</p>
              </div>
              <svg className="ml-auto h-5 w-5 shrink-0 text-stone-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
      <LogoutButton />
    </div>
  );
}
