/**
 * Pay period from ?from=YYYY-MM-DD&to=YYYY-MM-DD, defaulting to the current month.
 * Shared by the payroll report and the salary slip so their links agree.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

export type Period = {
  from: string;
  to: string;
  /** "October 2026" for a whole month, else "1 Oct – 15 Oct 2026" */
  label: string;
  /** True when the range is exactly one calendar month */
  isMonth: boolean;
};

function utc(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && utc(value).toISOString().startsWith(value);
}

function lastOfMonth(iso: string) {
  const d = utc(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" }).format(utc(iso));
}

export function monthPeriod(month: string): Period {
  return makePeriod(`${month}-01`, lastOfMonth(`${month}-01`));
}

function makePeriod(from: string, to: string): Period {
  const isMonth = from.endsWith("-01") && to === lastOfMonth(from);
  let label: string;
  if (isMonth) {
    label = fmt(from, { month: "long", year: "numeric" });
  } else if (from === to) {
    label = fmt(from, { day: "numeric", month: "short", year: "numeric" });
  } else {
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    label = `${fmt(from, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return { from, to, label, isMonth };
}

/** Reads the period from search params; anything invalid falls back to the current month. */
export function parsePeriod(params: Record<string, string | string[] | undefined>, today: string): Period {
  const { from, to } = params;
  if (isValidDate(from) && isValidDate(to) && from <= to) {
    const days = (utc(to).getTime() - utc(from).getTime()) / 86_400_000 + 1;
    if (days <= MAX_DAYS) return makePeriod(from, to);
  }
  return monthPeriod(today.slice(0, 7));
}

/** The month before/after the one `period` starts in. */
export function shiftMonth(period: Period, by: number): Period {
  const d = utc(period.from);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + by, 1));
  return monthPeriod(next.toISOString().slice(0, 7));
}

export function periodQuery(period: Pick<Period, "from" | "to">) {
  return `from=${period.from}&to=${period.to}`;
}
