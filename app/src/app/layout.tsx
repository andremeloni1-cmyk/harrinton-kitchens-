import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav, SideNav } from "@/components/BottomNav";
import { ScrollReset } from "@/components/ScrollReset";
import { OfflineBar } from "@/components/OfflineBar";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND.name} — Job Scheduler`,
  description: "Schedule kitchen installations, manage installers and keep clients updated, with Google Calendar, Drive and Gmail automations.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: BRAND.name },
};

export const viewport: Viewport = {
  // Match the page background so the browser chrome blends in instead of
  // showing a solid orange band; applyTheme() keeps it in sync with the
  // in-app theme toggle.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ededed" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
  width: "device-width",
  initialScale: 1,
  // Stops iOS Safari's input-focus auto-zoom (which un-anchors the fixed
  // bottom dock while zoomed). Safari still allows deliberate pinch-zoom —
  // it ignores the cap for user gestures — so accessibility is preserved.
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before paint to avoid a light flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Loaded in the browser (root layout = every page), so the single-page-font rule doesn't apply. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Desktop-only left sidebar; bottom bar takes over below lg. */}
        <SideNav />
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
        <BottomNav />
      </body>
    </html>
  );
}
