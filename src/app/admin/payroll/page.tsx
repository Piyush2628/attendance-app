import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Payroll" };

export default function PayrollPage() {
  return (
    <ComingSoon title="Payroll" step={4}>
      Month or date-range report from the payroll_report RPC: days present, half days, OT hours,
      gross pay, advances and net payable.
    </ComingSoon>
  );
}
