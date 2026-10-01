"use client";

import { useEffect, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { deleteDay, saveDay, type DayState } from "@/app/admin/attendance/actions";
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
import { zonedTimeInput } from "@/lib/timing";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";
import type { AttendanceLog, AttendanceStatus } from "@/types/database";

type DayLog = Pick<AttendanceLog, "id" | "date" | "clock_in" | "clock_out" | "status" | "manual_override" | "notes">;

type Props = {
  workerId: string;
  workerName: string;
  timeZone: string;
  today: string;
  /** The day to edit; without it the dialog adds a new day. */
  log?: DayLog;
  /** Pre-filled date when adding. */
  date?: string;
  /** Icon-only trigger, for tight rows. */
  compact?: boolean;
};

const STATUS_OPTIONS: { value: AttendanceStatus | "auto"; label: string }[] = [
  { value: "auto", label: "From hours" },
  { value: "present", label: "Present" },
  { value: "half_day", label: "Half day" },
  { value: "absent", label: "Absent" },
];

function dayLabel(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** Owner adds, corrects or deletes one attendance day of an employee. */
export function EditDayDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const { log, compact } = props;
  const label = log ? "Edit" : "Add day";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={log ? "ghost" : "outline"}
          size={compact ? "icon" : "sm"}
          aria-label={compact ? (log ? `Edit ${log.date}` : `Add ${props.date ?? "a day"}`) : undefined}
          className={cn(compact && "size-8 shrink-0")}
        >
          {log ? <Pencil /> : <Plus />}
          {!compact && label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{log ? `Edit ${dayLabel(log.date)}` : `Add attendance for ${props.workerName}`}</DialogTitle>
          <DialogDescription>
            Times are in your business time zone. An out time earlier than the in time counts as the next morning.
          </DialogDescription>
        </DialogHeader>
        {open && <DayForm {...props} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function DayForm({ workerId, timeZone, today, log, date, onDone }: Props & { onDone: () => void }) {
  const [state, action, pending] = useFormAction<DayState>(saveDay, {});
  const [status, setStatus] = useState<AttendanceStatus | "auto">(log?.manual_override ? log.status : "auto");
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, state.savedAt, onDone]);

  return (
    <form onSubmit={action} className="grid gap-4" data-testid="edit-day">
      <input type="hidden" name="worker_id" value={workerId} />
      <input type="hidden" name="status" value={status} />
      {log && <input type="hidden" name="log_id" value={log.id} />}
      {log ? (
        <input type="hidden" name="date" value={log.date} />
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="day-date">Date</Label>
          <Input id="day-date" name="date" type="date" max={today} defaultValue={date ?? today} required />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="day-in">In</Label>
          <Input id="day-in" name="in" type="time" defaultValue={zonedTimeInput(log?.clock_in, timeZone)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="day-out">Out</Label>
          <Input id="day-out" name="out" type="time" defaultValue={zonedTimeInput(log?.clock_out, timeZone)} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Status</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={status === o.value}
              onClick={() => setStatus(o.value)}
              className={cn(
                "rounded-lg border p-2 text-sm font-medium",
                status === o.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          {status === "auto"
            ? "Full day, half day or absent is worked out from the hours."
            : "Your choice is kept whatever the hours say."}
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="day-notes">Note (optional)</Label>
        <Input id="day-notes" name="notes" defaultValue={log?.notes ?? ""} maxLength={500} />
      </div>

      {(state.error || deleteError) && (
        <p role="alert" className="text-destructive text-sm">
          {state.error ?? deleteError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {log ? (
          <Button
            type="button"
            variant={confirmDelete ? "destructive" : "ghost"}
            className={cn(!confirmDelete && "text-destructive")}
            disabled={deleting || pending}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              startDelete(async () => {
                const res = await deleteDay(log.id);
                if (res.error) setDeleteError(res.error);
                else onDone();
              });
            }}
          >
            <Trash2 /> {confirmDelete ? "Tap again to delete" : "Delete day"}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending || deleting}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
