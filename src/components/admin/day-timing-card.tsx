"use client";

import { useState } from "react";
import { Clock } from "lucide-react";

import { saveDayTiming, type SettingsState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { timeInputValue, timingLabel } from "@/lib/timing";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import type { DayTiming } from "@/types/database";

type Timing = { work_start: string | null; work_end: string | null };

/**
 * The timing for one date: the usual business timing, or a special one the owner set
 * (e.g. 11:30 to 5:00). Present / half day for that date are worked out from it.
 */
export function DayTimingCard({
  date,
  dayTiming,
  usual,
}: {
  date: string;
  dayTiming: Pick<DayTiming, "work_start" | "work_end"> | null;
  usual: Timing;
}) {
  const [state, action, pending] = useFormAction<SettingsState>(saveDayTiming, {});
  const [open, setOpen] = useState(false);
  const shown = dayTiming ?? usual;
  const [start, setStart] = useState(timeInputValue(shown.work_start));
  const [end, setEnd] = useState(timeInputValue(shown.work_end));

  // Close the form once a save goes through (state adjusted during render, not in an effect).
  const [seenSave, setSeenSave] = useState(state.savedAt);
  if (state.savedAt !== seenSave) {
    setSeenSave(state.savedAt);
    if (state.ok) setOpen(false);
  }

  const label = timingLabel(shown);
  const clearId = `day-timing-clear-${date}`;

  return (
    <div
      className={cn("rounded-xl border p-3", dayTiming && "border-amber-500/60 bg-amber-500/10")}
      data-testid="day-timing"
    >
      <div className="flex items-center gap-2">
        <Clock className="text-muted-foreground size-4 shrink-0" />
        <p className="min-w-0 flex-1 text-sm">
          {dayTiming ? (
            <>
              <span className="font-semibold">Special timing:</span> {label}
            </>
          ) : label ? (
            <>
              <span className="font-semibold">Timing:</span> {label}
            </>
          ) : (
            <span className="text-muted-foreground">No fixed timing</span>
          )}
        </p>
        {!open && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setStart(timeInputValue(shown.work_start));
              setEnd(timeInputValue(shown.work_end));
              setOpen(true);
            }}
          >
            Change
          </Button>
        )}
      </div>

      {/* Submitting only the date removes the special timing. */}
      <form id={clearId} onSubmit={action} hidden>
        <input type="hidden" name="date" value={date} />
      </form>
      {open && (
        <form onSubmit={action} className="mt-3 grid gap-3">
          <input type="hidden" name="date" value={date} />
          <p className="text-muted-foreground text-xs">
            Only for this day. Present and half day are worked out from this timing. Employees with their own timing
            keep the part of it inside these hours.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`day_start_${date}`}>Start</Label>
              <Input
                id={`day_start_${date}`}
                name="work_start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`day_end_${date}`}>End</Label>
              <Input
                id={`day_end_${date}`}
                name="work_end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dayTiming && (
              <Button type="submit" form={clearId} variant="ghost" size="sm" disabled={pending} className="mr-auto">
                Use usual timing
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || !start || !end}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
          {state.error && (
            <p role="alert" className="text-destructive text-sm">
              {state.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
