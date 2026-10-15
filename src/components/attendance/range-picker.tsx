import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { presets, rangeLabel, shiftRange } from "@/lib/admin/calendar";
import { cn } from "@/lib/utils";

/**
 * Quick picks (Today, Yesterday, This week, …), ‹ › arrows and a custom from/to range.
 * Navigates to /admin/attendance?from=&to=, plus `e` when looking at one employee.
 */
export function RangePicker({
  from,
  to,
  today,
  employeeId,
}: {
  from: string;
  to: string;
  today: string;
  employeeId?: string;
}) {
  const href = (f: string, t: string) =>
    `/admin/attendance?${employeeId ? `e=${employeeId}&` : ""}from=${f}&to=${t}`;
  const prev = shiftRange(from, to, -1);
  const next = shiftRange(from, to, 1);
  const nextIsFuture = next.from > today;
  const what = from === to ? "day" : "period";

  return (
    <div className="grid gap-3 rounded-xl border p-3">
      <div className="flex flex-wrap gap-2" data-testid="range-presets">
        {presets(today).map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <Link
              key={p.key}
              href={href(p.from, p.to)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                active ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
              )}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="icon" aria-label={`Previous ${what}`}>
          <Link href={href(prev.from, prev.to)}>
            <ChevronLeft />
          </Link>
        </Button>
        <div className="text-center text-lg font-semibold" data-testid="range-label">
          {rangeLabel(from, to)}
        </div>
        <Button asChild variant="ghost" size="icon" aria-label={`Next ${what}`}>
          <Link
            href={href(next.from, next.to)}
            aria-disabled={nextIsFuture}
            tabIndex={nextIsFuture ? -1 : undefined}
            className={nextIsFuture ? "pointer-events-none opacity-30" : ""}
          >
            <ChevronRight />
          </Link>
        </Button>
      </div>

      <Form key={`${from}-${to}`} action="/admin/attendance" className="flex flex-wrap items-end gap-2">
        {employeeId && <input type="hidden" name="e" value={employeeId} />}
        <div className="grid min-w-0 flex-1 gap-1">
          <Label htmlFor="range-from">From</Label>
          <Input id="range-from" name="from" type="date" defaultValue={from} max={today} required className="min-w-32" />
        </div>
        <div className="grid min-w-0 flex-1 gap-1">
          <Label htmlFor="range-to">To</Label>
          <Input id="range-to" name="to" type="date" defaultValue={to} max={today} required className="min-w-32" />
        </div>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </Form>
    </div>
  );
}
