import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { periodQuery, shiftMonth, type Period } from "@/lib/admin/period";

/** Month arrows plus a custom from/to range. Navigates with ?from=&to= on `path`. */
export function PeriodPicker({ path, period, today }: { path: string; period: Period; today: string }) {
  const prev = shiftMonth(period, -1);
  const next = shiftMonth(period, 1);
  const nextIsFuture = next.from > today;

  return (
    <div className="no-print grid gap-3 rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="icon" aria-label="Previous month">
          <Link href={`${path}?${periodQuery(prev)}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <div className="text-center text-lg font-semibold" data-testid="period-label">
          {period.label}
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Next month">
          <Link
            href={`${path}?${periodQuery(next)}`}
            aria-disabled={nextIsFuture}
            tabIndex={nextIsFuture ? -1 : undefined}
            className={nextIsFuture ? "pointer-events-none opacity-30" : ""}
          >
            <ChevronRight />
          </Link>
        </Button>
      </div>
      <Form key={periodQuery(period)} action={path} className="flex flex-wrap items-end gap-2">
        <div className="grid flex-1 gap-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={period.from} required className="min-w-36" />
        </div>
        <div className="grid flex-1 gap-1">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={period.to} required className="min-w-36" />
        </div>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </Form>
    </div>
  );
}
