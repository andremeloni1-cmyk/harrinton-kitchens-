import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

// Standalone client-portal chrome — no admin nav (BottomNav/SideNav hide
// themselves on /portal). Clean, client-facing branding only.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/portal" className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-600/25">
            <BrandMark className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg font-bold leading-tight text-stone-900 dark:text-slate-100">Harrington Kitchens</p>
            <p className="text-xs text-stone-400 dark:text-slate-500">Client portal</p>
          </div>
        </Link>
      </header>
      {children}
      <footer className="mt-10 border-t border-stone-200 pt-5 text-center text-xs text-stone-400 dark:border-night-line dark:text-slate-500">
        <p>Harrington Kitchens · (02) 4655 0000 · hello@harringtonkitchens.com.au</p>
        <p className="mt-1">Questions about your project? Reply to any of our emails or call the office.</p>
      </footer>
    </div>
  );
}
