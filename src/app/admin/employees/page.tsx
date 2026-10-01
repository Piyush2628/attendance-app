import { WorkerActiveToggle } from "@/components/admin/worker-active-toggle";
import { WorkerFormDialog } from "@/components/admin/worker-form-dialog";
import { Badge } from "@/components/ui/badge";
import { WorkerAvatar } from "@/components/worker-avatar";
import { requireOwner } from "@/lib/admin/data";
import { formatMoney } from "@/lib/format";
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
  return `${base} · ${Number(w.standard_shift_hours)}h shift${ot}`;
}

export default async function WorkersPage() {
  const { supabase, settings } = await requireOwner();
  const { data: workers, error } = await supabase
    .from("workers")
    .select("id, owner_id, name, phone, photo_url, wage_type, daily_rate, hourly_rate, monthly_salary, standard_shift_hours, ot_rate_per_hour, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw error;

  const active = workers.filter((w) => w.is_active);
  const inactive = workers.filter((w) => !w.is_active);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="text-muted-foreground text-sm">{active.length} active</p>
        </div>
        <WorkerFormDialog ownerId={settings.owner_id} />
      </div>

      {workers.length === 0 && (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">
          Add your first employee to get started.
        </p>
      )}

      <ul className="grid gap-2 md:grid-cols-2">
        {active.map((w) => (
          <WorkerCard key={w.id} worker={w} ownerId={settings.owner_id} />
        ))}
      </ul>

      {inactive.length > 0 && (
        <details className="mt-4">
          <summary className="text-muted-foreground cursor-pointer text-sm">
            Inactive employees ({inactive.length})
          </summary>
          <ul className="mt-2 grid gap-2 opacity-70 md:grid-cols-2">
            {inactive.map((w) => (
              <WorkerCard key={w.id} worker={w} ownerId={settings.owner_id} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function WorkerCard({ worker, ownerId }: { worker: Worker; ownerId: string }) {
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
        {worker.phone && <div className="text-muted-foreground text-xs">{worker.phone}</div>}
      </div>
      <div className="flex flex-col items-end gap-1">
        <WorkerFormDialog ownerId={ownerId} worker={worker} />
        <WorkerActiveToggle workerId={worker.id} active={worker.is_active} name={worker.name} />
      </div>
    </li>
  );
}
