import Link from "next/link";

import { STATE, dayState, type DayState } from "@/components/attendance/day-state";
import { EditDayDialog } from "@/components/attendance/edit-day-dialog";
import { EmployeePicker } from "@/components/attendance/employee-picker";
import { LateTag, SelfieThumbs } from "@/components/attendance/punch-tags";
import { RangePicker } from "@/components/attendance/range-picker";
import { WorkerAvatar } from "@/components/worker-avatar";
import { SELFIE_IDS, selfieIds, type requireOwner } from "@/lib/admin/data";
import { addDays, daysBetween, missingDays } from "@/lib/admin/calendar";
import { isoDate } from "@/lib/format";
import { isOffDay, offDaysLabel } from "@/lib/timing";
import { cn } from "@/lib/utils";
import type { AttendanceLog } from "@/types/database";

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
    const [w, logs] = await Promise.all([
      workersQuery,
      supabase
        .from("attendance_logs")
        .select(`id, worker_id, date, clock_in, clock_out, status, manual_override, late_minutes, notes, ${SELFIE_IDS}`)
        .eq("date", from),
    ]);
    if (w.error) throw w.error;
    if (logs.error) throw logs.error;
    workers = w.data;
    content = <DayView owner={owner} date={from} workers={workers} logs={logs.data} />;
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
          {content}
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

function DayView({ owner, date, workers, logs }: { owner: Owner; date: string; workers: Worker[]; logs: DayLog[] }) {
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
  const stats = [
    { label: "Present", value: count("present"), className: "bg-punch-in/10 text-punch-in" },
    { label: "Half day", value: count("half_day"), className: "bg-amber-500/10 text-amber-700" },
    { label: "Absent", value: count("absent", "no_record"), className: "bg-punch-out/10 text-punch-out" },
  ];
  if (count("open") > 0) stats.push({ label: "Still in", value: count("open"), className: "bg-sky-500/10 text-sky-700" });
  if (count("not_in") > 0) stats.push({ label: "Not in yet", value: count("not_in"), className: "bg-muted" });

  return (
    <>
      <div className={cn("grid gap-2 text-center", ["grid-cols-3", "grid-cols-4", "grid-cols-5"][stats.length - 3])} data-testid="day-totals">
        {stats.map((s) => (
          <div key={s.label} className={cn("rounded-xl p-2", s.className)}>
            <div className="text-xl font-bold tabular-nums">{s.value}</div>
            <div className="text-xs font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      <ul className="divide-y rounded-xl border" data-testid="all-day-list">
        {rows.map(({ w, log, state }) => {
          const chip = state in STATE ? STATE[state as DayState] : EXTRA[state as keyof typeof EXTRA];
          return (
            <li key={w.id} className="flex items-center gap-3 px-3 py-2" data-state={state}>
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
        open: states.filter((s) => s === "open").length,
        offDayWork: ls.filter((l) => isOffDay(l.date, offDays) && dayState(l) !== "absent").length,
        counted: w.is_active && joined <= lastClosed,
      };
    })
    .filter((r) => r.hasAny || r.counted);

  return (
    <>
      <p className="text-muted-foreground -mt-2 text-sm">
        {workingDays.length} working {workingDays.length === 1 ? "day" : "days"}
        {offDaysLabel(offDays) ? `, ${offDaysLabel(offDays)} not counted` : ""}. A day with no record counts as absent.
        Tap a name to see their days.
      </p>
      <div className="overflow-hidden rounded-xl border" data-testid="range-table">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Employee</th>
              <th className="text-punch-in w-12 p-2 text-right font-medium" title="Present">P</th>
              <th className="w-12 p-2 text-right font-medium text-amber-700" title="Half day">½</th>
              <th className="text-punch-out w-12 p-2 text-right font-medium" title="Absent">A</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.w.id} data-testid="range-row">
                <td className="max-w-0 p-0">
                  <Link
                    href={`/admin/attendance?e=${r.w.id}&from=${from}&to=${to}`}
                    prefetch={false}
                    className="block p-2 underline-offset-2 hover:underline"
                  >
                    <span className="block truncate font-medium">
                      {r.w.name}
                      {!r.w.is_active && <span className="text-muted-foreground font-normal"> (inactive)</span>}
                    </span>
                    {(r.open > 0 || r.offDayWork > 0) && (
                      <span className="text-muted-foreground block text-xs">
                        {[r.open > 0 && STATE.open.label, r.offDayWork > 0 && `+${r.offDayWork} off ${r.offDayWork === 1 ? "day" : "days"}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">{r.present}</td>
                <td className="p-2 text-right font-semibold tabular-nums">{r.half}</td>
                <td className="p-2 text-right font-semibold tabular-nums">{r.absent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
