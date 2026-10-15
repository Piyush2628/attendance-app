"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { NativeSelect } from "@/components/ui/native-select";

/** Switches the attendance page between all employees and one employee, keeping the dates. */
export function EmployeePicker({
  workers,
  selected,
  employeeQuery,
  allQuery,
}: {
  workers: { id: string; name: string; is_active: boolean }[];
  /** Employee id, or "" for all employees. */
  selected: string;
  /** Query string (dates) used when switching to one employee. */
  employeeQuery: string;
  /** Query string (from, to) used when switching to all employees. */
  allQuery: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="relative">
      <NativeSelect
        aria-label="Employee"
        className="h-12 text-base font-semibold"
        value={selected}
        onChange={(e) => {
          const id = e.target.value;
          const href = id ? `/admin/attendance?e=${id}&${employeeQuery}` : `/admin/attendance?${allQuery}`;
          startTransition(() => router.push(href));
        }}
      >
        <option value="">All employees</option>
        {workers.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
            {w.is_active ? "" : " (inactive)"}
          </option>
        ))}
      </NativeSelect>
      {pending && <Loader2 className="text-muted-foreground absolute top-3.5 right-9 size-5 animate-spin" />}
    </div>
  );
}
