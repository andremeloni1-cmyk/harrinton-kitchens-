import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// White-label the installed app name via APP_NAME in .env (see src/lib/brand.ts).
export default function manifest(): MetadataRoute.Manifest {
  const name = BRAND.name;
  return {
    name: `${name} — Job Scheduler`,
    short_name: name,
    description: "Schedule kitchen installations, manage installers and keep clients updated, with Google Calendar, Drive and Gmail automations.",
    start_url: "/",
    display: "standalone",
    background_color: "#121009",
    theme_color: "#f2ede2",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
