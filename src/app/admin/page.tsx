import { AttendanceBoard } from "@/components/admin/attendance-board";
import { PunchLinkCard } from "@/components/admin/punch-link-card";
import { getTodayBoard } from "@/lib/admin/data";

export const metadata = { title: "Today" };

export default async function AdminHome() {
  const { settings, today, rows } = await getTodayBoard();
  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${today}T00:00:00Z`));

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Today</h1>
        <p className="text-muted-foreground text-sm">{dateLabel}</p>
      </div>
      <AttendanceBoard rows={rows} timeZone={settings.timezone} />
      <PunchLinkCard kioskCode={settings.kiosk_code} />
    </div>
  );
}
