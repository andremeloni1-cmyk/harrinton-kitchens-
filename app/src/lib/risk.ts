// Risk advisor (P12.3): deterministic checks over the business, with all
// thresholds as named constants. detectRisks is pure so seeded scenarios can be
// unit-tested; computeRisks (in risk-server.ts) gathers the live inputs.

export const RISK_THRESHOLDS = {
  OVERLOAD_STATION_DAYS: 1, // any overloaded station-day this week is worth flagging
  STALE_APPROVAL_DAYS: 5, // a quote/drawing sent but not actioned for this long
  SNAG_AGING_DAYS: 14, // an open snag older than this
  DEPOSIT_UNPAID_DAYS: 7, // a deposit invoice authorised but unpaid for this long
} as const;

export type RiskSeverity = "high" | "medium";
export type RiskItem = { kind: string; severity: RiskSeverity; message: string };

export type RiskInput = {
  overloadedStationDays: number;
  staleApprovals: { label: string; ageDays: number }[];
  unsignedQuotes: number;
  agingSnags: { job: string; ageDays: number }[];
  unpaidDeposits: { job: string; ageDays: number }[];
};

export function detectRisks(input: RiskInput): RiskItem[] {
  const risks: RiskItem[] = [];

  if (input.overloadedStationDays >= RISK_THRESHOLDS.OVERLOAD_STATION_DAYS) {
    risks.push({
      kind: "capacity",
      severity: input.overloadedStationDays >= 3 ? "high" : "medium",
      message: `${input.overloadedStationDays} station-day(s) overloaded this week — rebalance the schedule.`,
    });
  }

  const stale = input.staleApprovals.filter((a) => a.ageDays >= RISK_THRESHOLDS.STALE_APPROVAL_DAYS);
  for (const a of stale) {
    risks.push({ kind: "stale_approval", severity: "medium", message: `${a.label} has been waiting ${a.ageDays} days with no response — chase it.` });
  }

  if (input.unsignedQuotes > 0) {
    risks.push({ kind: "unsigned_quotes", severity: "medium", message: `${input.unsignedQuotes} quote(s) sent but not yet accepted.` });
  }

  const aging = input.agingSnags.filter((s) => s.ageDays >= RISK_THRESHOLDS.SNAG_AGING_DAYS);
  for (const s of aging) {
    risks.push({ kind: "aging_snag", severity: "medium", message: `Snag on ${s.job} open ${s.ageDays} days — close it out.` });
  }

  const unpaid = input.unpaidDeposits.filter((d) => d.ageDays >= RISK_THRESHOLDS.DEPOSIT_UNPAID_DAYS);
  for (const d of unpaid) {
    risks.push({ kind: "unpaid_deposit", severity: "high", message: `Deposit for ${d.job} unpaid ${d.ageDays} days — don't start work until it's in.` });
  }

  // High severity first, then by kind for stable output.
  return risks.sort((a, b) => (a.severity === b.severity ? a.kind.localeCompare(b.kind) : a.severity === "high" ? -1 : 1));
}

/** Plain-text digest lines for the weekly email / on-demand view. */
export function formatRisks(risks: RiskItem[]): string[] {
  if (risks.length === 0) return ["✅ No risks flagged — everything's on track."];
  return risks.map((r) => `${r.severity === "high" ? "🔴" : "🟠"} ${r.message}`);
}
