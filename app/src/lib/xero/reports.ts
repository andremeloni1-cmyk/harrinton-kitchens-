import { xeroGet } from "@/lib/xero/client";

export type PnlRow = { label: string; amount: number };
export type PnlSection = { title: string; rows: PnlRow[]; total?: PnlRow };
export type PnlReport = {
  title: string;
  fromDate: string;
  toDate: string;
  sections: PnlSection[];
  totals: { income: number; expenses: number; netProfit: number };
};

// Xero report payload: a tree of typed rows whose display values live in Cells.
type XeroCell = { Value?: string };
type XeroRow = {
  RowType: "Header" | "Section" | "Row" | "SummaryRow";
  Title?: string;
  Cells?: XeroCell[];
  Rows?: XeroRow[];
};
export type ReportsResponse = {
  Reports?: Array<{ ReportName?: string; ReportTitles?: string[]; Rows?: XeroRow[] }>;
};

function cellRow(row: XeroRow): PnlRow | null {
  const cells = row.Cells ?? [];
  if (cells.length < 2) return null;
  const label = cells[0]?.Value ?? "";
  // Amount is the last cell (single-period reports have exactly two cells).
  const amount = parseFloat(cells[cells.length - 1]?.Value ?? "");
  if (!label || isNaN(amount)) return null;
  return { label, amount };
}

/**
 * Flattens Xero's Section/Row/SummaryRow report tree into renderable sections.
 * Tolerant of layout variations: anything it can't parse is skipped rather
 * than fatal.
 */
export function parsePnlReport(res: ReportsResponse, from: string, to: string): PnlReport {
  const report = res.Reports?.[0];
  const sections: PnlSection[] = [];
  const totals = { income: 0, expenses: 0, netProfit: NaN };

  for (const node of report?.Rows ?? []) {
    if (node.RowType !== "Section") continue;
    const rows: PnlRow[] = [];
    let total: PnlRow | undefined;
    for (const child of node.Rows ?? []) {
      const parsed = cellRow(child);
      if (!parsed) continue;
      if (child.RowType === "SummaryRow") total = parsed;
      else if (child.RowType === "Row") rows.push(parsed);
    }
    // Untitled single-summary sections carry the report totals (e.g. Net Profit).
    const title = node.Title || total?.label || "";
    if (rows.length === 0 && !total) continue;
    sections.push({ title, rows, total });

    const label = (total?.label || title).toLowerCase();
    if (/total income|total revenue/.test(label)) totals.income = total?.amount ?? 0;
    else if (/total.*(expense|cost of sales)/.test(label)) totals.expenses += total?.amount ?? 0;
    else if (/net profit|net loss/.test(label)) totals.netProfit = total?.amount ?? 0;
  }

  if (isNaN(totals.netProfit)) totals.netProfit = totals.income - totals.expenses;

  return {
    title: report?.ReportTitles?.join(" — ") || report?.ReportName || "Profit and Loss",
    fromDate: from,
    toDate: to,
    sections,
    totals,
  };
}

/** Fetches Xero's Profit and Loss report for the period. Null when Xero is
 * not connected. */
export async function fetchProfitAndLoss(from: string, to: string): Promise<PnlReport | null> {
  const res = await xeroGet<ReportsResponse>(
    `/Reports/ProfitAndLoss?fromDate=${from}&toDate=${to}`
  );
  if (res === null) return null;
  return parsePnlReport(res, from, to);
}
