"use client";

import { createContext, useContext, useState } from "react";

import type { FilterStatus } from "@/components/attendance/day-state";
import { cn } from "@/lib/utils";

const LABEL: Record<FilterStatus, string> = { present: "present", half: "half day", absent: "absent" };

const Ctx = createContext<{ filter: FilterStatus | null; toggle: (s: FilterStatus) => void }>({
  filter: null,
  toggle: () => {},
});

/**
 * Tap Present / Half day / Absent to see only those employees; tap again (or "Show all") to clear.
 * Rows are rendered on the server and hidden with CSS, so the filter is instant.
 */
export function StatusFilter({ children }: { children: React.ReactNode }) {
  const [filter, setFilter] = useState<FilterStatus | null>(null);
  const toggle = (s: FilterStatus) => setFilter((f) => (f === s ? null : s));
  return (
    <Ctx.Provider value={{ filter, toggle }}>
      <div data-filter={filter ?? undefined} className="group/filter contents">
        {children}
      </div>
    </Ctx.Provider>
  );
}

/** A tappable status box or column header. Disabled when nobody is in it. */
export function FilterButton({
  status,
  empty,
  className,
  onClassName,
  children,
}: {
  status: FilterStatus;
  empty?: boolean;
  className?: string;
  onClassName?: string;
  children: React.ReactNode;
}) {
  const { filter, toggle } = useContext(Ctx);
  const on = filter === status;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={empty && !on}
      onClick={() => toggle(status)}
      className={cn(
        "cursor-pointer transition-[box-shadow,opacity] disabled:cursor-default",
        filter && !on && "opacity-50",
        className,
        on && onClassName,
      )}
    >
      {children}
    </button>
  );
}

/** "Only absent · Show all" while a filter is on. */
export function FilterNote() {
  const { filter, toggle } = useContext(Ctx);
  if (!filter) return null;
  return (
    <p className="-mt-2 text-center text-sm">
      <span className="text-muted-foreground">Only {LABEL[filter]} · </span>
      <button type="button" onClick={() => toggle(filter)} className="font-semibold underline underline-offset-2">
        Show all
      </button>
    </p>
  );
}
