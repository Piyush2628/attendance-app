import Link from "next/link";
import { CalendarHeart, ChevronLeft, ChevronRight, Flag } from "lucide-react";

import { HolidayDialog, NationalHolidaysButton } from "@/components/admin/holiday-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadHolidays, requireOwner } from "@/lib/admin/data";
import { dayCount, monthName, weekday } from "@/lib/admin/calendar";
import { HOLIDAY_STYLE, NATIONAL_HOLIDAYS, type HolidayInfo } from "@/lib/holidays";
import { isOffDay, WEEKDAYS } from "@/lib/timing";
import { cn } from "@/lib/utils";

export const metadata = { title: "Holidays" };

export default async function HolidaysPage({ searchParams }: PageProps<"/admin/holidays">) {
  const { supabase, settings, today } = await requireOwner();
  const sp = await searchParams;
  const thisYear = Number(today.slice(0, 4));
  const asked = Number(sp.y);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : thisYear;

  const holidays = [...(await loadHolidays(supabase, `${year}-01-01`, `${year}-12-31`)).values()];
  const isOff = (d: string) => isOffDay(d, settings.off_days);
  const paidDays = holidays.filter((h) => h.paid && !isOff(h.date)).length;
  const next = holidays.find((h) => h.date >= today);
  const missingNational = NATIONAL_HOLIDAYS.filter((n) => !holidays.some((h) => h.date === `${year}-${n.monthDay}`));
  const indian = settings.currency === "INR" || settings.timezone === "Asia/Kolkata";

  const byMonth = new Map<number, HolidayInfo[]>();
  for (const h of holidays) {
    const m = Number(h.date.slice(5, 7)) - 1;
    byMonth.set(m, [...(byMonth.get(m) ?? []), h]);
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Holidays</h1>
          <p className="text-muted-foreground text-sm">Festivals and days the business is closed.</p>
        </div>
        <HolidayDialog date={year === thisYear ? today : `${year}-01-01`} />
      </div>

      <div className="flex items-center justify-between rounded-xl border p-1">
        <Button asChild variant="ghost" size="icon" aria-label="Previous year">
          <Link href={`/admin/holidays?y=${year - 1}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <div className="text-lg font-semibold tabular-nums" data-testid="holiday-year">
          {year}
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Next year">
          <Link href={`/admin/holidays?y=${year + 1}`}>
            <ChevronRight />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label={holidays.length === 1 ? "Holiday" : "Holidays"} value={holidays.length} className={HOLIDAY_STYLE.soft} />
        <Stat label="Paid days" value={paidDays} className="bg-punch-in/10 text-punch-in" />
        <div className="bg-muted min-w-0 rounded-xl p-2">
          <div className="truncate text-sm font-bold">{next ? next.name : "—"}</div>
          <div className="text-muted-foreground text-xs font-medium">
            {next ? (next.date === today ? "Today" : `Next · in ${dayCount(today, next.date) - 1} d`) : "Next"}
          </div>
        </div>
      </div>

      {indian && missingNational.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-3" data-testid="national-holidays">
          <Flag className="text-muted-foreground size-5 shrink-0" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">National holidays {year}</span>
            <span className="text-muted-foreground block text-xs">
              {missingNational.map((n) => `${n.name} (${Number(n.monthDay.slice(3))} ${monthName(Number(n.monthDay.slice(0, 2)) - 1)})`).join(", ")}
            </span>
          </p>
          <NationalHolidaysButton year={year} missing={missingNational.length} />
        </div>
      )}

      {holidays.length === 0 ? (
        <div className="text-muted-foreground grid justify-items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <CalendarHeart className="size-8 opacity-60" />
          <p>No holidays in {year} yet.</p>
          <p className="text-sm">Add festivals like Diwali or Holi so nobody is marked absent on them.</p>
        </div>
      ) : (
        <div className="grid gap-4" data-testid="holiday-list">
          {[...byMonth].map(([m, list]) => (
            <section key={m} className="grid gap-1.5">
              <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
                {monthName(m)} {year}
              </h2>
              <ul className="divide-y rounded-xl border">
                {list.map((h) => {
                  const off = isOff(h.date);
                  const past = h.date < today;
                  return (
                    <li key={h.date} className="flex items-center gap-3 p-2 pr-1" data-past={past || undefined}>
                      <div
                        className={cn(
                          "flex size-12 shrink-0 flex-col items-center justify-center rounded-lg leading-none",
                          h.date === today ? HOLIDAY_STYLE.cell : past ? "bg-muted text-muted-foreground" : HOLIDAY_STYLE.soft,
                        )}
                      >
                        <span className="text-lg font-bold tabular-nums">{Number(h.date.slice(8))}</span>
                        <span className="text-[10px] font-medium uppercase">{WEEKDAYS[weekday(h.date)]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate font-semibold", past && "text-muted-foreground")}>{h.name}</div>
                        <div className="text-muted-foreground text-xs">
                          {off ? "On an off day, so no extra pay" : h.paid ? "Paid to everyone" : "Closed, not paid"}
                          {h.date === today && " · Today"}
                        </div>
                      </div>
                      <Badge variant={h.paid && !off ? "present" : "outline"}>{h.paid ? "Paid" : "Unpaid"}</Badge>
                      <HolidayDialog holiday={h} compact />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        On a holiday nobody is marked absent. A paid holiday is paid as one day to everyone who was working for you
        then: the daily rate, a day of the monthly salary, or one shift for hourly staff. It shows on the salary slip
        once the day has passed.
      </p>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl p-2", className)}>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}
