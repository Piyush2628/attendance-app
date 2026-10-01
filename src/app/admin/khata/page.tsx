import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { AdvanceForm } from "@/components/admin/advance-form";
import { DeleteAdvanceButton } from "@/components/admin/delete-advance-button";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/admin/data";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Khata" };

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function KhataPage({ searchParams }: PageProps<"/admin/khata">) {
  const { supabase, today } = await requireOwner();
  const { m } = await searchParams;
  const month = typeof m === "string" && /^\d{4}-\d{2}$/.test(m) ? m : today.slice(0, 7);
  const start = `${month}-01`;
  const end = `${shiftMonth(month, 1)}-01`;

  const [workers, advances] = await Promise.all([
    supabase.from("workers").select("id, name, is_active").order("name"),
    supabase
      .from("advances")
      .select("id, worker_id, date, amount, notes, created_at")
      .gte("date", start)
      .lt("date", end)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (workers.error) throw workers.error;
  if (advances.error) throw advances.error;

  const names = new Map(workers.data.map((w) => [w.id, w.name]));
  const totals = new Map<string, number>();
  for (const a of advances.data) totals.set(a.worker_id, (totals.get(a.worker_id) ?? 0) + Number(a.amount));
  const grandTotal = [...totals.values()].reduce((s, v) => s + v, 0);

  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${start}T00:00:00Z`),
  );
  const isCurrent = month === today.slice(0, 7);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Khata</h1>
        <p className="text-muted-foreground text-sm">Cash advances (udhari). They are taken off the salary.</p>
      </div>

      <AdvanceForm workers={workers.data.filter((w) => w.is_active)} today={today} />

      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="icon" aria-label="Previous month">
          <Link href={`/admin/khata?m=${shiftMonth(month, -1)}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <div className="text-center">
          <div className="font-semibold">{monthLabel}</div>
          <div className="text-muted-foreground text-sm">Total given: {formatMoney(grandTotal)}</div>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Next month" disabled={isCurrent}>
          <Link href={`/admin/khata?m=${shiftMonth(month, 1)}`} aria-disabled={isCurrent} className={isCurrent ? "pointer-events-none opacity-30" : ""}>
            <ChevronRight />
          </Link>
        </Button>
      </div>

      {totals.size > 0 && (
        <ul className="flex flex-wrap gap-2">
          {[...totals.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([id, total]) => (
              <li key={id} className="bg-muted rounded-full px-3 py-1 text-sm">
                {names.get(id) ?? "?"}: <span className="font-semibold">{formatMoney(total)}</span>
              </li>
            ))}
        </ul>
      )}

      {advances.data.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">No advances this month.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {advances.data.map((a) => {
            const name = names.get(a.worker_id) ?? "?";
            const dateLabel = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
              new Date(`${a.date}T00:00:00Z`),
            );
            return (
              <li key={a.id} className="flex items-center gap-3 p-3">
                <div className="text-muted-foreground w-14 shrink-0 text-sm">{dateLabel}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{name}</div>
                  {a.notes && <div className="text-muted-foreground truncate text-sm">{a.notes}</div>}
                </div>
                <div className="font-semibold">{formatMoney(a.amount)}</div>
                <DeleteAdvanceButton id={a.id} label={`${formatMoney(a.amount)} advance to ${name}`} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
