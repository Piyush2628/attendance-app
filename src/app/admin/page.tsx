import { AttendanceBoard } from "@/components/admin/attendance-board";
import { DayTimingCard } from "@/components/admin/day-timing-card";
import { getTodayBoard } from "@/lib/admin/data";
import { isOffDay } from "@/lib/timing";

export const metadata = { title: "Today" };

export default async function AdminHome() {
  const { settings, today, rows, dayTiming } = await getTodayBoard();
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${today}T00:00:00Z`));
  const offDay = isOffDay(today, settings.off_days);

  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <h1 className="text-2xl font-bold">Today</h1>
        <p className="text-muted-foreground text-sm">{dateLabel}</p>
      </div>
      <DayTimingCard key={today} date={today} dayTiming={dayTiming} usual={settings} />
      {offDay && (
        <p className="rounded-xl bg-sky-500/10 p-3 text-sm text-sky-800" data-testid="off-day-note">
          Today is an off day. Punches are recorded but not counted in the salary.
        </p>
      )}
      <AttendanceBoard rows={rows} timeZone={settings.timezone} radiusM={settings.work_radius_m} />
    </div>
  );
}
