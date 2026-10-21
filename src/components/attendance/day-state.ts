import type { AttendanceLog, AttendanceStatus } from "@/types/database";

export type DayState = AttendanceStatus | "open";

export const STATE: Record<DayState, { label: string; short: string; cell: string; text: string }> = {
  present: { label: "Present", short: "P", cell: "bg-punch-in text-punch-in-foreground", text: "text-punch-in" },
  half_day: { label: "Half day", short: "½", cell: "bg-amber-500 text-white", text: "text-amber-700" },
  absent: { label: "Absent", short: "A", cell: "bg-punch-out text-punch-out-foreground", text: "text-punch-out" },
  open: { label: "Still in", short: "In", cell: "bg-sky-500 text-white", text: "text-sky-700" },
};

/** "open" while a punch has no clock-out yet (and the owner hasn't marked the day). */
export function dayState(l: Pick<AttendanceLog, "clock_in" | "clock_out" | "manual_override" | "status">): DayState {
  return l.clock_in && !l.clock_out && !l.manual_override ? "open" : l.status;
}

/** Statuses the Attendance count boxes can filter the list by. */
export type FilterStatus = "present" | "half" | "absent";

/**
 * Put on a row to hide it while a filter it doesn't match is on.
 * Full class names so Tailwind sees them; they key off the `group/filter` wrapper below.
 */
const HIDE: Record<FilterStatus, string> = {
  present: "group-data-[filter=present]/filter:hidden",
  half: "group-data-[filter=half]/filter:hidden",
  absent: "group-data-[filter=absent]/filter:hidden",
};

/** Classes for a row that matches `matches`: hidden under every other filter. */
export function hideUnless(matches: FilterStatus[]) {
  return (Object.keys(HIDE) as FilterStatus[])
    .filter((s) => !matches.includes(s))
    .map((s) => HIDE[s])
    .join(" ");
}
