// Site-visit types, shared by the booking route and the booking UI so a
// consultation and a check measure run through one code path.
import type { LinearStage } from "./pipeline";

export type VisitType = "CONSULT" | "CHECK_MEASURE" | "INSTALL";

export const VISIT_TYPES: VisitType[] = ["CONSULT", "CHECK_MEASURE", "INSTALL"];

export function isVisitType(s: string): s is VisitType {
  return s === "CONSULT" || s === "CHECK_MEASURE" || s === "INSTALL";
}

export const VISIT_META: Record<
  VisitType,
  {
    label: string; // UI heading
    // The pipeline stage a job reaches when this visit is booked (only ever
    // advances forward — booking never moves a job backwards).
    stage: LinearStage;
    summary: (jobTitle: string) => string; // calendar event title
    defaultMins: number;
  }
> = {
  CONSULT: {
    label: "Consultation",
    stage: "CONSULT",
    summary: (t) => `Consultation — ${t}`,
    defaultMins: 60,
  },
  CHECK_MEASURE: {
    label: "Check measure",
    stage: "CHECK_MEASURE",
    summary: (t) => `Check measure — ${t}`,
    defaultMins: 90,
  },
  INSTALL: {
    label: "Installation",
    stage: "INSTALL",
    summary: (t) => `Installation — ${t}`,
    defaultMins: 510, // a full working day; multi-day installs span durationDays
  },
};
