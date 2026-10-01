/** Work timings and off days (05_timings_selfies.sql). Times come from Postgres as "10:30:00". */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Clock-in later than this many minutes after the start time shows a "Late" tag. */
export const LATE_GRACE_MINUTES = 10;

type Timing = { work_start: string | null; work_end: string | null };

/** "10:30:00" -> "10:30 AM". */
export function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "10:30 AM – 7:30 PM", or null when there is no timing. */
export function timingLabel(t: Timing | null | undefined) {
  if (!t?.work_start || !t.work_end) return null;
  return `${formatTime(t.work_start)} – ${formatTime(t.work_end)}`;
}

/** The employee's own timing if set, else the business timing (same rule as compute_attendance()). */
export function effectiveTiming(worker: Timing, business: Timing): (Timing & { own: boolean }) | null {
  if (worker.work_start && worker.work_end) return { ...worker, own: true };
  if (business.work_start && business.work_end) return { ...business, own: false };
  return null;
}

/** "10:30:00" -> "10:30" for <input type="time">. */
export function timeInputValue(t: string | null | undefined) {
  return t ? t.slice(0, 5) : "";
}

/**
 * Reads a start/end pair from a form. Both empty = no timing (null, null).
 * Returns an error message when only one is filled or they are the same.
 */
export function readTimingPair(
  formData: FormData,
  startKey = "work_start",
  endKey = "work_end",
): { work_start: string | null; work_end: string | null } | { error: string } {
  const start = String(formData.get(startKey) ?? "").trim();
  const end = String(formData.get(endKey) ?? "").trim();
  if (!start && !end) return { work_start: null, work_end: null };
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!valid.test(start) || !valid.test(end)) return { error: "Enter both the start and end time." };
  if (start === end) return { error: "Start and end time can't be the same." };
  return { work_start: start, work_end: end };
}

/** Is this ISO date (yyyy-mm-dd) one of the off days? */
export function isOffDay(isoDate: string, offDays: number[]) {
  return offDays.includes(new Date(`${isoDate}T00:00:00Z`).getUTCDay());
}

/** "Sundays" / "Sundays and Saturdays" / null. */
export function offDaysLabel(offDays: number[]) {
  if (offDays.length === 0) return null;
  const names = [...offDays].sort().map((d) => `${WEEKDAY_NAMES[d]}s`);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Minutes the time zone is ahead of UTC at this instant (IST = 330). */
function zoneOffsetMinutes(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** "2026-10-01" + "10:30" in the owner's time zone -> a Date. */
export function zonedDate(isoDate: string, hhmm: string, timeZone: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  // Second pass settles a guess that landed on the other side of a DST change.
  return new Date(guess - zoneOffsetMinutes(new Date(first), timeZone) * 60_000);
}

/** A timestamp -> "10:30" in the owner's time zone, for <input type="time">. */
export function zonedTimeInput(iso: string | null | undefined, timeZone: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );
}
