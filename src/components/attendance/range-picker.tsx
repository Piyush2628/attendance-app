"use client";

import { useState } from "react";
import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { presets, rangeLabel, shiftRange } from "@/lib/admin/calendar";
import { cn } from "@/lib/utils";

const CHIP = "rounded-lg border px-1 py-2 text-center text-sm font-medium whitespace-nowrap";
const CHIP_ON = "bg-primary text-primary-foreground border-primary";

/**
 * Quick picks (Today, Yesterday, This week, …), ‹ › arrows, and "Custom" that opens a from/to form.
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
  const quick = presets(today);
  const isPreset = quick.some((p) => p.from === from && p.to === to);
  // One employee's page already has a Custom tab, so there the dates form is always shown.
  const [open, setCustomOpen] = useState(!isPreset);
  const customOpen = Boolean(employeeId) || open;
  const prev = shiftRange(from, to, -1);
  const next = shiftRange(from, to, 1);
  const nextIsFuture = next.from > today;
  const what = from === to ? "day" : "period";

  return (
    <div className="grid gap-3 rounded-xl border p-3">
      <div className="grid grid-cols-3 gap-2" data-testid="range-presets">
        {quick.map((p) => {
          const active = (employeeId || !customOpen) && p.from === from && p.to === to;
          return (
            <Link
              key={p.key}
              href={href(p.from, p.to)}
              onClick={() => setCustomOpen(false)}
              aria-current={active ? "true" : undefined}
              className={cn(CHIP, active ? CHIP_ON : "text-muted-foreground")}
            >
              {p.label}
            </Link>
          );
        })}
        {!employeeId && (
          <button
            type="button"
            onClick={() => setCustomOpen((o) => !o)}
            aria-expanded={customOpen}
            className={cn(CHIP, customOpen ? CHIP_ON : "text-muted-foreground")}
          >
            Custom
          </button>
        )}
      </div>

      {customOpen && (
        <Form key={`${from}-${to}`} action="/admin/attendance" className="grid grid-cols-2 gap-2" data-testid="custom-range">
          {employeeId && <input type="hidden" name="e" value={employeeId} />}
          <div className="grid min-w-0 gap-1">
            <Label htmlFor="range-from">From</Label>
            <Input
              id="range-from"
              name="from"
              type="date"
              defaultValue={from}
              max={today}
              required
              className="block h-11 appearance-none"
            />
          </div>
          <div className="grid min-w-0 gap-1">
            <Label htmlFor="range-to">To</Label>
            <Input
              id="range-to"
              name="to"
              type="date"
              defaultValue={to}
              max={today}
              required
              className="block h-11 appearance-none"
            />
          </div>
          <Button type="submit" className="col-span-2 h-11">
            Show
          </Button>
        </Form>
      )}

      <div className="flex items-center justify-between border-t pt-2">
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
    </div>
  );
}
