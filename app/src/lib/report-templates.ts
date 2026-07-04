// Pre-built completion checklists per job type. Pure data — usable on client
// and server. Applying a template adds a room with these items (all unticked).
import type { RoomEntry } from "@/lib/pdf";

export type TemplateKey = "kitchen" | "bathroom" | "laundry" | "wardrobe";

export const REPORT_TEMPLATES: { key: TemplateKey; label: string; room: string; items: string[] }[] = [
  {
    key: "kitchen",
    label: "Kitchen",
    room: "Kitchen",
    items: [
      "Cabinets installed & secured",
      "Benchtop fitted",
      "Splashback installed",
      "Sink & tapware connected",
      "Appliances fitted & tested",
      "Doors & drawers aligned",
      "Handles fitted",
      "Silicone & sealing complete",
      "Site cleaned & rubbish removed",
    ],
  },
  {
    key: "bathroom",
    label: "Bathroom / vanity",
    room: "Bathroom",
    items: [
      "Vanity installed & secured",
      "Mirror / shaving cabinet fitted",
      "Tapware connected",
      "Waste connected",
      "Doors & drawers aligned",
      "Silicone & sealing complete",
      "Site cleaned & rubbish removed",
    ],
  },
  {
    key: "laundry",
    label: "Laundry",
    room: "Laundry",
    items: [
      "Cabinets installed & secured",
      "Benchtop fitted",
      "Tub & tapware connected",
      "Shelving installed",
      "Doors & drawers aligned",
      "Silicone & sealing complete",
      "Site cleaned & rubbish removed",
    ],
  },
  {
    key: "wardrobe",
    label: "Wardrobes / robes",
    room: "Wardrobe",
    items: [
      "Frames installed & secured",
      "Shelving installed",
      "Hanging rails fitted",
      "Drawers fitted & running",
      "Doors / tracks adjusted",
      "Mirrors fitted",
      "Site cleaned & rubbish removed",
    ],
  },
];

// Standard follow-up / return-trip maintenance checklist — the things to check
// on a call-back visit after an install has settled in. Reused by the job's
// "Return-trip maintenance" list seed button.
export const RETURN_TRIP_MAINTENANCE: string[] = [
  "Re-check & adjust door alignment",
  "Re-check & adjust drawer runners",
  "Tighten handles & hinges",
  "Inspect & top up silicone / sealing",
  "Check benchtop joins & fixings",
  "Check for movement or settling",
  "Touch up any marks or chips",
  "Confirm appliances still operating",
  "Clean & final tidy",
  "Confirm client satisfaction",
];

/** Builds a fresh room (all items unticked) from a template key. */
export function roomFromTemplate(key: TemplateKey): RoomEntry {
  const t = REPORT_TEMPLATES.find((x) => x.key === key);
  if (!t) return { name: "", items: [] };
  return { name: t.room, items: t.items.map((label) => ({ label, done: false })) };
}
