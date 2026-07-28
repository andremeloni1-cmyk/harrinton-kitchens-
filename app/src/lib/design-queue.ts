// The designer's worklist: which jobs are sitting in pre-production, and what
// each one is actually waiting on.
//
// A job between deposit and production passes through the same five steps —
// measure the site, get the mudmap in, draw a plan off it, produce the design,
// get the client to approve it. The office's question is never "what stage is
// this at" (the pipeline already says that) but "what is stopping it", so the
// queue is expressed as steps with a state and one next action.
//
// Pure: the API assembles the counts, this decides what they mean.

import type { PipelineStage } from "./pipeline";

/** The stages that belong to the designer — the pipeline's pre-production group. */
export const DESIGN_STAGES: PipelineStage[] = ["CHECK_MEASURE", "DESIGN", "APPROVAL"];

export function isDesignStage(stage: string): boolean {
  return (DESIGN_STAGES as string[]).includes(stage);
}

export type DesignJob = {
  id: string;
  reference: string;
  title: string;
  clientName: string | null;
  address: string | null;
  stage: PipelineStage;
  /** Rooms captured on the check measure, and how many hold a real dimension. */
  rooms: number;
  roomsCaptured: number;
  measureStatus: "none" | "draft" | "complete";
  /** Photographed sketches uploaded against the job. */
  mudmaps: number;
  /** Plans generated from the check measure. */
  plans: number;
  /** The latest drawing revision, when there is one. */
  drawing: { label: string; status: string } | null;
};

export type DesignStepKey = "measure" | "mudmap" | "plan" | "drawing" | "approval";
export type StepState = "done" | "todo";

export type DesignStep = {
  key: DesignStepKey;
  label: string;
  state: StepState;
  detail: string;
};

/**
 * The five steps for a job, each either done or outstanding, with a line of
 * detail. Order is the order they happen in.
 */
export function designSteps(job: DesignJob): DesignStep[] {
  const measureDone = job.measureStatus === "complete";
  const planDone = job.plans > 0;
  const drawingSent = job.drawing != null && job.drawing.status !== "draft";
  const approved = job.drawing != null && ["approved", "released"].includes(job.drawing.status);

  return [
    {
      key: "measure",
      label: "Check measure",
      state: measureDone ? "done" : "todo",
      detail: measureDoneDetail(job),
    },
    {
      key: "mudmap",
      label: "Mudmap",
      state: job.mudmaps > 0 ? "done" : "todo",
      detail: job.mudmaps > 0 ? `${job.mudmaps} uploaded` : "None uploaded",
    },
    {
      key: "plan",
      label: "Plan drawn",
      state: planDone ? "done" : "todo",
      detail: planDone
        ? `${job.plans} plan${job.plans === 1 ? "" : "s"}`
        : job.roomsCaptured > 0
          ? "Ready to draw"
          : "Needs measurements",
    },
    {
      key: "drawing",
      label: "Design sent",
      state: drawingSent ? "done" : "todo",
      detail: job.drawing ? `${job.drawing.label} · ${job.drawing.status}` : "No revision yet",
    },
    {
      key: "approval",
      label: "Client approved",
      state: approved ? "done" : "todo",
      detail: approved ? "Approved" : drawingSent ? "Waiting on the client" : "Not sent yet",
    },
  ];
}

function measureDoneDetail(job: DesignJob): string {
  if (job.measureStatus === "complete") return `${job.rooms} room${job.rooms === 1 ? "" : "s"} · complete`;
  if (job.rooms === 0) return "Not started";
  return `${job.roomsCaptured} of ${job.rooms} room${job.rooms === 1 ? "" : "s"} captured`;
}

/** The first step still outstanding — what the job is actually waiting on. */
export function blockingStep(job: DesignJob): DesignStep | null {
  return designSteps(job).find((s) => s.state === "todo") ?? null;
}

export type NextAction = { label: string; href: string };

/**
 * Where the designer should be sent to move this job along. Mudmap and plan
 * both live on the measure screen, so they share a destination — the label is
 * what differs, and the label is the instruction.
 */
export function nextAction(job: DesignJob): NextAction {
  const step = blockingStep(job);
  switch (step?.key) {
    case "measure":
      return { label: job.rooms === 0 ? "Start measure" : "Finish measure", href: `/jobs/${job.id}/measure` };
    case "mudmap":
      return { label: "Upload mudmap", href: `/jobs/${job.id}/measure` };
    case "plan":
      return { label: "Draw plan", href: `/jobs/${job.id}/measure` };
    case "drawing":
      return { label: "Upload design", href: `/jobs/${job.id}` };
    case "approval":
      return { label: "Chase approval", href: `/jobs/${job.id}` };
    default:
      return { label: "Open job", href: `/jobs/${job.id}` };
  }
}

/** How far through the five steps a job is, for a progress bar. */
export function designProgress(job: DesignJob): { done: number; total: number } {
  const steps = designSteps(job);
  return { done: steps.filter((s) => s.state === "done").length, total: steps.length };
}

/**
 * Queue order: least-progressed first, so the job needing the most work is at
 * the top rather than buried under jobs that are nearly finished. Ties break on
 * reference, so the list doesn't reshuffle between loads.
 */
export function sortQueue(jobs: DesignJob[]): DesignJob[] {
  return [...jobs].sort((a, b) => {
    const byProgress = designProgress(a).done - designProgress(b).done;
    if (byProgress !== 0) return byProgress;
    return a.reference.localeCompare(b.reference);
  });
}
