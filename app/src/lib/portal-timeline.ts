import { stageIndex, type PipelineStage } from "./pipeline";

// The client-facing project journey (P11.1) — a friendly grouping of the 13
// pipeline stages into milestones a homeowner understands, each with a date and
// a "what's next" line. Pure so it's unit-tested.

export type Milestone = { key: string; label: string; date: string | null; done: boolean; current: boolean };

const JOURNEY: { key: string; label: string; stage: PipelineStage }[] = [
  { key: "enquiry", label: "Enquiry received", stage: "ENQUIRY" },
  { key: "quote", label: "Quote accepted", stage: "DEPOSIT" },
  { key: "measure", label: "Measured on site", stage: "CHECK_MEASURE" },
  { key: "design", label: "Design approved", stage: "APPROVAL" },
  { key: "production", label: "In production", stage: "PRODUCTION" },
  { key: "delivery", label: "Ready for install", stage: "DELIVERY" },
  { key: "install", label: "Installation", stage: "INSTALL" },
  { key: "handover", label: "Handover & warranty", stage: "HANDOVER" },
];

const NEXT_COPY: Record<string, string> = {
  enquiry: "Thanks for your enquiry — we'll be in touch to arrange a quote.",
  quote: "Your quote is accepted. Next we'll measure up on site.",
  measure: "We've measured up and are finalising your design.",
  design: "Your design is approved — your kitchen is heading into our workshop.",
  production: "We're building your kitchen in the workshop now.",
  delivery: "Your kitchen is built and ready — we'll confirm your install dates.",
  install: "Installation is underway. Almost there!",
  handover: "All done — enjoy your new kitchen. Your warranty is in your pack below.",
};

/** The client's milestones for a job at `currentStage`, with any known dates.
 * `done` = fully passed; `current` = the phase the job is in right now. */
export function clientMilestones(currentStage: string, dates: Record<string, string | null> = {}): Milestone[] {
  const curIdx = stageIndex(currentStage as PipelineStage);
  const items = JOURNEY.map((j, i) => ({
    ...j,
    idx: stageIndex(j.stage),
    nextIdx: i + 1 < JOURNEY.length ? stageIndex(JOURNEY[i + 1].stage) : Number.POSITIVE_INFINITY,
  }));
  return items.map((j) => {
    const reached = curIdx >= j.idx;
    const current = reached && curIdx < j.nextIdx;
    return { key: j.key, label: j.label, date: dates[j.key] ?? null, done: reached && !current, current };
  });
}

/** The one-line "what's next" for a job at `currentStage`. */
export function whatsNext(currentStage: string): string {
  const milestones = clientMilestones(currentStage);
  const current = milestones.find((m) => m.current);
  if (current) return NEXT_COPY[current.key] ?? "";
  // Past the last journey stage (e.g. MAINTENANCE) → treat as complete.
  return NEXT_COPY.handover;
}
