import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_STYLES,
  type InvoiceStatus,
} from "@/lib/types";

export function InvoiceStatusPill({
  status,
  overdue = false,
  className = "",
}: {
  status: string;
  overdue?: boolean;
  className?: string;
}) {
  const key = (overdue ? "overdue" : status) as InvoiceStatus | "overdue";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        INVOICE_STATUS_STYLES[key] || INVOICE_STATUS_STYLES.draft
      } ${className}`}
    >
      {INVOICE_STATUS_LABELS[key] || status}
    </span>
  );
}
