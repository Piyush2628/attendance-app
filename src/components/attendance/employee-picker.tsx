"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { NativeSelect } from "@/components/ui/native-select";

/** Switches the attendance page to another employee, keeping the view and date. */
export function EmployeePicker({
  workers,
  selected,
  query,
}: {
  workers: { id: string; name: string; is_active: boolean }[];
  selected: string;
  /** The rest of the query string (view, date). */
  query: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="relative">
      <NativeSelect
        aria-label="Employee"
        className="h-12 text-base font-semibold"
        value={selected}
        onChange={(e) => startTransition(() => router.push(`/admin/attendance?e=${e.target.value}&${query}`))}
      >
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
