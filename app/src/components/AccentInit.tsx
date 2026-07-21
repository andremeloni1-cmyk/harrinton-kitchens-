"use client";

import { useEffect } from "react";
import { generateAccentRamp } from "@/lib/accent";

// Applies the per-company accent client-side as a fallback for pages Next serves
// from its full-route cache (the pre-auth login/reset/invite pages), where the
// server-injected accent style can't reach. On dynamic pages the server already
// set these vars, so this just re-affirms the same values. The vars persist on
// <html> across client navigations, so any flash is limited to a hard reload.
export function AccentInit() {
  useEffect(() => {
    fetch("/api/branding")
      .then((r) => r.json())
      .then((b: { accentColor?: string | null }) => {
        if (!b?.accentColor) return;
        const ramp = generateAccentRamp(b.accentColor);
        if (!ramp) return;
        const root = document.documentElement;
        for (const [step, rgb] of Object.entries(ramp)) {
          root.style.setProperty(`--brand-${step}`, rgb);
        }
      })
      .catch(() => {});
  }, []);
  return null;
}
