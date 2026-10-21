import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { DayTimingCard } from "@/components/admin/day-timing-card";
import { STATE, dayState, hideUnless, type DayState, type FilterStatus } from "@/components/attendance/day-state";
import { EditDayDialog } from "@/components/attendance/edit-day-dialog";
import { EmployeePicker } from "@/components/attendance/employee-picker";
import { LateTag, SelfieThumbs } from "@/components/attendance/punch-tags";
import { RangePicker } from "@/components/attendance/range-picker";
import { FilterButton, FilterNote, StatusFilter } from "@/components/attendance/status-filter";
import { WorkerAvatar } from "@/components/worker-avatar";
import { SELFIE_IDS, selfieIds, type requireOwner } from "@/lib/admin/data";
import { addDays, daysBetween, missingDays } from "@/lib/admin/calendar";
import { isoDate } from "@/lib/format";
import { isOffDay, offDaysLabel } from "@/lib/timing";
import { cn } from "@/lib/utils";
import type { AttendanceLog, DayTiming } from "@/types/database";

type Owner = Awaited<ReturnType<typeof requireOwner>>;
type Worker = { id: string; name: string; photo_url: string | null; is_active: boolean; created_at: string };

/** PostgREST returns at most 1000 rows per request on Supabase. */
const PAGE = 1000;

/**
 * Attendance of every employee for one day or a date range.
 * One day: each employee's status and in/out times. A range: present / half day / absent counts per employee.
 * A working day with no record counts as absent (today only once the day is over).
 */
export async function AllEmployees({ owner, from, to }: { owner: Owner; from: string; to: string }) {
  const { supabase, settings, today } = owner;
  const single = from === to;

  const workersQuery = supabase
    .from("workers")
    .select("id, name, photo_url, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("name");

  let workers: Worker[];
  let content: React.ReactNode;
  if (single) {
    const [w, logs, dayTiming] = await Promise.all([
      workersQuery,
      supabase
        .from("attendance_logs")
        .select(`id, worker_id, date, clock_in, clock_out, status, manual_override, late_minutes, notes, ${SELFIE_IDS}`)
        .eq("date", from),
      supabase.from("day_timings").select("work_start, work_end").eq("date", from).maybeSingle(),
    ]);
    if (w.error) throw w.error;
    if (logs.error) throw logs.error;
    if (dayTiming.error) throw dayTiming.error;
    workers = w.data;
    content = <DayView owner={owner} date={from} workers={workers} logs={logs.data} dayTiming={dayTiming.data} />;
  } else {
    const logsPage = (n: number, count = false) =>
      supabase
        .from("attendance_logs")
        .select("worker_id, date, clock_in, clock_out, status, manual_override", count ? { count: "exact" } : undefined)
        .gte("date", from)
        .lte("date", to)
        .order("id")
        .range(n * PAGE, n * PAGE + PAGE - 1);
    const [w, first] = await Promise.all([workersQuery, logsPage(0, true)]);
    if (w.error) throw w.error;
    if (first.error) throw first.error;
    const pages = Math.ceil((first.count ?? 0) / PAGE);
    const rest = await Promise.all(Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => logsPage(i + 1)));
    const logs = [...first.data];
    for (const r of rest) {
      if (r.error) throw r.error;
      logs.push(...r.data);
    }
    workers = w.data;
    content = <RangeView owner={owner} from={from} to={to} workers={workers} logs={logs} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="text-2xl font-bold">Attendance</h1>
      {workers.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          No employees yet. Add them on the Employees tab.
        </p>
      ) : (
        <>
          <EmployeePicker
            workers={workers}
            selected=""
            employeeQuery={single ? `view=month&d=${from}` : `from=${from}&to=${to}`}
            allQuery={`from=${from}&to=${to}`}
          />
          <RangePicker from={from} to={to} today={today} />
          {isOffDay(from, settings.off_days) && single && (
            <p className="text-muted-foreground -mt-2 text-sm">Off day ({offDaysLabel(settings.off_days)}), not paid.</p>
          )}
          {/* A new day or range starts unfiltered. */}
          <StatusFilter key={`${from}_${to}`}>{content}</StatusFilter>
        </>
      )}
    </div>
  );
}

/** First day the employee could have a record: the day they were added, in the business time zone. */
export function joinedOn(w: Pick<Worker, "created_at">, timeZone: string) {
  return isoDate(new Date(w.created_at), timeZone);
}

type DayLog = Pick<
  AttendanceLog,
  "id" | "worker_id" | "date" | "clock_in" | "clock_out" | "status" | "manual_override" | "late_minutes" | "notes"
