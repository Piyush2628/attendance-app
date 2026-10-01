import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { WorkerActiveToggle } from "@/components/admin/worker-active-toggle";
import { WorkerFormDialog } from "@/components/admin/worker-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkerAvatar } from "@/components/worker-avatar";
import { requireOwner } from "@/lib/admin/data";
import { formatMoney } from "@/lib/format";
import { timingLabel } from "@/lib/timing";
import type { Worker } from "@/types/database";

export const metadata = { title: "Employees" };

function payLine(w: Worker) {
  const base =
    w.wage_type === "daily"
      ? `${formatMoney(w.daily_rate)}/day`
      : w.wage_type === "hourly"
        ? `${formatMoney(w.hourly_rate)}/hour`
        : `${formatMoney(w.monthly_salary)}/month`;
  const ot = Number(w.ot_rate_per_hour) > 0 ? ` · OT ${formatMoney(w.ot_rate_per_hour)}/h` : "";
  return `${base}${ot}`;
}

export default async function WorkersPage() {
  const { supabase, settings } = await requireOwner();
  const { data: workers, error } = await supabase
    .from("workers")
    .select("id, owner_id, name, phone, photo_url, wage_type, daily_rate, hourly_rate, monthly_salary, standard_shift_hours, ot_rate_per_hour, is_active, created_at, work_start, work_end")
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw error;

  const businessTiming = timingLabel(settings);
  const active = workers.filter((w) => w.is_active);
  const inactive = workers.filter((w) => !w.is_active);

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-muted-foreground text-sm">{active.length} active</p>
        </div>
        <WorkerFormDialog ownerId={settings.owner_id} businessTiming={businessTiming} />
      </div>

      {workers.length === 0 && (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          Add your first employee to get started.
        </p>
      )}

      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {active.map((w) => (
          <WorkerCard key={w.id} worker={w} ownerId={settings.owner_id} businessTiming={businessTiming} />
        ))}
      </ul>

      {inactive.length > 0 && (
        <details className="mt-4">
          <summary className="text-muted-foreground cursor-pointer text-sm">
            Inactive employees ({inactive.length})
          </summary>
          <ul className="mt-2 grid grid-cols-1 gap-2 opacity-70 md:grid-cols-2">
            {inactive.map((w) => (
              <WorkerCard key={w.id} worker={w} ownerId={settings.owner_id} businessTiming={businessTiming} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function WorkerCard({
  worker,
  ownerId,
  businessTiming,
}: {
  worker: Worker;
  ownerId: string;
  businessTiming: string | null;
}) {
  const ownTiming = timingLabel(worker);
  return (
    <li className="bg-card flex items-center gap-3 rounded-xl border p-3">
      <WorkerAvatar name={worker.name} photoUrl={worker.photo_url} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{worker.name}</span>
          <Badge variant="secondary" className="capitalize">
            {worker.wage_type}
          </Badge>
        </div>
        <div className="text-muted-foreground truncate text-sm">{payLine(worker)}</div>
        {ownTiming && (
          <div className="text-muted-foreground truncate text-xs" data-testid="own-timing">
            Own timing {ownTiming}
          </div>
        )}
        {worker.phone && <div className="text-muted-foreground text-xs">{worker.phone}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex gap-1">
          <Button asChild variant="outline" size="sm" aria-label={`Attendance of ${worker.name}`}>
            <Link href={`/admin/attendance?e=${worker.id}`} prefetch={false}>
              <CalendarDays />
            </Link>
          </Button>
          <WorkerFormDialog ownerId={ownerId} worker={worker} businessTiming={businessTiming} />
        </div>
        <WorkerActiveToggle workerId={worker.id} active={worker.is_active} name={worker.name} />
      </div>
    </li>
  );
}
