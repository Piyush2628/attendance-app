import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";

import { PrintButton } from "@/components/payroll/print-button";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/admin/data";
import { formatHours, getPayroll, WAGE_LABEL, WAGE_LABEL_HI } from "@/lib/admin/payroll";
import { parsePeriod, periodQuery } from "@/lib/admin/period";
import { formatMinutes, formatMoney } from "@/lib/format";
import { effectiveTiming, isOffDay, offDaysLabel, timingLabel } from "@/lib/timing";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, PayrollRow } from "@/types/database";

export const metadata = { title: "Salary slip" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS: Record<AttendanceStatus, { label: string; className: string }> = {
  present: { label: "Present", className: "text-green-700" },
  half_day: { label: "Half day", className: "text-amber-700" },
  absent: { label: "Absent", className: "text-red-700" },
};

export default async function SalarySlipPage({ params, searchParams }: PageProps<"/admin/payroll/[workerId]">) {
  const { workerId } = await params;
  if (!UUID.test(workerId)) notFound();

  const { supabase, settings, today } = await requireOwner();
  const period = parsePeriod(await searchParams, today);

  const [worker, logs, payroll] = await Promise.all([
    supabase
      .from("workers")
      .select("id, name, phone, wage_type, daily_rate, hourly_rate, monthly_salary, ot_rate_per_hour, work_start, work_end")
      .eq("id", workerId)
      .maybeSingle(),
    supabase
      .from("attendance_logs")
      .select("id, date, clock_in, clock_out, total_minutes, status, ot_minutes, manual_override")
      .eq("worker_id", workerId)
      .gte("date", period.from)
      .lte("date", period.to)
      .order("date"),
    getPayroll(supabase, period),
  ]);
  if (worker.error) throw worker.error;
  if (logs.error) throw logs.error;
  // RLS hides other owners' workers, so this is also the ownership check.
  if (!worker.data) notFound();

  const w = worker.data;
  // payroll_report() skips inactive workers with nothing in the period.
  const p: PayrollRow =
    payroll.find((r) => r.worker_id === w.id) ??
    ({
      worker_id: w.id,
      worker_name: w.name,
      wage_type: w.wage_type,
      days_present: 0,
      half_days: 0,
      absent_days: 0,
      open_punches: 0,
      worked_hours: 0,
      ot_hours: 0,
      base_pay: 0,
      ot_pay: 0,
      gross_pay: 0,
      advances_total: 0,
      net_payable: 0,
    } satisfies PayrollRow);

  const money = (n: number | string) => formatMoney(n, settings.currency);
  const tz = settings.timezone;
  const time = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso)) : "—";
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );

  const paidDays = p.days_present + p.half_days / 2;
  const timing = timingLabel(effectiveTiming(w, settings));
  const isOff = (d: string) => isOffDay(d, settings.off_days);
  const otRate = Number(w.ot_rate_per_hour) || (w.wage_type === "hourly" ? Number(w.hourly_rate) : 0);
  const rateText = {
    daily: `${money(w.daily_rate)} / day`,
    hourly: `${money(w.hourly_rate)} / hour`,
    monthly: `${money(w.monthly_salary)} / month`,
  }[w.wage_type];
  const baseText = {
    daily: `${formatHours(paidDays)} days × ${money(w.daily_rate)}`,
    hourly: `${formatHours(Math.max(p.worked_hours - p.ot_hours, 0))} h × ${money(w.hourly_rate)}`,
    monthly: `${formatHours(paidDays)} days of ${money(w.monthly_salary)} / month`,
  }[w.wage_type];

  const shareText = [
    `*Salary slip* – ${settings.business_name}`,
    `${w.name} · ${period.label}`,
    `Present: ${p.days_present}, Half days: ${p.half_days}, OT: ${formatHours(p.ot_hours)} h`,
    `Base pay: ${money(p.base_pay)}, Overtime: ${money(p.ot_pay)}`,
    `*Salary: ${money(p.gross_pay)}*`,
  ].join("\n");
  const waNumber = whatsappNumber(w.phone, settings.currency);
  const waHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost">
          <Link href={`/admin/payroll?${periodQuery(period)}`}>
            <ArrowLeft /> Payroll
          </Link>
        </Button>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <a href={waHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle /> WhatsApp
            </a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <article
        className="slip mx-auto grid w-full grid-cols-1 max-w-[210mm] gap-5 rounded-xl border bg-white p-4 text-neutral-900 sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0"
        data-testid="salary-slip"
      >
        <header className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-neutral-900 pb-3">
          <div>
            <h1 className="text-2xl font-bold">{settings.business_name}</h1>
            <p className="text-sm text-neutral-600">Salary Slip · वेतन पर्ची</p>
          </div>
          <div className="sm:text-right">
            <div className="font-semibold">{period.label}</div>
            <div className="text-sm text-neutral-600">
              {day(period.from)} – {day(period.to)}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <Field label="Employee" value={<span className="text-base font-semibold">{w.name}</span>} />
          <Field label="Phone" value={w.phone ?? "—"} />
          <Field label={`Pay type · ${WAGE_LABEL_HI[w.wage_type]}`} value={`${WAGE_LABEL[w.wage_type]} · ${rateText}`} />
          <Field label="Timing" value={`${timing ?? "No fixed timing"} · OT ${money(otRate)} / h`} />
        </section>

        <section className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
          <Box label="Present" sub="हाज़िर" value={p.days_present} />
          <Box label="Half days" sub="आधा दिन" value={p.half_days} />
          <Box label="Absent" sub="ग़ैरहाज़िर" value={p.absent_days} />
          <Box label="Hours worked" sub="घंटे" value={formatHours(p.worked_hours)} />
          <Box label="OT hours" sub="ओवरटाइम" value={formatHours(p.ot_hours)} />
        </section>

        {p.open_punches > 0 && (
          <p className="rounded-lg border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900">
            {p.open_punches === 1 ? "1 shift is" : `${p.open_punches} shifts are`} still clocked in and not counted on
            this slip.
          </p>
        )}

        <table className="w-full text-sm">
          <caption className="pb-1 text-left font-semibold">Earnings · कमाई</caption>
          <tbody className="divide-y divide-neutral-200">
            <Line label="Base pay" note={baseText} amount={money(p.base_pay)} />
            <Line label="Overtime" note={`${formatHours(p.ot_hours)} h × ${money(otRate)}`} amount={money(p.ot_pay)} />
          </tbody>
        </table>

        <section className="flex items-center justify-between rounded-xl border-2 border-green-600 bg-green-50 p-4">
          <div>
            <div className="text-lg font-bold">Salary</div>
            <div className="text-sm text-neutral-600">कुल वेतन</div>
          </div>
          <div className="text-3xl font-black text-green-700 tabular-nums" data-testid="salary-total">
            {money(p.gross_pay)}
          </div>
        </section>

        <section>
          <h2 className="pb-1 text-sm font-semibold">Daily attendance · रोज़ की हाज़िरी</h2>
          {logs.data.length === 0 ? (
            <p className="text-sm text-neutral-600">No attendance recorded in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-900 text-left">
                <tr>
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 font-medium">In</th>
                  <th className="py-1 font-medium">Out</th>
                  <th className="py-1 text-right font-medium">Hours</th>
                  <th className="hidden py-1 text-right font-medium sm:table-cell print:table-cell">OT</th>
                  <th className="py-1 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {logs.data.map((l) => {
                  const open = !l.manual_override && l.clock_in && !l.clock_out;
                  const off = isOff(l.date);
                  return (
                    <tr key={l.id} className={cn("break-inside-avoid", off && "text-neutral-500")}>
                      <td className="py-1 whitespace-nowrap">{day(l.date)}</td>
                      <td className="py-1 whitespace-nowrap">{l.manual_override && !l.clock_in ? "—" : time(l.clock_in)}</td>
                      <td className="py-1 whitespace-nowrap">{time(l.clock_out)}</td>
                      <td className="py-1 text-right tabular-nums">
                        {l.total_minutes != null ? formatMinutes(l.total_minutes) : "—"}
                      </td>
                      <td className="hidden py-1 text-right tabular-nums sm:table-cell print:table-cell">
                        {l.ot_minutes ? formatMinutes(l.ot_minutes) : "—"}
                      </td>
                      <td
                        className={cn(
                          "py-1 text-right font-medium",
                          open || off ? "text-neutral-500" : STATUS[l.status].className,
                        )}
                      >
                        {open ? "Still in" : off ? "Off day" : STATUS[l.status].label}
                        {l.manual_override && <span className="text-neutral-500"> *</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {logs.data.some((l) => l.manual_override) && (
            <p className="pt-1 text-xs text-neutral-500">* Marked by owner</p>
          )}
          {logs.data.some((l) => isOff(l.date)) && (
            <p className="pt-1 text-xs text-neutral-500">
              Off days ({offDaysLabel(settings.off_days)}) are shown but not counted in the salary.
            </p>
          )}
        </section>

        <footer className="grid grid-cols-2 gap-8 pt-10 text-sm">
          <div className="border-t border-neutral-900 pt-1 text-center">Employer signature</div>
          <div className="border-t border-neutral-900 pt-1 text-center">Employee signature / thumb · अंगूठा</div>
          <p className="col-span-2 text-center text-xs text-neutral-500">Generated on {day(today)}</p>
        </footer>
      </article>
    </div>
  );
}

/** wa.me wants the number with country code and no "+". Unknown formats open the contact picker instead. */
function whatsappNumber(phone: string | null, currency: string) {
  if (!phone) return "";
  if (phone.startsWith("+")) return phone.slice(1);
  if (currency === "INR" && /^\d{10}$/.test(phone)) return `91${phone}`;
  return "";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function Box({ label, sub, value }: { label: string; sub: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-300 p-2">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs">{label}</div>
      <div className="text-xs text-neutral-500">{sub}</div>
    </div>
  );
}

function Line({ label, note, amount }: { label: string; note?: string; amount: string }) {
  return (
    <tr>
      <td className="py-1">
        {label}
        {note && <div className="text-xs font-normal text-neutral-500">{note}</div>}
      </td>
      <td className="py-1 text-right align-top tabular-nums">{amount}</td>
    </tr>
  );
}
