"use client";

import { useState } from "react";
import { Clock } from "lucide-react";

import { saveWorkTimings, type SettingsState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { timeInputValue, WEEKDAYS } from "@/lib/timing";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import type { OwnerSettings } from "@/types/database";

/** Optional business timing, and which weekdays are left out of salary. */
export function WorkTimingsCard({
  settings,
}: {
  settings: Pick<OwnerSettings, "work_start" | "work_end" | "off_days">;
}) {
  const [state, action, pending] = useFormAction<SettingsState>(saveWorkTimings, {});
  const [start, setStart] = useState(timeInputValue(settings.work_start));
  const [end, setEnd] = useState(timeInputValue(settings.work_end));
  const [offDays, setOffDays] = useState<number[]>(settings.off_days);

  return (
    <form onSubmit={action} className="bg-card grid gap-4 rounded-xl border p-4" data-testid="work-timings">
      <div className="flex items-start gap-3">
        <Clock className="text-muted-foreground mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Work timings</div>
          <p className="text-muted-foreground text-sm">
            Optional. With a timing set, the app marks late arrivals, half days and overtime. Without one, any day an
            employee clocks in and out counts as a full day. Part-timers can have their own timing on the Employees
            page.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="work_start">Start</Label>
          <Input id="work_start" name="work_start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="work_end">End</Label>
          <Input id="work_end" name="work_end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      {(start || end) && (
        <button
          type="button"
          className="text-muted-foreground -mt-2 justify-self-start text-xs underline"
          onClick={() => {
            setStart("");
            setEnd("");
          }}
        >
          No fixed timing
        </button>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Off days (recorded, but not paid)</legend>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((label, d) => {
            const on = offDays.includes(d);
            return (
              <label
                key={label}
                className={cn(
                  "cursor-pointer rounded-lg border py-2 text-center text-sm font-medium select-none",
                  on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                <input
                  type="checkbox"
                  name="off_days"
                  value={d}
                  checked={on}
                  onChange={() => setOffDays(on ? offDays.filter((x) => x !== d) : [...offDays, d])}
                  className="sr-only"
                />
                {label}
              </label>
            );
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          Punches on these days still show in attendance but are left out of the salary.
        </p>
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.ok && !pending && <p className="text-sm text-emerald-700">Work timings saved.</p>}
    </form>
  );
}
