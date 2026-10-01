import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Salary slip" };

export default async function SalarySlipPage({ params }: PageProps<"/admin/payroll/[workerId]">) {
  const { workerId } = await params;
  return (
    <ComingSoon title="Salary slip" step={4}>
      Printable A4 / mobile slip for worker {workerId}.
    </ComingSoon>
  );
}