> & { punch_selfies: { id: string; kind: string }[] | null };

type RowState = DayState | "no_record" | "not_in" | "off";

const EXTRA: Record<"no_record" | "not_in" | "off", { label: string; cell: string }> = {
  no_record: { label: "Absent", cell: STATE.absent.cell },
  not_in: { label: "Not in yet", cell: "bg-muted text-muted-foreground" },
  off: { label: "Off day", cell: "border border-dashed text-muted-foreground" },
};

function DayView({
  owner,
  date,
  workers,
  logs,
  dayTiming,
}: {
  owner: Owner;
  date: string;
  workers: Worker[];
  logs: DayLog[];
  dayTiming: Pick<DayTiming, "work_start" | "work_end"> | null;
}) {
  const { settings, today } = owner;
  const off = isOffDay(date, settings.off_days);
  const byWorker = new Map(logs.map((l) => [l.worker_id, l]));
  const time = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: settings.timezone }).format(
          new Date(iso),
        )
      : "…";

  // Inactive employees only show up when they have a record that day, and nobody shows before they were added.
  const rows = workers
    .map((w) => {
      const log = byWorker.get(w.id) ?? null;
      let state: RowState;
      if (log) state = dayState(log);
      else if (off) state = "off";
      else if (date >= today) state = "not_in";
      else state = "no_record";
      return { w, log, state };
    })
    .filter(({ w, log }) => log || (w.is_active && joinedOn(w, settings.timezone) <= date));

  const count = (...s: RowState[]) => rows.filter((r) => s.includes(r.state)).length;
  const stats: { status: FilterStatus; label: string; value: number; className: string; on: string }[] = [
    { status: "present", label: "Present", value: count("present"), className: "bg-punch-in/10 text-punch-in", on: "ring-punch-in" },
    { status: "half", label: "Half day", value: count("half_day"), className: "bg-amber-500/10 text-amber-700", on: "ring-amber-500" },
    { status: "absent", label: "Absent", value: count("absent", "no_record"), className: "bg-punch-out/10 text-punch-out", on: "ring-punch-out" },
  ];
  const matches = (state: RowState): FilterStatus[] =>
    state === "present" ? ["present"] : state === "half_day" ? ["half"] : state === "absent" || state === "no_record" ? ["absent"] : [];
  const pending = [
    count("open") > 0 && `${count("open")} still in`,
    count("not_in") > 0 && `${count("not_in")} not in yet`,
  ].filter(Boolean);

  return (
    <>
      <DayTimingCard key={date} date={date} dayTiming={dayTiming} usual={settings} />
      <div className="grid grid-cols-3 gap-2 text-center" data-testid="day-totals">
        {stats.map((s) => (
          <FilterButton
            key={s.status}
            status={s.status}
            empty={s.value === 0}
            className={cn("rounded-xl p-2", s.className)}
            onClassName={cn("ring-2", s.on)}
          >
            <div className="text-xl font-bold tabular-nums">{s.value}</div>
            <div className="text-xs font-medium">{s.label}</div>
          </FilterButton>
        ))}
      </div>
      <FilterNote />
      {pending.length > 0 && (
        <p className="text-muted-foreground -mt-2 text-center text-sm">{pending.join(" · ")}</p>
      )}

      <ul className="divide-y rounded-xl border" data-testid="all-day-list">
        {rows.map(({ w, log, state }) => {
          const chip = state in STATE ? STATE[state as DayState] : EXTRA[state as keyof typeof EXTRA];
          return (
            <li key={w.id} className={cn("flex items-center gap-3 px-3 py-2", hideUnless(matches(state)))} data-state={state}>
              <WorkerAvatar name={w.name} photoUrl={w.photo_url} className="size-10 text-sm" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/attendance?e=${w.id}&view=month&d=${date}`}
                  prefetch={false}
                  className="block truncate font-semibold underline-offset-2 hover:underline"
                >
                  {w.name}
                </Link>
                <div className="text-muted-foreground text-sm">
                  {log ? (log.clock_in ? `${time(log.clock_in)} – ${time(log.clock_out)}` : "Marked by you") : state === "no_record" ? "No record" : ""}
                </div>
                {log && log.late_minutes != null && (
                  <div className="mt-0.5 flex flex-wrap gap-1 empty:hidden">
                    <LateTag minutes={log.late_minutes} />
                  </div>
                )}
              </div>
              {log && <SelfieThumbs selfies={selfieIds(log.punch_selfies)} name={w.name} />}
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", chip.cell)}>{chip.label}</span>
              <EditDayDialog
                workerId={w.id}
                workerName={w.name}
                timeZone={settings.timezone}
                today={today}
                log={log ?? undefined}
                date={date}
                compact
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

type RangeLog = Pick<AttendanceLog, "worker_id" | "date" | "clock_in" | "clock_out" | "status" | "manual_override">;

function RangeView({
  owner,
  from,
  to,
  workers,
  logs,
}: {
  owner: Owner;
  from: string;
  to: string;
  workers: Worker[];
  logs: RangeLog[];
}) {
  const { settings, today } = owner;
  const offDays = settings.off_days;
  const lastClosed = to < today ? to : addDays(today, -1);
  const workingDays = daysBetween(from, to < today ? to : today).filter((d) => !isOffDay(d, offDays));

  const byWorker = new Map<string, RangeLog[]>();
  for (const l of logs) byWorker.set(l.worker_id, [...(byWorker.get(l.worker_id) ?? []), l]);

  // Same rule as the salary: off days are recorded but not counted.
  const rows = workers
    .map((w) => {
      const ls = byWorker.get(w.id) ?? [];
      const joined = joinedOn(w, settings.timezone);
      const working = ls.filter((l) => !isOffDay(l.date, offDays));
      const recorded = new Set(working.map((l) => l.date));
      // Inactive employees have no leaving date, so only their recorded absences count.
      const noRecord = w.is_active ? missingDays({ from, to, today, joined, offDays, recorded }) : 0;
      const states = working.map(dayState);
      return {
        w,
        hasAny: ls.length > 0,
        present: states.filter((s) => s === "present").length,
        half: states.filter((s) => s === "half_day").length,
        absent: states.filter((s) => s === "absent").length + noRecord,
        counted: w.is_active && joined <= lastClosed,
      };
    })
    .filter((r) => r.hasAny || r.counted);

  const heads = [
    { status: "present", key: "present", label: "Present", className: "text-punch-in", on: "bg-punch-in/10 ring-punch-in" },
    { status: "half", key: "half", label: "Half day", className: "text-amber-700", on: "bg-amber-500/10 ring-amber-500" },
    { status: "absent", key: "absent", label: "Absent", className: "text-punch-out", on: "bg-punch-out/10 ring-punch-out" },
  ] as const;

  return (
    <>
      <p className="text-muted-foreground -mt-2 text-center text-sm">
        {workingDays.length} working {workingDays.length === 1 ? "day" : "days"}
        {offDaysLabel(offDays) ? ` · ${offDaysLabel(offDays)} not counted` : ""}
      </p>
      <FilterNote />
      <div className="overflow-hidden rounded-xl border" data-testid="range-table">
        <div className="bg-muted/50 grid grid-cols-[1fr_repeat(3,3.25rem)_1rem] items-center gap-1.5 px-3 py-2 text-xs font-semibold">
          <span>Employee</span>
          {heads.map((h) => (
            <FilterButton
              key={h.status}
              status={h.status}
              empty={!rows.some((r) => r[h.key] > 0)}
              className={cn("rounded-md py-1 text-center leading-tight", h.className)}
              onClassName={cn("ring-2", h.on)}
            >
              {h.label}
            </FilterButton>
          ))}
          <span />
        </div>
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.w.id} data-testid="range-row" className={hideUnless(heads.filter((h) => r[h.key] > 0).map((h) => h.status))}>
              <Link
                href={`/admin/attendance?e=${r.w.id}&from=${from}&to=${to}`}
                prefetch={false}
                className="hover:bg-muted/40 grid grid-cols-[1fr_repeat(3,3.25rem)_1rem] items-center gap-1.5 px-3 py-3"
              >
                <span className="min-w-0 leading-tight font-medium break-words">
                  {r.w.name}
                  {!r.w.is_active && <span className="text-muted-foreground font-normal"> (inactive)</span>}
                </span>
                <Count value={r.present} className="bg-punch-in/10 text-punch-in" />
                <Count value={r.half} className="bg-amber-500/10 text-amber-700" />
                <Count value={r.absent} className="bg-punch-out/10 text-punch-out" />
                <ChevronRight className="text-muted-foreground size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** A count in a soft coloured box; zero is greyed out so the real numbers stand out. */
function Count({ value, className }: { value: number; className: string }) {
  return (
    <span
      className={cn(
        "rounded-md py-1 text-center text-base font-semibold tabular-nums",
        value === 0 ? "text-muted-foreground/60" : className,
      )}
    >
      {value}
    </span>
  );
}
