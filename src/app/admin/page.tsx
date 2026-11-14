import Link from "next/link";
import { CalendarHeart } from "lucide-react";

import { AttendanceBoard } from "@/components/admin/attendance-board";
import { DayTimingCard } from "@/components/admin/day-timing-card";
import { getTodayBoard } from "@/lib/admin/data";
import { HOLIDAY_STYLE } from "@/lib/holidays";
import { isOffDay } from "@/lib/timing";
import { cn } from "@/lib/utils";

export const metadata = { title: "Today" };

export default async function AdminHome() {
  const { settings, today, rows, dayTiming, holiday } = await getTodayBoard();
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
      {holiday && (
        <Link
          href="/admin/holidays"
          className={cn("flex items-start gap-2 rounded-xl p-3 text-sm", HOLIDAY_STYLE.soft)}
          data-testid="holiday-note"
        >
          <CalendarHeart className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold">Holiday: {holiday.name}</span>
            {" · "}
            {holiday.paid && !offDay
              ? "Everyone gets a day's pay. Nobody is marked absent; punches are kept but not paid on top."
              : "Nobody is marked absent. Punches are kept but not paid."}
          </span>
        </Link>
      )}
      {offDay && !holiday && (
        <p className="rounded-xl bg-sky-500/10 p-3 text-sm text-sky-800" data-testid="off-day-note">
          Today is an off day. Punches are recorded but not counted in the salary.
        </p>
      )}
      <AttendanceBoard rows={rows} timeZone={settings.timezone} radiusM={settings.work_radius_m} />
    </div>
  );
}
