import { ComingSoon } from "@/components/coming-soon";

export default function AdminHome() {
  return (
    <ComingSoon title="Live attendance board" step={2}>
      Who is clocked in, clocked out or absent today, with one-tap Mark Present / Absent / Half Day
      (mark_attendance RPC) and realtime updates from attendance_logs.
    </ComingSoon>
  );
}
