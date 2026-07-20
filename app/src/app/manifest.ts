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
    background_color: "#0d0d0d",
    theme_color: "#ededed",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
