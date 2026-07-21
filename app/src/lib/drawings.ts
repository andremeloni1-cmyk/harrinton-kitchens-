// Drawing-revision lifecycle rules (P6). Kept pure and testable, shared by the
// revision routes and the UI.

export const REVISION_STATUSES = ["draft", "sent", "approved", "released"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export function isRevisionStatus(s: string): s is RevisionStatus {
  return (REVISION_STATUSES as readonly string[]).includes(s);
}

// Allowed moves. Approve and release are one-way; a sent revision can be pulled
// back to draft to revise before the client approves.
const NEXT: Record<RevisionStatus, RevisionStatus[]> = {
  draft: ["sent"],
  sent: ["draft", "approved"],
  approved: ["released"],
  released: [],
};

export function canTransition(from: string, to: string): boolean {
  return isRevisionStatus(from) && isRevisionStatus(to) && NEXT[from].includes(to);
}

// A revision's files can only change while it's unapproved (draft or sent).
// Approved/released revisions are immutable — a change needs a new revision.
export function isRevisionLocked(status: string): boolean {
  return status === "approved" || status === "released";
}

// Rev A, Rev B, … from the number of existing revisions in the set.
export function nextRevisionLabel(existingCount: number): string {
  return existingCount < 26 ? `Rev ${String.fromCharCode(65 + existingCount)}` : `Rev ${existingCount + 1}`;
}

export const REVISION_STATUS_LABELS: Record<RevisionStatus, string> = {
  draft: "Draft",
  sent: "Sent for review",
  approved: "Approved",
  released: "Released to factory",
};
