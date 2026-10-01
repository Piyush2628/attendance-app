import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { EmployeePicker } from "@/components/attendance/employee-picker";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/admin/data";
import { daysBetween, isIsoDate, monthName, rangeFor, shortDay, VIEWS, weekday, type View } from "@/lib/admin/calendar";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AttendanceLog, AttendanceStatus } from "@/types/database";

export const metadata = { title: "Attendance" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Log = Pick<
  AttendanceLog,
  "id" | "date" | "clock_in" | "clock_out" | "total_minutes" | "status" | "ot_minutes" | "manual_override"
>;

type DayState = AttendanceStatus | "open";

const STATE: Record<DayState, { label: string; short: string; cell: string; text: string }> = {
  present: { label: "Present", short: "P", cell: "bg-punch-in text-punch-in-foreground", text: "text-punch-in" },
  half_day: { label: "Half day", short: "½", cell: "bg-amber-500 text-white", text: "text-amber-700" },
  absent: { label: "Absent", short: "A", cell: "bg-punch-out text-punch-out-foreground", text: "text-punch-out" },
  open: { label: "Still in", short: "In", cell: "bg-sky-500 text-white", text: "text-sky-700" },
};

function dayState(l: Log): DayState {
  return l.clock_in && !l.clock_out && !l.manual_override ? "open" : l.status;
}

const VIEW_LABEL: Record<View, string> = { week: "Week", month: "Month", year: "Year" };

export default async function AttendancePage({ searchParams }: PageProps<"/admin/attendance">) {
  const { supabase, settings, today } = await requireOwner();
  const sp = await searchParams;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "month";
  const date = isIsoDate(sp.d) ? sp.d : today;
  const range = rangeFor(view, date);

  const workers = await supabase.from("workers").select("id, name, is_active").order("is_active", { ascending: false }).order("name");
  if (workers.error) throw workers.error;
  if (workers.data.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          No employees yet. Add them on the Employees tab.
        </p>
      </div>
    );
  }
  const selectedId =
    typeof sp.e === "string" && UUID.test(sp.e) && workers.data.some((w) => w.id === sp.e) ? sp.e : workers.data[0].id;

  const logsRes = await supabase
    .from("attendance_logs")
    .select("id, date, clock_in, clock_out, total_minutes, status, ot_minutes, manual_override")
    .eq("worker_id", selectedId)
    .gte("date", range.from)
    .lte("date", range.to)
    .order("date");
  if (logsRes.error) throw logsRes.error;
  const logs: Log[] = logsRes.data;
  const byDate = new Map(logs.map((l) => [l.date, l]));

  const done = logs.filter((l) => dayState(l) !== "open");
  const totals = {
    present: done.filter((l) => l.status === "present").length,
    half: done.filter((l) => l.status === "half_day").length,
    absent: done.filter((l) => l.status === "absent").length,
    minutes: done.reduce((s, l) => s + (l.total_minutes ?? 0), 0),
    ot: done.reduce((s, l) => s + (l.ot_minutes ?? 0), 0),
  };

  const href = (v: View, d: string) => `/admin/attendance?e=${selectedId}&view=${v}&d=${d}`;
  const nextIsFuture = range.next > today;
  const time = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: settings.timezone }).format(
          new Date(iso),
        )
      : "–";

  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="text-2xl font-bold">Attendance</h1>

      <EmployeePicker workers={workers.data} selected={selectedId} query={`view=${view}&d=${date}`} />

      <div className="bg-muted grid grid-cols-3 gap-1 rounded-xl p-1" role="tablist" aria-label="Period">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={href(v, date)}
            role="tab"
            aria-selected={v === view}
            className={cn(
              "rounded-lg py-2 text-center font-medium",
              v === view ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {VIEW_LABEL[v]}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="icon" aria-label={`Previous ${view}`}>
          <Link href={href(view, range.prev)}>
            <ChevronLeft />
          </Link>
        </Button>
        <div className="text-center text-lg font-semibold" data-testid="range-label">
          {range.label}
        </div>
        <Button asChild variant="ghost" size="icon" aria-label={`Next ${view}`}>
          <Link
            href={href(view, range.next)}
            aria-disabled={nextIsFuture}
            tabIndex={nextIsFuture ? -1 : undefined}
            className={nextIsFuture ? "pointer-events-none opacity-30" : ""}
          >
            <ChevronRight />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5" data-testid="attendance-totals">
        <Stat label="Present" value={totals.present} className="bg-punch-in/10 text-punch-in" />
        <Stat label="Half days" value={totals.half} className="bg-amber-500/10 text-amber-700" />
        <Stat label="Absent" value={totals.absent} className="bg-punch-out/10 text-punch-out" />
        <Stat label="Hours" value={formatMinutes(totals.minutes)} className="bg-muted" />
        <Stat label="Overtime" value={formatMinutes(totals.ot)} className="bg-muted" />
      </div>

      {view === "month" && <MonthGrid from={range.from} to={range.to} today={today} byDate={byDate} />}

      {view === "year" ? (
        <YearTable year={range.from.slice(0, 4)} logs={logs} monthHref={(m) => href("month", m)} />
      ) : (
        <ul className="divide-y rounded-xl border" data-testid="day-list">
          {(view === "week" ? daysBetween(range.from, range.to) : logs.map((l) => l.date)).map((d) => {
            const l = byDate.get(d);
            const st = l ? dayState(l) : null;
            return (
              <li key={d} className="flex items-center gap-3 px-3 py-2">
                <div className="w-24 shrink-0 text-sm font-medium">{shortDay(d)}</div>
                <div className="text-muted-foreground min-w-0 flex-1 text-sm">
                  {!l ? (
                    d > today ? "" : "No record"
                  ) : l.clock_in ? (
                    <>
                      {time(l.clock_in)} – {l.clock_out ? time(l.clock_out) : "…"}
                      {l.total_minutes != null && (
                        <span className="text-foreground"> · {formatMinutes(l.total_minutes)}</span>
                      )}
                      {l.ot_minutes > 0 && <span> (OT {formatMinutes(l.ot_minutes)})</span>}
                    </>
                  ) : (
                    "Marked by you"
                  )}
                </div>
                {st && (
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATE[st].cell)}>
                    {STATE[st].label}
                  </span>
                )}
              </li>
            );
          })}
          {view === "month" && logs.length === 0 && (
            <li className="text-muted-foreground p-6 text-center text-sm">No attendance this month.</li>
          )}
        </ul>
      )}

      <Button asChild variant="secondary" className="justify-self-start">
        <Link href={`/admin/payroll/${selectedId}?from=${range.from}&to=${range.to}`}>
          <FileText /> Salary slip for this {view}
        </Link>
      </Button>
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

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Calendar for one month: a coloured square per day (P / ½ / A). */
function MonthGrid({
  from,
  to,
  today,
  byDate,
}: {
  from: string;
  to: string;
  today: string;
  byDate: Map<string, Log>;
}) {
  const lead = (weekday(from) + 6) % 7; // empty cells before the 1st (weeks start Monday)
  return (
    <div className="rounded-xl border p-2" data-testid="month-grid">
      <div className="text-muted-foreground grid grid-cols-7 gap-1 pb-1 text-center text-xs font-medium">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {daysBetween(from, to).map((d) => {
          const l = byDate.get(d);
          const st = l ? dayState(l) : null;
          return (
            <div
              key={d}
              title={st ? `${shortDay(d)}: ${STATE[st].label}` : shortDay(d)}
              data-state={st ?? "none"}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg text-sm leading-tight",
                st ? STATE[st].cell : d > today ? "text-muted-foreground/50" : "bg-muted text-muted-foreground",
                d === today && "ring-primary ring-2 ring-offset-1",
              )}
            >
              <span className="font-semibold">{Number(d.slice(8))}</span>
              {st && <span className="text-[10px] font-bold">{STATE[st].short}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One row per month with the counts; tapping a month opens its calendar. */
function YearTable({ year, logs, monthHref }: { year: string; logs: Log[]; monthHref: (date: string) => string }) {
  const months = Array.from({ length: 12 }, (_, m) => {
    const prefix = `${year}-${String(m + 1).padStart(2, "0")}`;
    const ls = logs.filter((l) => l.date.startsWith(prefix) && dayState(l) !== "open");
    return {
      m,
      first: `${prefix}-01`,
      present: ls.filter((l) => l.status === "present").length,
      half: ls.filter((l) => l.status === "half_day").length,
      absent: ls.filter((l) => l.status === "absent").length,
      minutes: ls.reduce((s, l) => s + (l.total_minutes ?? 0), 0),
    };
  });
  return (
    <div className="overflow-hidden rounded-xl border" data-testid="year-table">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="p-2 font-medium">Month</th>
            <th className="text-punch-in p-2 text-right font-medium">P</th>
            <th className="p-2 text-right font-medium text-amber-700">½</th>
            <th className="text-punch-out p-2 text-right font-medium">A</th>
            <th className="p-2 text-right font-medium">Hours</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {months.map((r) => (
            <tr key={r.m} className={cn(r.present + r.half + r.absent === 0 && "text-muted-foreground")}>
              <td className="p-0">
                <Link href={monthHref(r.first)} className="block p-2 font-medium underline-offset-2 hover:underline">
                  {monthName(r.m)}
                </Link>
              </td>
              <td className="p-2 text-right tabular-nums">{r.present}</td>
              <td className="p-2 text-right tabular-nums">{r.half}</td>
              <td className="p-2 text-right tabular-nums">{r.absent}</td>
              <td className="p-2 text-right tabular-nums">{formatMinutes(r.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
