import Form from "next/form";
import Link from "next/link";
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { periodQuery, shiftMonth, type Period } from "@/lib/admin/period";

/**
 * Month arrows, plus "Choose dates" that opens a from/to form (open already when the
 * period isn't a whole month). Navigates with ?from=&to= on `path`.
 */
export function PeriodPicker({ path, period, today }: { path: string; period: Period; today: string }) {
  const prev = shiftMonth(period, -1);
  const next = shiftMonth(period, 1);
  const nextIsFuture = next.from > today;

  return (
    <div className="no-print bg-card rounded-xl border">
      <div className="flex items-center justify-between p-1">
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
      <details key={periodQuery(period)} open={!period.isMonth} className="group border-t">
        <summary className="text-muted-foreground flex cursor-pointer list-none items-center justify-center gap-1.5 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <CalendarRange className="size-4" /> Choose dates
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <Form action={path} className="grid grid-cols-2 gap-2 px-3 pb-3">
          <div className="grid min-w-0 gap-1">
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={period.from} required />
          </div>
          <div className="grid min-w-0 gap-1">
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={period.to} required />
          </div>
          <Button type="submit" className="col-span-2 h-11">
            Show
          </Button>
        </Form>
      </details>
    </div>
  );
}
