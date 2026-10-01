"use client";

import { useEffect, useState } from "react";
import { Pencil, UserPlus } from "lucide-react";

import { saveWorker, type SaveWorkerState } from "@/app/admin/employees/actions";
import { PhotoPicker } from "@/components/admin/photo-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { timeInputValue } from "@/lib/timing";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import type { WageType, Worker } from "@/types/database";

const WAGE_OPTIONS: { value: WageType; label: string; hint: string }[] = [
  { value: "daily", label: "Daily", hint: "Dihari" },
  { value: "hourly", label: "Hourly", hint: "Per hour" },
  { value: "monthly", label: "Monthly", hint: "Salary" },
];

type FormProps = {
  ownerId: string;
  worker?: Worker;
  /** "10:30 AM – 7:30 PM", or null when the business has no timing. */
  businessTiming: string | null;
};

export function WorkerFormDialog(props: FormProps) {
  const { worker } = props;
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {worker ? (
          <Button variant="outline" size="sm">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button size="lg">
            <UserPlus /> Add employee
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{worker ? `Edit ${worker.name}` : "Add employee"}</DialogTitle>
          <DialogDescription>
            {worker ? "Leave PIN empty to keep the current one." : "The employee uses the PIN to clock in and out."}
          </DialogDescription>
        </DialogHeader>
        {/* Re-mount on open so the form starts fresh each time. */}
        {open && <WorkerForm {...props} onSaved={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function WorkerForm({ ownerId, worker, businessTiming, onSaved }: FormProps & { onSaved: () => void }) {
  const [state, action, pending] = useFormAction<SaveWorkerState>(saveWorker, {});
  const [ownTiming, setOwnTiming] = useState(Boolean(worker?.work_start));
  const [wageType, setWageType] = useState<WageType>(worker?.wage_type ?? "daily");
  const [name, setName] = useState(worker?.name ?? "");

  useEffect(() => {
    if (state.ok) onSaved();
  }, [state.ok, state.savedAt, onSaved]);

  return (
    <form onSubmit={action} className="grid gap-4">
      {worker && <input type="hidden" name="id" value={worker.id} />}
      <input type="hidden" name="wage_type" value={wageType} />

      <PhotoPicker ownerId={ownerId} name={name} defaultUrl={worker?.photo_url} />

      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" htmlFor="phone" hint="For login on their own phone">
          <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={worker?.phone ?? ""} />
        </Field>
        <Field label={worker ? "New PIN" : "PIN"} htmlFor="pin" hint="4 digits">
          <Input
            id="pin"
            name="pin"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="off"
            placeholder={worker ? "••••" : ""}
            required={!worker}
            className="font-mono tracking-[0.5em]"
          />
        </Field>
      </div>

      <div className="grid gap-2">
        <Label>Pay type</Label>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {WAGE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={wageType === o.value}
              onClick={() => setWageType(o.value)}
              className={cn(
                "rounded-lg border p-2 text-center",
                wageType === o.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <div className="font-semibold">{o.label}</div>
              <div className="text-xs opacity-80">{o.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* All three are always submitted so switching type keeps the other values. */}
        <Field label="Daily rate (₹)" htmlFor="daily_rate" hidden={wageType !== "daily"}>
          <MoneyInput id="daily_rate" defaultValue={worker?.daily_rate} />
        </Field>
        <Field label="Hourly rate (₹)" htmlFor="hourly_rate" hidden={wageType !== "hourly"}>
          <MoneyInput id="hourly_rate" defaultValue={worker?.hourly_rate} />
        </Field>
        <Field label="Monthly salary (₹)" htmlFor="monthly_salary" hidden={wageType !== "monthly"}>
          <MoneyInput id="monthly_salary" defaultValue={worker?.monthly_salary} />
        </Field>
        <Field label="Overtime rate (₹/hour)" htmlFor="ot_rate_per_hour" hint="0 = no overtime pay">
          <MoneyInput id="ot_rate_per_hour" defaultValue={worker?.ot_rate_per_hour} />
        </Field>
      </div>

      <div className="grid gap-2 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={ownTiming}
            onChange={(e) => setOwnTiming(e.target.checked)}
            className="accent-primary size-5"
          />
          Different work timing (part time)
        </label>
        {ownTiming ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start" htmlFor="work_start">
              <Input id="work_start" name="work_start" type="time" defaultValue={timeInputValue(worker?.work_start)} />
            </Field>
            <Field label="End" htmlFor="work_end">
              <Input id="work_end" name="work_end" type="time" defaultValue={timeInputValue(worker?.work_end)} />
            </Field>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            {businessTiming
              ? `Uses the business timing, ${businessTiming}.`
              : "No fixed timing: any day they clock in and out counts as a full day."}
          </p>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : worker ? "Save changes" : "Add employee"}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  hidden,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", hidden && "hidden")}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  );
}

function MoneyInput({ id, defaultValue }: { id: string; defaultValue?: number }) {
  return (
    <Input
      id={id}
      name={id}
      type="number"
      inputMode="decimal"
      min="0"
      step="any"
      defaultValue={defaultValue ? String(defaultValue) : ""}
      placeholder="0"
    />
  );
}
