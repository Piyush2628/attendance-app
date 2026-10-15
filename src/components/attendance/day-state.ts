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
