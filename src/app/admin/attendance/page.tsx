import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { EditDayDialog } from "@/components/attendance/edit-day-dialog";
import { AllEmployees, joinedOn } from "@/components/attendance/all-employees";
import { dayState, STATE } from "@/components/attendance/day-state";
import { EmployeePicker } from "@/components/attendance/employee-picker";
import { RangePicker } from "@/components/attendance/range-picker";
import { LateTag, SelfieThumbs } from "@/components/attendance/punch-tags";
import { Button } from "@/components/ui/button";
import { requireOwner, SELFIE_IDS, selfieIds } from "@/lib/admin/data";
import {
  dayCount,
  daysBetween,
  missingDays,
  isIsoDate,
  monthName,
  parseRange,
  rangeFor,
  rangeLabel,
  shortDay,
  VIEWS,
  weekday,
  type Range,
  type View,
} from "@/lib/admin/calendar";
import { formatMinutes } from "@/lib/format";
import { isOffDay, offDaysLabel } from "@/lib/timing";
import { cn } from "@/lib/utils";
import type { AttendanceLog } from "@/types/database";

export const metadata = { title: "Attendance" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Log = Pick<
  AttendanceLog,
  "id" | "date" | "clock_in" | "clock_out" | "total_minutes" | "status" | "ot_minutes" | "manual_override" | "late_minutes" | "notes"
>;

const VIEW_LABEL: Record<View | "custom", string> = { week: "Week", month: "Month", year: "Year", custom: "Custom" };

export default async function AttendancePage({ searchParams }: PageProps<"/admin/attendance">) {
  const owner = await requireOwner();
  const { supabase, settings, today } = owner;
  const sp = await searchParams;
  const custom = parseRange(sp.from, sp.to);
  const requested = typeof sp.e === "string" && UUID.test(sp.e) ? sp.e : null;

  // Without an employee: everyone's attendance for a day (today by default) or a range.
  if (!requested) {
    const r = custom ?? { from: today, to: today };
    return <AllEmployees owner={owner} from={r.from} to={r.to} />;
  }

  // One employee: a week, month or year, or a custom from/to range.
  const view: View | "custom" = custom ? "custom" : VIEWS.includes(sp.view as View) ? (sp.view as View) : "month";
  const date = isIsoDate(sp.d) ? sp.d : today;
  const range = custom
    ? { from: custom.from, to: custom.to, label: rangeLabel(custom.from, custom.to) }
    : rangeFor(view as View, date);

  // Load the employee list and the requested employee's days together (one round trip).
  const loadLogs = (workerId: string) =>
    supabase
      .from("attendance_logs")
      .select(`id, date, clock_in, clock_out, total_minutes, status, ot_minutes, manual_override, late_minutes, notes, ${SELFIE_IDS}`)
      .eq("worker_id", workerId)
      .gte("date", range.from)
      .lte("date", range.to)
      .order("date");
  const [workers, requestedLogs] = await Promise.all([
    supabase.from("workers").select("id, name, is_active, created_at").order("is_active", { ascending: false }).order("name"),
    loadLogs(requested),
  ]);
  if (workers.error) throw workers.error;
  if (!workers.data.some((w) => w.id === requested)) redirect("/admin/attendance");
  const selectedId = requested;

  const logsRes = requestedLogs;
  if (logsRes.error) throw logsRes.error;
  const logs: Log[] = logsRes.data;
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const selfies = new Map(logsRes.data.map((l) => [l.id, selfieIds(l.punch_selfies)]));
  const worker = workers.data.find((w) => w.id === selectedId)!;
  const workerName = worker.name;

  // Totals match the salary: off days are recorded but not counted.
  const offDays = settings.off_days;
  const isOff = (d: string) => isOffDay(d, offDays);
  // A working day with no record counts as absent, as on the all-employees view.
  // Inactive employees have no leaving date, so only their recorded absences count.
  const joined = joinedOn(worker, settings.timezone);
  const recorded = new Set(logs.map((l) => l.date));
  const missing = (from: string, to: string) =>
    worker.is_active ? missingDays({ from, to, today, joined, offDays, recorded }) : 0;
  const missingDay = (d: string) => missing(d, d) > 0;
  const done = logs.filter((l) => dayState(l) !== "open" && !isOff(l.date));
  const offDayWork = logs.filter((l) => dayState(l) !== "open" && isOff(l.date) && l.status !== "absent").length;
  const totals = {
    present: done.filter((l) => l.status === "present").length,
    half: done.filter((l) => l.status === "half_day").length,
    absent: done.filter((l) => l.status === "absent").length + missing(range.from, range.to),
    minutes: done.reduce((s, l) => s + (l.total_minutes ?? 0), 0),
    ot: done.reduce((s, l) => s + (l.ot_minutes ?? 0), 0),
  };

  const href = (v: View, d: string) => `/admin/attendance?e=${selectedId}&view=${v}&d=${d}`;
  const clampedTo = range.to < today ? range.to : today;
  // The shown range up to today, for the Custom tab and for switching to all employees.
  const pastRange = `from=${range.from <= clampedTo ? range.from : today}&to=${clampedTo}`;
  const customHref = `/admin/attendance?e=${selectedId}&${pastRange}`;
  const nextIsFuture = "next" in range && range.next > today;
  const anchor = custom ? clampedTo : date; // the week / month / year tabs open around this day
  const time = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: settings.timezone }).format(
          new Date(iso),
        )
      : "–";

  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="text-2xl font-bold">Attendance</h1>

      <EmployeePicker
        workers={workers.data}
        selected={selectedId}
        employeeQuery={custom ? `from=${range.from}&to=${range.to}` : `view=${view}&d=${date}`}
        allQuery={pastRange}
      />

      <div className="bg-muted grid grid-cols-4 gap-1 rounded-xl p-1" role="tablist" aria-label="Period">
        {[...VIEWS, "custom" as const].map((v) => (
          <Link
            key={v}
            href={v === "custom" ? customHref : href(v, anchor)}
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

      {view === "custom" ? (
        <RangePicker from={range.from} to={range.to} today={today} employeeId={selectedId} />
      ) : (
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="icon" aria-label={`Previous ${view}`}>
            <Link href={href(view, (range as Range).prev)}>
              <ChevronLeft />
            </Link>
          </Button>
          <div className="text-center text-lg font-semibold" data-testid="range-label">
            {range.label}
          </div>
          <Button asChild variant="ghost" size="icon" aria-label={`Next ${view}`}>
            <Link
              href={href(view, (range as Range).next)}
              aria-disabled={nextIsFuture}
              tabIndex={nextIsFuture ? -1 : undefined}
              className={nextIsFuture ? "pointer-events-none opacity-30" : ""}
            >
              <ChevronRight />
            </Link>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5" data-testid="attendance-totals">
        <Stat label="Present" value={totals.present} className="bg-punch-in/10 text-punch-in" />
        <Stat label="Half days" value={totals.half} className="bg-amber-500/10 text-amber-700" />
        <Stat label="Absent" value={totals.absent} className="bg-punch-out/10 text-punch-out" />
        <Stat label="Hours" value={formatMinutes(totals.minutes)} className="bg-muted" />
        <Stat label="Overtime" value={formatMinutes(totals.ot)} className="bg-muted" />
      </div>
      {offDayWork > 0 && (
        <p className="text-muted-foreground -mt-2 text-sm" data-testid="off-day-work">
          Also came in on {offDayWork} off {offDayWork === 1 ? "day" : "days"} ({offDaysLabel(offDays)}), not counted in
          the salary.
        </p>
      )}

      {view === "month" && <MonthGrid from={range.from} to={range.to} today={today} byDate={byDate} isOff={isOff} />}

      {view !== "year" && (
        <div className="-mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Days</h2>
          <EditDayDialog
            workerId={selectedId}
            workerName={workerName}
            timeZone={settings.timezone}
            today={today}
            date={range.to < today ? range.to : today}
          />
        </div>
      )}

      {view === "year" ? (
        <YearTable
          year={range.from.slice(0, 4)}
          logs={logs.filter((l) => !isOff(l.date))}
          missing={missing}
          monthHref={(m) => href("month", m)}
        />
      ) : (
        <ul className="divide-y rounded-xl border" data-testid="day-list">
          {(view === "week" || (view === "custom" && dayCount(range.from, range.to) <= 62)
            ? daysBetween(range.from, range.to)
            : logs.map((l) => l.date)
          ).map((d) => {
            const l = byDate.get(d);
            const st = l ? dayState(l) : null;
            const off = isOff(d);
            return (
              <li key={d} className={cn("flex items-center gap-3 px-3 py-2", off && "bg-muted/40")}>
                <div className="w-24 shrink-0 text-sm font-medium">
                  {shortDay(d)}
                  {off && <div className="text-muted-foreground text-xs font-normal">Off day</div>}
                </div>
                <div className="text-muted-foreground min-w-0 flex-1 text-sm">
                  {!l ? (
                    d > today || off ? "" : "No record"
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
                  {l && (
                    <div className="mt-0.5 flex flex-wrap gap-1 empty:hidden">
                      <LateTag minutes={l.late_minutes} />
                      {off && l.status !== "absent" && dayState(l) !== "open" && (
                        <span className="text-xs">Not paid</span>
                      )}
                    </div>
                  )}
                </div>
                {l && <SelfieThumbs selfies={selfies.get(l.id) ?? {}} name={workerName} />}
                {(st || missingDay(d)) && (
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", STATE[st ?? "absent"].cell)}>
                    {STATE[st ?? "absent"].label}
                  </span>
                )}
                {(l || d <= today) && (
                  <EditDayDialog
                    workerId={selectedId}
                    workerName={workerName}
                    timeZone={settings.timezone}
                    today={today}
                    log={l}
                    date={d}
                    compact
                  />
                )}
              </li>
            );
          })}
          {logs.length === 0 && (view === "month" || (view === "custom" && dayCount(range.from, range.to) > 62)) && (
            <li className="text-muted-foreground p-6 text-center text-sm">No attendance in this period.</li>
          )}
        </ul>
      )}

      <Button asChild variant="secondary" className="justify-self-start">
        <Link href={`/admin/payroll/${selectedId}?from=${range.from}&to=${range.to}`}>
          <FileText /> Salary slip for this {view === "custom" ? "period" : view}
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

/** Calendar for one month: a coloured square per day (P / ½ / A). Off days are dashed and not paid. */
function MonthGrid({
  from,
  to,
  today,
  byDate,
  isOff,
}: {
  from: string;
  to: string;
  today: string;
  byDate: Map<string, Log>;
  isOff: (date: string) => boolean;
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
          const off = isOff(d);
          return (
            <div
              key={d}
              title={`${shortDay(d)}${st ? `: ${STATE[st].label}` : ""}${off ? " (off day, not paid)" : ""}`}
              data-state={st ?? "none"}
              data-off={off || undefined}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg text-sm leading-tight",
                st
                  ? STATE[st].cell
                  : off
                    ? "text-muted-foreground border border-dashed"
                    : d > today
                      ? "text-muted-foreground/50"
                      : "bg-muted text-muted-foreground",
                st && off && "opacity-60",
                d === today && "ring-primary ring-2 ring-offset-1",
              )}
            >
              <span className="font-semibold">{Number(d.slice(8))}</span>
              {st ? (
                <span className="text-[10px] font-bold">{STATE[st].short}</span>
              ) : (
                off && <span className="text-[10px]">Off</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One row per month with the counts; tapping a month opens its calendar. */
function YearTable({
  year,
  logs,
  missing,
  monthHref,
}: {
  year: string;
  logs: Log[];
  /** Working days with no record in from..to, counted as absent. */
  missing: (from: string, to: string) => number;
  monthHref: (date: string) => string;
}) {
  const months = Array.from({ length: 12 }, (_, m) => {
    const prefix = `${year}-${String(m + 1).padStart(2, "0")}`;
    const ls = logs.filter((l) => l.date.startsWith(prefix) && dayState(l) !== "open");
    return {
      m,
      first: `${prefix}-01`,
      present: ls.filter((l) => l.status === "present").length,
      half: ls.filter((l) => l.status === "half_day").length,
      absent: ls.filter((l) => l.status === "absent").length + missing(`${prefix}-01`, rangeFor("month", `${prefix}-01`).to),
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
                <Link href={monthHref(r.first)} prefetch={false} className="block p-2 font-medium underline-offset-2 hover:underline">
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
