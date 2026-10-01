import "server-only";

import type { Period } from "@/lib/admin/period";
import type { createClient } from "@/lib/supabase/server";
import type { PayrollRow, WageType } from "@/types/database";

type Client = Awaited<ReturnType<typeof createClient>>;

const NUMERIC_KEYS = [
  "days_present",
  "half_days",
  "absent_days",
  "open_punches",
  "worked_hours",
  "ot_hours",
  "base_pay",
  "ot_pay",
  "gross_pay",
  "advances_total",
  "net_payable",
] as const satisfies (keyof PayrollRow)[];

/** payroll_report() rows, with Postgres numerics coerced to numbers. */
export async function getPayroll(supabase: Client, period: Pick<Period, "from" | "to">) {
  const { data, error } = await supabase.rpc("payroll_report", { p_start: period.from, p_end: period.to });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const out = { ...row };
    for (const key of NUMERIC_KEYS) out[key] = Number(row[key] ?? 0);
    return out;
  });
}

export function payrollTotals(rows: PayrollRow[]) {
  return rows.reduce(
    (t, r) => ({
      gross: t.gross + r.gross_pay,
      advances: t.advances + r.advances_total,
      net: t.net + r.net_payable,
      openPunches: t.openPunches + r.open_punches,
    }),
    { gross: 0, advances: 0, net: 0, openPunches: 0 },
  );
}

export const WAGE_LABEL: Record<WageType, string> = {
  daily: "Daily",
  hourly: "Hourly",
  monthly: "Monthly",
};

export const WAGE_LABEL_HI: Record<WageType, string> = {
  daily: "दिहाड़ी",
  hourly: "घंटे",
  monthly: "महीना",
};

/** 8.5 -> "8.5", 8 -> "8" */
export function formatHours(hours: number) {
  return String(Math.round(hours * 100) / 100);
}
