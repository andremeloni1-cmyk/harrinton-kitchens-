// Client-safe formatting helpers.

export function fmtMoney(amount?: number | null, currency = "AUD"): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amount);
}

export function fmtDay(d?: string | Date | null): string {
  if (!d) return "Unscheduled";
  return new Date(d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function fmtTime(d?: string | Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function fmtRange(start?: string | Date | null, end?: string | Date | null): string {
  if (!start) return "Unscheduled";
  const s = fmtTime(start);
  const e = end ? fmtTime(end) : "";
  return e ? `${s}–${e}` : s;
}

export function toLocalInput(d?: string | Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function relativeTime(d?: string | Date | null): string {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
