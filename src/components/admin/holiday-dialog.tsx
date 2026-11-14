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
            Holidays are paid. Nobody is marked absent on one.
          </DialogDescription>
        </DialogHeader>
        {open && <HolidayForm {...props} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function HolidayForm({ holiday, date, onDone }: Props & { onDone: () => void }) {
  const [state, action, pending] = useFormAction<HolidayState>(saveHoliday, {});
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, state.savedAt, onDone]);

  return (
    <form onSubmit={action} className="grid gap-4" data-testid="holiday-form">
      {holiday && <input type="hidden" name="original_date" value={holiday.date} />}

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

      <p className="text-muted-foreground bg-muted/60 rounded-lg p-3 text-xs">
        Paid as one day to every employee: daily rate, one day of monthly salary, or one shift for hourly staff.
        Nobody is marked absent. A holiday on an off day adds nothing.
      </p>

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
