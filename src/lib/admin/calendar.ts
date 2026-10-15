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

/** Number of days from `from` to `to`, both included. */
export function dayCount(from: string, to: string) {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000) + 1;
}

/** "Wed, 15 Oct 2026" for one day, else "1 Oct – 15 Oct 2026". */
export function rangeLabel(from: string, to: string) {
  if (from === to) return fmt(from, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const start = fmt(from, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  return `${start} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;
}

export type Preset = { key: string; label: string; from: string; to: string };

/** Quick picks for the all-employees view. Ranges end today at the latest. */
export function presets(today: string): Preset[] {
  const yesterday = addDays(today, -1);
  const week = rangeFor("week", today);
  const month = rangeFor("month", today);
  const last = rangeFor("month", month.prev);
  return [
    { key: "today", label: "Today", from: today, to: today },
    { key: "yesterday", label: "Yesterday", from: yesterday, to: yesterday },
    { key: "week", label: "This week", from: week.from, to: today },
    { key: "month", label: "This month", from: month.from, to: today },
    { key: "last-month", label: "Last month", from: last.from, to: last.to },
  ];
}

const MAX_RANGE_DAYS = 366;

/** ?from=&to= when valid (in order, at most a year), else null. */
export function parseRange(from: unknown, to: unknown): { from: string; to: string } | null {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to || dayCount(from, to) > MAX_RANGE_DAYS) return null;
  return { from, to };
}

/** The range just before/after: a whole month moves a month, anything else moves by its own length. */
export function shiftRange(from: string, to: string, by: 1 | -1) {
  const month = rangeFor("month", from);
  if (from === month.from && to === month.to) {
    const m = rangeFor("month", by === 1 ? month.next : month.prev);
    return { from: m.from, to: m.to };
  }
  const n = dayCount(from, to) * by;
  return { from: addDays(from, n), to: addDays(to, n) };
}

/**
 * Working days from `from` to `to` with no attendance record, counted as absent.
 * Only days since the employee was added, and only up to yesterday (today isn't over yet).
 */
export function missingDays(opts: {
  from: string;
  to: string;
  today: string;
  joined: string;
  offDays: number[];
  recorded: Set<string>;
}) {
  const start = opts.from > opts.joined ? opts.from : opts.joined;
  const yesterday = addDays(opts.today, -1);
  const end = opts.to < yesterday ? opts.to : yesterday;
  if (start > end) return 0;
  return daysBetween(start, end).filter((d) => !opts.offDays.includes(weekday(d)) && !opts.recorded.has(d)).length;
}
