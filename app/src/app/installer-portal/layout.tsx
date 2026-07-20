import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { prisma } from "@/lib/db";
import { BRAND } from "@/lib/brand";

// Standalone installer-portal chrome — no admin nav (BottomNav/SideNav hide
// themselves on /installer-portal). Built for a phone in a van. The business name
// comes from CompanySettings (falls back to the platform brand).
export default async function InstallerPortalLayout({ children }: { children: React.ReactNode }) {
  const account = await prisma.account.findFirst({ select: { name: true } });
  const companyName = account?.name || BRAND.name;
  return (
    <div className="px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/installer-portal" className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-600/25">
            <BrandMark className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg font-bold leading-tight text-stone-900 dark:text-slate-100">{companyName}</p>
            <p className="text-xs text-stone-400 dark:text-slate-500">Installer portal</p>
          </div>
        </Link>
      </header>
      {children}
    </div>
  );
}
