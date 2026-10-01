/** 545 -> "9h 05m" */
export function formatMinutes(minutes: number | null | undefined) {
  const m = Math.max(0, Math.floor(minutes ?? 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** 1234.5 -> "₹1,234.50" (Indian digit grouping) */
export function formatMoney(amount: number | string | null | undefined, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount ?? 0));
}

/** "2026-10-01" style date in the given timezone */
export function isoDate(date: Date, timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

/** First and last day of the month containing `date`, as ISO dates. */
export function monthRange(date = new Date(), timeZone = "Asia/Kolkata") {
  const [y, m] = isoDate(date, timeZone).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}
