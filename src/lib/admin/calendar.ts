/**
 * Week / month / year ranges for the attendance history page.
 * Dates are ISO "YYYY-MM-DD" strings handled in UTC so the server's timezone never matters.
 * Weeks start on Monday.
 */

export type View = "week" | "month" | "year";
export const VIEWS: View[] = ["week", "month", "year"];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function utc(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && ISO.test(v) && iso(utc(v)) === v;
}

export function addDays(date: string, days: number) {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(date: string) {
  return utc(date).getUTCDay();
}

export function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export type Range = { view: View; from: string; to: string; label: string; prev: string; next: string };

function fmt(date: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" }).format(utc(date));
}

/** The week, month or year containing `date`, plus the dates to jump to for ‹ and ›. */
export function rangeFor(view: View, date: string): Range {
  if (view === "week") {
    const from = addDays(date, -((weekday(date) + 6) % 7));
    const to = addDays(from, 6);
    const label = `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;
    return { view, from, to, label, prev: addDays(from, -7), next: addDays(from, 7) };
  }
  const d = utc(date);
  if (view === "month") {
    const from = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
    const to = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    const prev = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
    const next = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
    return { view, from, to, label: fmt(from, { month: "long", year: "numeric" }), prev, next };
  }
  const y = d.getUTCFullYear();
  return { view, from: `${y}-01-01`, to: `${y}-12-31`, label: String(y), prev: `${y - 1}-01-01`, next: `${y + 1}-01-01` };
}

export function shortDay(date: string) {
  return fmt(date, { weekday: "short", day: "numeric", month: "short" });
}

export function monthName(month: number) {
  return fmt(`2000-${String(month + 1).padStart(2, "0")}-01`, { month: "short" });
}
