"use client";

import { useEffect, useState, useTransition } from "react";
import { Flag, Pencil, Plus, Trash2 } from "lucide-react";

import { addNationalHolidays, deleteHoliday, saveHoliday, type HolidayState } from "@/app/admin/holidays/actions";
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
import { HOLIDAY_SUGGESTIONS, type HolidayInfo } from "@/lib/holidays";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

type Props = {
  /** The holiday to edit; without it the dialog adds one. */
  holiday?: HolidayInfo;
  /** Pre-filled date when adding. */
  date?: string;
  /** Icon-only trigger, for list rows. */
  compact?: boolean;
};

/** Add, change or delete a holiday. */
export function HolidayDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const { holiday, compact } = props;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {holiday ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Change ${holiday.name}`}
            className={cn(compact && "size-8 shrink-0")}
          >
            <Pencil />
          </Button>
        ) : (
          <Button size={compact ? "sm" : "default"}>
            <Plus /> Add holiday
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{holiday ? `Change ${holiday.name}` : "Add a holiday"}</DialogTitle>
          <DialogDescription>
            Nobody is marked absent on a holiday. A paid holiday is paid as one day to every employee.
          </DialogDescription>
        </DialogHeader>
        {open && <HolidayForm {...props} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function HolidayForm({ holiday, date, onDone }: Props & { onDone: () => void }) {
  const [state, action, pending] = useFormAction<HolidayState>(saveHoliday, {});
  const [paid, setPaid] = useState(holiday?.paid ?? true);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, state.savedAt, onDone]);

  return (
    <form onSubmit={action} className="grid gap-4" data-testid="holiday-form">
      {holiday && <input type="hidden" name="original_date" value={holiday.date} />}
      <input type="hidden" name="paid" value={String(paid)} />

      <div className="grid gap-1.5">
        <Label htmlFor="holiday-date">Date</Label>
        <Input id="holiday-date" name="date" type="date" defaultValue={holiday?.date ?? date} required />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="holiday-name">Name</Label>
        <Input
          id="holiday-name"
          name="name"
          defaultValue={holiday?.name ?? ""}
          placeholder="Diwali"
          list="holiday-names"
          maxLength={60}
          autoComplete="off"
          required
        />
        <datalist id="holiday-names">
          {HOLIDAY_SUGGESTIONS.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      <div className="grid gap-2">
        <Label>Pay</Label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pay">
          {[
            { value: true, label: "Paid", hint: "Everyone gets a day's pay" },
            { value: false, label: "Unpaid", hint: "Day off, no pay" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={paid === o.value}
              onClick={() => setPaid(o.value)}
              className={cn(
                "rounded-lg border p-2 text-left",
                paid === o.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <div className="text-sm font-semibold">{o.label}</div>
              <div className={cn("text-xs", paid === o.value ? "opacity-80" : "text-muted-foreground")}>{o.hint}</div>
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Daily staff get their daily rate, monthly staff one day of salary, hourly staff one shift. Punches on a
          holiday are kept but not paid on top. A holiday on an off day adds nothing.
        </p>
      </div>

      {(state.error || deleteError) && (
        <p role="alert" className="text-destructive text-sm">
          {state.error ?? deleteError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {holiday ? (
          <Button
            type="button"
            variant={confirmDelete ? "destructive" : "ghost"}
            className={cn(!confirmDelete && "text-destructive")}
            disabled={deleting || pending}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              startDelete(async () => {
                const res = await deleteHoliday(holiday.date);
                if (res.error) setDeleteError(res.error);
                else onDone();
              });
            }}
          >
            <Trash2 /> {confirmDelete ? "Tap again to delete" : "Delete"}
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

/** One tap to add Republic Day, Independence Day and Gandhi Jayanti for a year. */
export function NationalHolidaysButton({ year, missing }: { year: number; missing: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await addNationalHolidays(year);
            setError(res.error ?? null);
          })
        }
      >
        <Flag /> {pending ? "Adding…" : `Add ${missing}`}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
