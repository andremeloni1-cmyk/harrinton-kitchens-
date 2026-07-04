"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/job";
import { BrandMark } from "@/components/BrandMark";

type Branding = {
  name: string | null;
  logo: string | null;
  logoMime: string | null;
  logoDark?: string | null;
  logoDarkMime?: string | null;
};

/** Shows the Harrington Kitchens brand lockup (mitre mark + wordmark). If the owner has
 * uploaded a custom logo image, that replaces the mark + wordmark. */
export function Brand({
  variant = "header",
  fallback = "Harrington Kitchens",
  tagline,
}: {
  variant?: "header" | "hero";
  fallback?: string;
  tagline?: string;
}) {
  const [b, setB] = useState<Branding | null>(null);
  useEffect(() => {
    api<Branding>("/api/branding").then(setB).catch(() => {});
  }, []);

  // In-app chrome shows the product brand; a custom uploaded logo (image) wins.
  const name = fallback;
  const logoSrc = b?.logo ? `data:${b.logoMime || "image/png"};base64,${b.logo}` : null;
  const darkSrc = b?.logoDark ? `data:${b.logoDarkMime || "image/png"};base64,${b.logoDark}` : null;

  // Theme-aware logo: the dark-mode variant swaps in via CSS (dark: classes)
  // so it tracks the app's theme toggle, falling back to the light logo.
  const logoImg = (className: string) =>
    logoSrc || darkSrc ? (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc || darkSrc!} alt={name} className={`${className} ${darkSrc ? "dark:hidden" : ""}`} />
        {darkSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={darkSrc} alt={name} className={`${className} hidden dark:block`} />
        )}
      </>
    ) : null;

  const hasImg = Boolean(logoSrc || darkSrc);

  if (variant === "hero") {
    return (
      <div className="flex flex-col items-center text-center">
        {hasImg ? (
          <div className="mb-4">{logoImg("max-h-20 max-w-[220px] object-contain")}</div>
        ) : (
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-600/25">
            <BrandMark className="h-8 w-8" />
          </div>
        )}
        <h1 className="text-2xl font-bold text-stone-900 dark:text-slate-100">{name}</h1>
        {tagline && <p className="mb-6 text-sm text-stone-500 dark:text-slate-400">{tagline}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {hasImg ? (
        logoImg("h-9 max-w-[110px] object-contain")
      ) : (
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-600/25">
          <BrandMark className="h-[22px] w-[22px]" />
        </div>
      )}
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-stone-900 dark:text-slate-100">{name}</h1>
        {tagline && <p className="text-sm text-stone-500 dark:text-slate-400">{tagline}</p>}
      </div>
    </div>
  );
}
