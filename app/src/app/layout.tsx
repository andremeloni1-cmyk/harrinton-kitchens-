import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { BottomNav, SideNav } from "@/components/BottomNav";
import { ScrollReset } from "@/components/ScrollReset";
import { OfflineBar } from "@/components/OfflineBar";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { BRAND } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { getAccentVarsCss } from "@/lib/accent";
import { AccentInit } from "@/components/AccentInit";
import { getSessionUser } from "@/lib/session";

// Render every page per-request so the per-company accent (and other runtime
// settings) always reflect the current CompanySettings — a static prerender
// would freeze the accent at build time. Fine for a single-instance app.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${BRAND.name} — Job Scheduler`,
  description: "Schedule kitchen installations, manage installers and keep clients updated, with Google Calendar, Drive and Gmail automations.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: BRAND.name },
  // Raster icons in addition to the SVG, so iOS home-screen installs get a real
  // 180px apple-touch-icon and Android has PNG fallbacks (P3-15).
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  // Match the page background so the browser chrome blends in instead of
  // showing a solid orange band; applyTheme() keeps it in sync with the
  // in-app theme toggle.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2ede2" },
    { media: "(prefers-color-scheme: dark)", color: "#121009" },
  ],
  width: "device-width",
  initialScale: 1,
  // Stops iOS Safari's input-focus auto-zoom (which un-anchors the fixed
  // bottom dock while zoomed). Safari still allows deliberate pinch-zoom —
  // it ignores the cap for user gestures — so accessibility is preserved.
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-company accent: override the default brass ramp at runtime from one hex.
  const settings = await prisma.companySettings.findFirst({ select: { accentColor: true } }).catch(() => null);
  const accentCss = settings?.accentColor ? getAccentVarsCss(settings.accentColor) : null;
  // Role drives the four-surface nav (office / factory / field); null when signed out.
  const role = (await getSessionUser().catch(() => null))?.role ?? null;
  // CSP nonce set by the proxy — stamp it on our one inline script (P3-14).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before paint to avoid a light flash.
            suppressHydrationWarning is for the nonce, not the script body: once
            the parser has used it the browser hides the attribute (so a script
            can't read it back and mint its own inline tag), leaving the client
            with "" where the server sent a value. React reads that as a mismatch
            on every page. The nonce is doing its job precisely because it has
            disappeared, so the warning is the one thing here that is noise. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Per-company accent override (falls back to the default brass in globals.css). */}
        {accentCss && <style dangerouslySetInnerHTML={{ __html: accentCss }} />}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Loaded in the browser (root layout = every page), so the single-page-font rule doesn't apply. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Desktop-only left sidebar; bottom bar takes over below lg. */}
        <SideNav role={role} />
        {/* The scroll container — the document itself never scrolls (see
            .app-scroll in globals.css), which keeps the fixed dock rock-steady
            on iOS while Safari's toolbars stay expanded. */}
        <div id="app-scroll" className="app-scroll lg:pl-60">
          <div className="mx-auto flex min-h-full max-w-2xl flex-col md:max-w-3xl lg:max-w-5xl xl:max-w-6xl">
            <main className="fade-in flex-1 pb-28 lg:pb-10">{children}</main>
          </div>
        </div>
        <ScrollReset />
        <OfflineBar />
        <AccentInit />
        <BottomNav role={role} />
      </body>
    </html>
  );
}
