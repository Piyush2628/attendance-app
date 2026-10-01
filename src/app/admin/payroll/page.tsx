import Link from "next/link";
import { AlertTriangle, FileText } from "lucide-react";

import { PeriodPicker } from "@/components/payroll/period-picker";
import { PrintButton } from "@/components/payroll/print-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/admin/data";
import { formatHours, getPayroll, payrollTotals, WAGE_LABEL } from "@/lib/admin/payroll";
import { parsePeriod, periodQuery } from "@/lib/admin/period";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Payroll" };

export default async function PayrollPage({ searchParams }: PageProps<"/admin/payroll">) {
  const { supabase, settings, today } = await requireOwner();
  const period = parsePeriod(await searchParams, today);
  const rows = await getPayroll(supabase, period);
  const totals = payrollTotals(rows);
  const money = (n: number) => formatMoney(n, settings.currency);
  const slipHref = (workerId: string) => `/admin/payroll/${workerId}?${periodQuery(period)}`;

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-muted-foreground text-sm">
            <span className="no-print">Salary for each worker, after advances (udhari).</span>
            <span className="hidden print:inline">
              {settings.business_name} · {period.label}
            </span>
          </p>
        </div>
        <div className="no-print">
          <PrintButton />
        </div>
      </div>

      <PeriodPicker path="/admin/payroll" period={period} today={today} />

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Gross pay" value={money(totals.gross)} />
        <Stat label="Advances" value={money(totals.advances)} />
        <Stat label="Net payable" value={money(totals.net)} strong />
      </div>

      {totals.openPunches > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {totals.openPunches === 1 ? "1 shift is" : `${totals.openPunches} shifts are`} still clocked in and not
          counted yet. Clock them out from the Today page to include them.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          No workers yet. Add workers to see their salary here.
        </p>
      ) : (
        <>
          {/* Phone: one card per worker */}
          <ul className="grid gap-2 md:hidden print:hidden" data-testid="payroll-cards">
            {rows.map((r) => (
              <li key={r.worker_id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{r.worker_name}</div>
                    <Badge variant="outline">{WAGE_LABEL[r.wage_type]}</Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground text-xs">Net payable</div>
                    <div className={cn("text-xl font-bold", r.net_payable < 0 && "text-punch-out")}>
                      {money(r.net_payable)}
                    </div>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <Cell label="Present" value={r.days_present} />
                  <Cell label="Half days" value={r.half_days} />
                  <Cell label="OT hours" value={formatHours(r.ot_hours)} />
                  <Cell label="Gross" value={money(r.gross_pay)} />
                  <Cell label="Advances" value={r.advances_total ? `− ${money(r.advances_total)}` : money(0)} />
                  <div className="flex items-end justify-end">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={slipHref(r.worker_id)}>
                        <FileText /> Slip
                      </Link>
                    </Button>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {/* Tablet, desktop and print: table */}
          <div className="hidden overflow-x-auto rounded-xl border md:block print:block">
            <table className="w-full text-sm" data-testid="payroll-table">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2 font-medium">Worker Name</th>
                  <th className="p-2 font-medium">Type</th>
                  <th className="p-2 text-right font-medium">Days Present</th>
                  <th className="p-2 text-right font-medium">Half Days</th>
                  <th className="p-2 text-right font-medium">OT Hours</th>
                  <th className="p-2 text-right font-medium">Gross Pay</th>
                  <th className="p-2 text-right font-medium">Advances Deducted</th>
                  <th className="p-2 text-right font-medium">Net Payable</th>
                  <th className="no-print p-2 font-medium">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.worker_id}>
                    <td className="p-2 font-medium">{r.worker_name}</td>
                    <td className="p-2">{WAGE_LABEL[r.wage_type]}</td>
                    <td className="p-2 text-right tabular-nums">{r.days_present}</td>
                    <td className="p-2 text-right tabular-nums">{r.half_days}</td>
                    <td className="p-2 text-right tabular-nums">{formatHours(r.ot_hours)}</td>
                    <td className="p-2 text-right tabular-nums">{money(r.gross_pay)}</td>
                    <td className="p-2 text-right tabular-nums">
                      {r.advances_total ? `− ${money(r.advances_total)}` : "—"}
                    </td>
                    <td
                      className={cn(
                        "p-2 text-right font-semibold tabular-nums",
                        r.net_payable < 0 && "text-punch-out",
                      )}
                    >
                      {money(r.net_payable)}
                    </td>
                    <td className="no-print p-2 text-right">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={slipHref(r.worker_id)}>
                          <FileText /> Slip
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/50 font-semibold">
                <tr>
                  <td className="p-2" colSpan={5}>
                    Total
                  </td>
                  <td className="p-2 text-right tabular-nums">{money(totals.gross)}</td>
                  <td className="p-2 text-right tabular-nums">{money(totals.advances)}</td>
                  <td className="p-2 text-right tabular-nums">{money(totals.net)}</td>
                  <td className="no-print" />
                </tr>
              </tfoot>
            </table>
          </div>
          {rows.some((r) => r.net_payable < 0) && (
            <p className="text-muted-foreground text-sm">
              A negative net means the advances are more than the salary for this period; the worker still owes the
              difference.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", strong && "border-punch-in bg-punch-in/10")}>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={cn("truncate font-bold tabular-nums", strong ? "text-lg" : "text-base")}>{value}</div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
